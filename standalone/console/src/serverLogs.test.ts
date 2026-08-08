import { describe, expect, it, vi } from 'vitest'
import type { LogLine } from '@pipod/shared'

// The composable owns its socket, so stub the factory and drive the handlers by hand.
const handlers = new Map<string, (payload?: unknown) => void>()
const emitted: string[] = []
const disconnect = vi.fn()

vi.mock('./socket', () => ({
  createSocket: () => ({
    on: (event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler)
    },
    emit: (event: string) => {
      emitted.push(event)
    },
    disconnect,
  }),
}))

import { MAX_LOG_LINES, useServerLogs } from './serverLogs'

function line(seq: number, over: Partial<LogLine> = {}): LogLine {
  return { seq, time: '2026-08-08T10:00:00.000Z', level: 'info', message: `line ${seq}`, ...over }
}

function open() {
  handlers.clear()
  emitted.length = 0
  const logs = useServerLogs()
  logs.start()
  return {
    logs,
    connect: () => handlers.get('connect')?.(),
    disconnected: () => handlers.get('disconnect')?.(),
    push: (payload: LogLine) => handlers.get('log:line')?.(payload),
  }
}

describe('useServerLogs', () => {
  it('subscribes as soon as the socket connects', () => {
    const { logs, connect } = open()
    expect(emitted).toEqual([])

    connect()

    expect(emitted).toEqual(['logs:subscribe'])
    expect(logs.connected.value).toBe(true)
  })

  it('collects forwarded lines in arrival order', () => {
    const { logs, connect, push } = open()
    connect()

    push(line(1))
    push(line(2, { level: 'warn' }))

    expect(logs.lines.value.map((l) => l.seq)).toEqual([1, 2])
  })

  it('keeps only the most recent lines', () => {
    const { logs, connect, push } = open()
    connect()

    for (let seq = 1; seq <= MAX_LOG_LINES + 5; seq++) push(line(seq))

    expect(logs.lines.value).toHaveLength(MAX_LOG_LINES)
    expect(logs.lines.value[0]?.seq).toBe(6)
    expect(logs.lines.value.at(-1)?.seq).toBe(MAX_LOG_LINES + 5)
  })

  it('marks itself disconnected but keeps what it already had', () => {
    const { logs, connect, push, disconnected } = open()
    connect()
    push(line(1))

    disconnected()

    expect(logs.connected.value).toBe(false)
    expect(logs.lines.value).toHaveLength(1)
  })

  it('clears on request and closes the socket on stop', () => {
    const { logs, connect, push } = open()
    connect()
    push(line(1))

    logs.clear()
    logs.stop()

    expect(logs.lines.value).toEqual([])
    expect(disconnect).toHaveBeenCalled()
  })
})
