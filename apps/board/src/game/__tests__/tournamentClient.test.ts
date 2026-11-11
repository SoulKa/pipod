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

describe('participant updates', () => {
  it('refresh the seats without touching the dispatched assignment', async () => {
    const client = await freshClient()
    client.connect('192.168.0.5')
    sockets[0]!.fire('connect')
    const ann = { id: 'p1', name: 'Ann', avatar: null }
    const bob = { id: 'p2', name: 'Bob', avatar: null }
    sockets[0]!.fire('match:assigned', { match: { id: 'm1' }, participants: [ann, bob] })
    const dispatched = client.assignment.value

    const fox = { kind: 'emoji', emoji: '🦊' } as const
    sockets[0]!.fire('participant:updated', { ...bob, tournamentId: 't1', seed: null, avatar: fox })

    // A new assignment would restart the match; only the seats change.
    expect(client.assignment.value).toBe(dispatched)
    expect(client.assignment.value?.participants[1]).toEqual(bob)
    expect(client.seats.value).toEqual([ann, { ...bob, avatar: fox }])
  })
})

describe('choosing a tournament', () => {
  function serve(body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => body })),
    )
  }

  it('lists only open tournaments', async () => {
    serve([
      { id: 't1', name: 'Planned', status: 'setup' },
      { id: 't2', name: 'Running', status: 'active' },
      { id: 't3', name: 'Done', status: 'completed' },
      { id: 't4', name: 'Called off', status: 'cancelled' },
    ])
    const client = await freshClient()
    client.connect('192.168.0.5')
    sockets[0]!.fire('connect')
    await vi.waitFor(() => expect(client.tournaments.value).toHaveLength(2))

    expect(client.tournaments.value.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('refuses a closed tournament, e.g. from a saved launch link', async () => {
    serve({ tournament: { id: 't3', status: 'completed' }, floors: [{ id: 'f1' }] })
    const client = await freshClient()
    client.connect('192.168.0.5')

    await expect(client.selectTournament('t3')).resolves.toBe(false)
    expect(client.selectError.value).toBe('this tournament is over')
    expect(client.tournamentId.value).toBe('')
    expect(client.floors.value).toEqual([])
  })

  it('drops a refusal when connecting to another server', async () => {
    serve({ tournament: { id: 't3', status: 'completed' }, floors: [] })
    const client = await freshClient()
    client.connect('192.168.0.5')
    await client.selectTournament('t3')

    client.connect('192.168.0.9')

    expect(client.selectError.value).toBe('')
  })

  it('loads the floors of an open tournament', async () => {
    serve({ tournament: { id: 't2', status: 'active' }, floors: [{ id: 'f1' }] })
    const client = await freshClient()
    client.connect('192.168.0.5')

    await expect(client.selectTournament('t2')).resolves.toBe(true)
    expect(client.floors.value).toEqual([{ id: 'f1' }])
    expect(client.selectError.value).toBe('')
  })
})

describe('reportLegResult', () => {
  async function connectedClient() {
    const client = await freshClient()
    client.connect('192.168.0.5')
    sockets[0]!.fire('connect')
    client.assignment.value = {
      match: { id: 'm1' } as never,
      participants: [
        { id: 'p1', name: 'Ann', avatar: null },
        { id: 'p2', name: 'Bob', avatar: null },
      ],
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

describe('picking a floor', () => {
  async function pickingClient(occupied: string[] = []) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          tournament: { id: 't1', status: 'active' },
          floors: [{ id: 'f1' }, { id: 'f2' }],
          occupiedFloorIds: occupied,
        }),
      })),
    )
    const client = await freshClient()
    client.connect('192.168.0.5')
    sockets[0]!.fire('connect')
    await client.selectTournament('t1')
    return { client, socket: sockets[0]! }
  }

  it('knows which floors another board holds', async () => {
    const { client } = await pickingClient(['f1'])

    expect(client.occupiedFloorIds.value).toEqual(['f1'])
  })

  it('joins the floor only once the server accepts it', async () => {
    const { client, socket } = await pickingClient()
    const picked = client.selectFloor('f1')
    expect(client.floorId.value).toBe('')

    socket.ack('board:register', null, { ok: true })

    await expect(picked).resolves.toBe(true)
    expect(client.floorId.value).toBe('f1')
  })

  it('stays off a floor the server refuses, and reloads who holds what', async () => {
    const { client, socket } = await pickingClient()
    const picked = client.selectFloor('f1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          tournament: { id: 't1', status: 'active' },
          floors: [{ id: 'f1' }, { id: 'f2' }],
          occupiedFloorIds: ['f1'],
        }),
      })),
    )

    socket.ack('board:register', null, {
      ok: false,
      message: 'another board is already connected to this floor',
    })

    await expect(picked).resolves.toBe(false)
    expect(client.floorId.value).toBe('')
    expect(client.selectError.value).toBe('another board is already connected to this floor')
    await vi.waitFor(() => expect(client.occupiedFloorIds.value).toEqual(['f1']))
    // Nothing to replay on a reconnect: the board never got the floor.
    socket.fire('connect')
    expect(socket.events('board:register')).toHaveLength(1)
  })

  it('drops back to the picker when the floor is gone after a reconnect', async () => {
    const { client, socket } = await pickingClient()
    void client.selectFloor('f1')
    socket.ack('board:register', null, { ok: true })

    socket.fire('connect')
    socket.ack('board:register', null, {
      ok: false,
      message: 'another board is already connected to this floor',
    })

    expect(client.floorId.value).toBe('')
  })

  it('takes the floor when a server too old to answer stays silent', async () => {
    const { client, socket } = await pickingClient()
    const picked = client.selectFloor('f1')

    socket.ack('board:register', new Error('operation has timed out'))

    await expect(picked).resolves.toBe(true)
    expect(client.floorId.value).toBe('f1')
  })

  it('ignores the answer to a pick that a newer one replaced', async () => {
    const { client, socket } = await pickingClient()
    const first = client.selectFloor('f1')
    const firstAck = socket.events('board:register')[0]!.args.at(-1) as (
      err: Error | null,
      res?: unknown,
    ) => void
    const second = client.selectFloor('f2')

    firstAck(null, { ok: false, message: 'another board is already connected to this floor' })
    socket.ack('board:register', null, { ok: true })

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(true)
    expect(client.floorId.value).toBe('f2')
    expect(client.selectError.value).toBe('')
  })
})

describe('end of the tournament', () => {
  async function joinedClient() {
    const client = await freshClient()
    client.connect('192.168.0.5')
    sockets[0]!.fire('connect')
    client.tournamentId.value = 't1'
    void client.selectFloor('f1')
    sockets[0]!.ack('board:register', null, { ok: true })
    return { client, socket: sockets[0]! }
  }

  const bob = { id: 'p2', name: 'Bob', avatar: null }

  it('remembers the champion of the joined tournament', async () => {
    const { client, socket } = await joinedClient()
    socket.fire('tournament:over', { tournamentId: 'other', champion: bob })
    expect(client.over.value).toBeNull()

    socket.fire('tournament:over', { tournamentId: 't1', champion: bob })

    expect(client.over.value).toEqual({ tournamentId: 't1', champion: bob })
  })

  it('leaves the tournament and stops re-registering on it', async () => {
    const { client, socket } = await joinedClient()
    socket.fire('tournament:over', { tournamentId: 't1', champion: bob })

    client.leaveTournament()
    socket.fire('connect')

    expect(client.over.value).toBeNull()
    expect(client.tournamentId.value).toBe('')
    expect(client.floorId.value).toBe('')
    expect(socket.events('board:register')).toHaveLength(1)
  })
})
