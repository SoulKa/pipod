// Human-readable logging. Fastify's built-in pino logger emits JSON, which is unreadable
// when you're watching `yarn dev:server` or `docker logs` on the Pi, so we plug in our own
// logger instance plus a LogController that collapses each request into a single line.
import {
  LogController,
  type FastifyBaseLogger,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import { env } from './env'

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const

type Level = (typeof LEVELS)[number]

const RANK: Record<Level | 'silent', number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Number.POSITIVE_INFINITY,
}

/** ANSI colour per level, matching the dark slate/cyan feel of the apps. */
const COLOR: Record<Level, string> = {
  trace: '90',
  debug: '90',
  info: '36',
  warn: '33',
  error: '31',
  fatal: '1;31',
}

const DIM = '90'

/** ANSI only helps on an interactive terminal; piped/Docker output stays plain. */
const supportsColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

/** Fastify internals (and huge object graphs) rather than detail worth printing. */
const HIDDEN_FIELDS = new Set(['err', 'req', 'res', 'reqId'])

/** Width of the `12:04:31 INFO  ` prefix, so stack traces stay aligned under the message. */
const CONTINUATION_INDENT = ' '.repeat(15)

export interface PrettyLoggerOptions {
  /** Lowest level to emit; defaults to `LOG_LEVEL` (`info`). */
  level?: string
  /** Sink for finished lines; defaults to stdout. Tests capture it. */
  write?: (line: string) => void
  /** Force ANSI colours on or off instead of auto-detecting a terminal. */
  colors?: boolean
  /** Clock, so tests can pin the timestamp. */
  now?: () => Date
}

/**
 * A pino-shaped logger that prints `12:04:31 INFO  message key=value` instead of JSON.
 * Only the surface Fastify actually uses (`FastifyBaseLogger`) is implemented.
 */
export function createLogger(opts: PrettyLoggerOptions = {}): FastifyBaseLogger {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const colors = opts.colors ?? supportsColor
  const now = opts.now ?? (() => new Date())
  let level = normalizeLevel(opts.level ?? env.logLevel)

  const paint = (code: string, text: string) => (colors ? `\u001B[${code}m${text}\u001B[0m` : text)

  const emit =
    (target: Level) =>
    (first: unknown, ...rest: unknown[]): void => {
      if (RANK[target] < RANK[level]) return

      const { fields, message } = splitArgs(first, rest)
      const err = fields?.err instanceof Error ? fields.err : undefined
      // Fastify's error handler passes `err.message` as the message; naming the error class
      // instead is more useful, and lets the stack drop its now-duplicated header.
      const describesError = err !== undefined && (message === undefined || message === err.message)
      const headline = describesError ? `${err.name}: ${err.message}` : (message ?? '')

      const tag = paint(COLOR[target], target.toUpperCase().padEnd(5))
      let line = `${paint(DIM, formatTime(now()))} ${tag} ${indentFrom(headline, 1)}`

      const details = formatFields(fields, paint)
      if (details) line += ` ${details}`
      if (err) line += `\n${indentFrom(stack(err, describesError), 0)}`

      write(line)
    }

  const logger: FastifyBaseLogger = {
    get level() {
      return level
    },
    set level(next: string) {
      level = normalizeLevel(next)
    },
    trace: emit('trace'),
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
    fatal: emit('fatal'),
    silent: () => {},
    // Fastify binds a `{ reqId }` child logger per request. Request ids are noise on a
    // single-server LAN setup, and the request line already names method + url.
    child: () => logger,
  }

  return logger
}

/**
 * The process-wide logger, for services and socket handlers that have no request in
 * hand. Fastify logs through this same instance, so the ordering of lines is real.
 */
export const log = createLogger()

/**
 * Replaces Fastify's "incoming request" / "request completed" pair with one line per
 * request: `GET  /api/tournaments 200 3ms`.
 */
export class PrettyLogController extends LogController {
  incomingRequest(_request: FastifyRequest, _reply: FastifyReply): void {}

  requestCompleted(error: Error | null, request: FastifyRequest, reply: FastifyReply): void {
    if (this.isLogDisabled(request)) return

    const duration = Math.round(reply.elapsedTime)
    const line = `${request.method.padEnd(4)} ${request.url} ${reply.statusCode} ${duration}ms`
    // Level follows the status code so failures stand out while scrolling.
    if (error) {
      reply.log.error({ err: error }, line)
    } else if (reply.statusCode >= 500) {
      reply.log.error(line)
    } else if (reply.statusCode >= 400) {
      reply.log.warn(line)
    } else {
      reply.log.info(line)
    }
  }
}

/**
 * Pino accepts `(msg)`, `(fields, msg)`, `(err)` and `(err, msg)`, with printf-style args
 * trailing any of them — Fastify's internals use all of these shapes.
 */
function splitArgs(
  first: unknown,
  rest: unknown[],
): { fields?: Record<string, unknown>; message?: string } {
  let fields: Record<string, unknown> | undefined
  let head = first

  if (first instanceof Error) {
    fields = { err: first }
    head = rest.shift()
  } else if (isRecord(first)) {
    fields = first
    head = rest.shift()
  }

  if (head === undefined || head === null) return { fields }
  return { fields, message: interpolate(String(head), rest) }
}

/** Pino's printf-style placeholders; leftover arguments are appended. */
function interpolate(template: string, args: unknown[]): string {
  const remaining = [...args]
  const filled = template.replace(/%([sdifjoO%])/g, (match, token: string) => {
    if (token === '%') return '%'
    if (!remaining.length) return match
    const value = remaining.shift()
    if (token === 's') return String(value)
    if (token === 'd' || token === 'i') return String(Math.trunc(Number(value)))
    if (token === 'f') return String(Number(value))
    return stringify(value)
  })
  return remaining.length ? `${filled} ${remaining.map(stringify).join(' ')}` : filled
}

function formatFields(
  fields: Record<string, unknown> | undefined,
  paint: (code: string, text: string) => string,
): string {
  if (!fields) return ''
  return Object.entries(fields)
    .filter(([key, value]) => !HIDDEN_FIELDS.has(key) && value !== undefined)
    .map(([key, value]) => `${paint(DIM, `${key}=`)}${stringify(value)}`)
    .join(' ')
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value.includes(' ') ? JSON.stringify(value) : value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value)
  }
  if (value instanceof Error) return value.message
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    // Circular structures show up in Fastify internals; a placeholder beats throwing.
    return '[unserializable]'
  }
}

function formatTime(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

/**
 * Align every line from `skip` onwards under the message column, so multi-line messages
 * and stack traces keep their own nesting instead of falling back to column 0.
 */
function indentFrom(text: string, skip: number): string {
  return text
    .split('\n')
    .map((line, index) => (index < skip ? line : `${CONTINUATION_INDENT}${line}`))
    .join('\n')
}

/** The stack trace, minus the `Name: message` header when the message already said it. */
function stack(err: Error, headerIsRedundant: boolean): string {
  const trace = err.stack ?? `${err.name}: ${err.message}`
  if (!headerIsRedundant) return trace
  const header = `${err.name}: ${err.message}`
  return trace.startsWith(header) ? trace.slice(header.length).replace(/^\n/, '') : trace
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeLevel(value: string): Level | 'silent' {
  const candidate = value.toLowerCase()
  if (candidate === 'silent') return 'silent'
  return LEVELS.includes(candidate as Level) ? (candidate as Level) : 'info'
}
