import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...args: unknown[]) => void

/** Minimal stand-in for a socket.io client: records emits and lets tests fire events. */
class FakeSocket {
  handlers = new Map<string, Handler[]>()
  emitted: { event: string; args: unknown[] }[] = []
  disconnected = false
  connected = false

  constructor(public url: string) {}

  timeout() {
    return this
  }

  on(event: string, handler: Handler) {
    const list = this.handlers.get(event) ?? []
    list.push(handler)
    this.handlers.set(event, list)
    return this
  }

  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args })
    return this
  }

  disconnect() {
    this.disconnected = true
    return this
  }

  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }

  /** Invoke the ack of the last emit of `name`, socket.io style (error first). */
  ack(name: string, error: Error | null, response?: unknown) {
    const last = this.events(name).at(-1)!
    ;(last.args.at(-1) as (err: Error | null, res?: unknown) => void)(error, response)
  }

  events(name: string) {
    return this.emitted.filter((entry) => entry.event === name)
  }
}

const sockets: FakeSocket[] = []

vi.mock('socket.io-client', () => ({
  io: (url: string) => {
    const socket = new FakeSocket(url)
    sockets.push(socket)
    return socket
  },
}))

async function freshClient() {
  vi.resetModules()
  sockets.length = 0
  const { useTournamentClient } = await import('../tournamentClient')
  return useTournamentClient()
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  )
})

describe('tournamentClient', () => {
  it('keeps the live socket when reconnecting to the same host', async () => {
    const client = await freshClient()
    client.connect('192.168.0.5')
    const first = sockets[0]!
    first.fire('connect')

    // The wizard remounts (and calls connect again) whenever the board leaves
    // tournament mode — that must not tear down the registered socket.
    client.connect('192.168.0.5')

    expect(sockets).toHaveLength(1)
    expect(first.disconnected).toBe(false)
  })

  it('retries with a new socket when the previous attempt never connected', async () => {
    const client = await freshClient()
    client.connect('192.168.0.5')
    client.connect('192.168.0.5')

    expect(sockets).toHaveLength(2)
  })

  it('replaces the socket when the host changes', async () => {
    const client = await freshClient()
    client.connect('192.168.0.5')
    sockets[0]!.fire('connect')
    client.connect('192.168.0.9')

    expect(sockets).toHaveLength(2)
    expect(sockets[0]!.disconnected).toBe(true)
  })

  it('re-registers the board after the socket reconnects', async () => {
    const client = await freshClient()
    client.connect('192.168.0.5')
    const socket = sockets[0]!
    socket.fire('connect')
    client.tournamentId.value = 't1'
    client.selectFloor('f1')
    expect(socket.events('board:register')).toHaveLength(1)

    // A dropped transport reconnects the same socket instance; without a fresh
    // registration the server no longer authorizes snapshots or leg results.
    socket.fire('connect')

    expect(socket.events('board:register')).toHaveLength(2)
    expect(socket.events('board:register')[1]!.args[0]).toMatchObject({
      tournamentId: 't1',
      floorId: 'f1',
    })
  })
})

describe('reportLegResult', () => {
  async function connectedClient() {
    const client = await freshClient()
    client.connect('192.168.0.5')
    sockets[0]!.fire('connect')
    client.assignment.value = {
      match: { id: 'm1' } as never,
      participants: [],
    }
    return client
  }

  it('succeeds once the server confirms the leg', async () => {
    const client = await connectedClient()
    const pending = client.reportLegResult(0, 'p1')
    sockets[0]!.ack('match:legResult', null, { ok: true })

    await expect(pending).resolves.toEqual({ ok: true })
  })

  it('passes the rejection back instead of silently dropping the leg', async () => {
    const client = await connectedClient()
    const pending = client.reportLegResult(0, 'p1')
    sockets[0]!.ack('match:legResult', null, { ok: false, message: 'not assigned' })

    await expect(pending).resolves.toEqual({ ok: false, message: 'not assigned' })
  })

  it('fails when the server never acknowledges', async () => {
    const client = await connectedClient()
    const pending = client.reportLegResult(0, 'p1')
    sockets[0]!.ack('match:legResult', new Error('operation has timed out'))

    await expect(pending).resolves.toMatchObject({ ok: false })
  })

  it('leaves the connection error alone so it cannot resurface as a report failure', async () => {
    const client = await connectedClient()
    client.errorMsg.value = 'snapshot revision conflict'
    const pending = client.reportLegResult(0, 'p1')
    sockets[0]!.ack('match:legResult', null, { ok: true })
    await pending

    expect(client.errorMsg.value).toBe('snapshot revision conflict')
  })
})
