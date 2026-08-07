import { describe, expect, it } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { createLogger, PrettyLogController, type PrettyLoggerOptions } from './logger'

/** A logger writing into an array, with a pinned clock so lines are comparable. */
function testLogger(opts: PrettyLoggerOptions = {}) {
  const lines: string[] = []
  const logger = createLogger({
    colors: false,
    now: () => new Date(2026, 0, 2, 12, 4, 31),
    write: (line) => lines.push(line),
    ...opts,
  })
  return { logger, lines }
}

describe('createLogger', () => {
  it('prints a timestamp, padded level and message', () => {
    const { logger, lines } = testLogger()

    logger.info('piPod server listening on http://0.0.0.0:3000')

    expect(lines).toEqual(['12:04:31 INFO  piPod server listening on http://0.0.0.0:3000'])
  })

  it('renders structured fields as key=value and hides Fastify internals', () => {
    const { logger, lines } = testLogger()

    logger.warn({ reqId: 'req-1', req: { huge: true }, tournamentId: 'abc', legs: 3 }, 'floor idle')

    expect(lines[0]).toBe('12:04:31 WARN  floor idle tournamentId=abc legs=3')
  })

  it('appends the stack of a logged error, indented under the message', () => {
    const { logger, lines } = testLogger()
    const err = new Error('no such match: 9')
    err.stack = 'Error: no such match: 9\n    at reportMatch (services/matches.ts:88)'

    logger.error({ err }, 'POST /api/matches/9/report 500 4ms')

    expect(lines[0]).toBe(
      [
        '12:04:31 ERROR POST /api/matches/9/report 500 4ms',
        '               Error: no such match: 9',
        '                   at reportMatch (services/matches.ts:88)',
      ].join('\n'),
    )
  })

  it('names the error class when there is no separate message', () => {
    const { logger, lines } = testLogger()
    const err = new TypeError('boom')
    err.stack = 'TypeError: boom\n    at somewhere (services/matches.ts:1)'

    logger.error(err)

    // The stack's header would only repeat the headline, so it is dropped.
    expect(lines[0]).toBe(
      [
        '12:04:31 ERROR TypeError: boom',
        '                   at somewhere (services/matches.ts:1)',
      ].join('\n'),
    )
  })

  it('aligns the continuation lines of a multi-line message', () => {
    const { logger, lines } = testLogger()

    logger.warn('first line\nsecond line')

    expect(lines[0]).toBe('12:04:31 WARN  first line\n               second line')
  })

  it('fills pino printf placeholders', () => {
    const { logger, lines } = testLogger()

    logger.info('reconciled %d tournament(s) for %s', 2, 'group-a')

    expect(lines[0]).toBe('12:04:31 INFO  reconciled 2 tournament(s) for group-a')
  })

  it('appends arguments that have no placeholder', () => {
    const { logger, lines } = testLogger()
    // pino's types derive the argument tuple from the message's placeholders, so a
    // surplus argument (which Fastify plugins do pass) needs the looser signature.
    const info = logger.info as (msg: string, ...args: unknown[]) => void

    info('plugin ready', 'v2')

    expect(lines[0]).toBe('12:04:31 INFO  plugin ready v2')
  })

  it('drops messages below the configured level', () => {
    const { logger, lines } = testLogger({ level: 'warn' })

    logger.debug('noise')
    logger.info('noise')
    logger.error('kept')

    expect(lines).toEqual(['12:04:31 ERROR kept'])
  })

  it('silences everything at level silent', () => {
    const { logger, lines } = testLogger({ level: 'silent' })

    logger.fatal('gone')

    expect(lines).toEqual([])
  })

  it('honours a level changed at runtime', () => {
    const { logger, lines } = testLogger({ level: 'info' })

    logger.level = 'error'
    logger.info('dropped')
    expect(logger.level).toBe('error')
    expect(lines).toEqual([])
  })

  it('colours the level tag when colours are enabled', () => {
    const { logger, lines } = testLogger({ colors: true })

    logger.warn('careful')

    expect(lines[0]).toContain('\u001B[33mWARN \u001B[0m')
  })
})

describe('PrettyLogController', () => {
  /** Minimal request/reply stand-ins: the controller only touches these fields. */
  function requestPair(overrides: { method?: string; url?: string; statusCode?: number } = {}) {
    const { logger, lines } = testLogger()
    const request = {
      method: overrides.method ?? 'GET',
      url: overrides.url ?? '/api/tournaments',
      log: logger,
    } as unknown as FastifyRequest
    const reply = {
      statusCode: overrides.statusCode ?? 200,
      elapsedTime: 3.4,
      log: logger,
    } as unknown as FastifyReply
    return { request, reply, lines }
  }

  it('logs nothing for an incoming request', () => {
    const controller = new PrettyLogController()
    const { request, reply, lines } = requestPair()

    controller.incomingRequest(request, reply)

    expect(lines).toEqual([])
  })

  it('collapses a completed request into one line', () => {
    const controller = new PrettyLogController()
    const { request, reply, lines } = requestPair({ method: 'POST', statusCode: 201 })

    controller.requestCompleted(null, request, reply)

    expect(lines).toEqual(['12:04:31 INFO  POST /api/tournaments 201 3ms'])
  })

  it('pads short methods so URLs line up', () => {
    const controller = new PrettyLogController()
    const { request, reply, lines } = requestPair({ method: 'GET' })

    controller.requestCompleted(null, request, reply)

    expect(lines[0]).toContain('GET  /api/tournaments')
  })

  it('raises the level for failing status codes', () => {
    const controller = new PrettyLogController()
    const notFound = requestPair({ statusCode: 404 })
    const broken = requestPair({ statusCode: 500 })

    controller.requestCompleted(null, notFound.request, notFound.reply)
    controller.requestCompleted(null, broken.request, broken.reply)

    expect(notFound.lines[0]).toContain('WARN ')
    expect(broken.lines[0]).toContain('ERROR')
  })

  it('reports a failed request at error level with its stack', () => {
    const controller = new PrettyLogController()
    const { request, reply, lines } = requestPair({ statusCode: 500 })
    const err = new Error('db is locked')

    controller.requestCompleted(err, request, reply)

    expect(lines[0]?.split('\n')[0]).toBe('12:04:31 ERROR GET  /api/tournaments 500 3ms')
    expect(lines[0]).toContain('Error: db is locked')
  })

  it('stays silent when request logging is disabled', () => {
    const controller = new PrettyLogController({ disableRequestLogging: true })
    const { request, reply, lines } = requestPair()

    controller.requestCompleted(null, request, reply)

    expect(lines).toEqual([])
  })
})
