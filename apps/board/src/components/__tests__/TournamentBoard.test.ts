import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardGameSnapshot, Match } from '@pipod/shared'

type Handler = (...args: unknown[]) => void

/** Same stand-in as the tournamentClient tests: records emits, replays events. */
class FakeSocket {
  handlers = new Map<string, Handler[]>()
  emitted: { event: string; args: unknown[] }[] = []
  connected = false

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
    return this
  }

  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }

  events(name: string) {
    return this.emitted.filter((entry) => entry.event === name)
  }

  ack(name: string, error: Error | null, response?: unknown) {
    const last = this.events(name).at(-1)!
    ;(last.args.at(-1) as (err: Error | null, res?: unknown) => void)(error, response)
  }
}

const sockets: FakeSocket[] = []

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new FakeSocket()
    sockets.push(socket)
    return socket
  },
}))

const MATCH: Match = {
  id: 'match-1',
  tournamentId: 't1',
  stageId: 's1',
  groupId: null,
  round: 0,
  slot: 0,
  participantAId: 'pa',
  participantBId: 'pb',
  bestOf: 1,
  startScore: 301,
  outMode: 'single',
  floorId: 'f1',
  queueOrder: 0,
  status: 'live',
  legsA: 0,
  legsB: 0,
  winnerId: null,
  nextMatchId: null,
  nextSlot: null,
}

/** A snapshot of the assigned leg in which seat 0 has just checked out. */
function finishedLeg(): BoardGameSnapshot {
  return {
    phase: 'playing',
    options: { startScore: 301, outMode: 'single' },
    players: [
      { name: 'Alice', score: 0, lastThrows: [] },
      { name: 'Bob', score: 120, lastThrows: [] },
    ],
    currentPlayerIndex: 0,
    currentThrows: [],
    finishOrder: [0],
    bannerIndex: 0,
    history: [],
    tournament: {
      activeMatchId: MATCH.id,
      participantIds: ['pa', 'pb'],
      legIndex: 0,
      legsA: 0,
      legsB: 0,
    },
  }
}

/** Mount the board, connect it to a fake server, and play into a finished leg. */
async function mountAtLegEnd() {
  vi.resetModules()
  sockets.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  )

  const { useTournamentClient } = await import('../../game/tournamentClient')
  const TournamentBoard = (await import('../TournamentBoard.vue')).default
  const client = useTournamentClient()
  const wrapper = mount(TournamentBoard, { attachTo: document.body })

  client.connect('192.168.0.5')
  const socket = sockets[0]!
  socket.fire('connect')
  client.tournamentId.value = MATCH.tournamentId
  client.selectFloor(MATCH.floorId!)
  socket.fire('match:assigned', { match: MATCH, participants: [] })
  await wrapper.vm.$nextTick()
  socket.fire('board:session', { snapshot: finishedLeg(), revision: 1 })
  await wrapper.vm.$nextTick()

  const report = wrapper.findAll('button').find((b) => b.text().includes('Ergebnis'))!
  expect(report).toBeDefined()
  return { wrapper, socket, client, report }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('TournamentBoard leg reporting', () => {
  it('sends the leg result to the server', async () => {
    const { socket, report } = await mountAtLegEnd()
    await report.trigger('click')

    expect(socket.events('match:legResult')).toHaveLength(1)
    expect(socket.events('match:legResult')[0]!.args[0]).toMatchObject({
      matchId: MATCH.id,
      legIndex: 0,
      winnerId: 'pa',
    })
  })

  it('does not present an older connection error as a failed report', async () => {
    const { wrapper, client, report } = await mountAtLegEnd()
    client.errorMsg.value = 'snapshot revision conflict'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('snapshot revision conflict')
    expect(report.text()).toContain('Ergebnis')
  })

  it('stays on the result screen when the server rejects the report', async () => {
    const { wrapper, socket, report } = await mountAtLegEnd()
    await report.trigger('click')
    socket.ack('match:legResult', null, { ok: false, message: 'not assigned' })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('not assigned')
    const retry = wrapper.findAll('button').find((b) => b.text().includes('Ergebnis'))
    expect(retry).toBeDefined()
  })

  it('leaves tournament mode only after the server confirms the deciding leg', async () => {
    const { wrapper, socket, client, report } = await mountAtLegEnd()
    await report.trigger('click')
    expect(wrapper.text()).not.toContain('Board verbunden')

    socket.ack('match:legResult', null, { ok: true, match: { ...MATCH, status: 'completed' } })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(client.assignment.value).toBeNull()
    expect(wrapper.text()).toContain('Board verbunden')
  })

  it('keeps a match the server assigned while the report was in flight', async () => {
    const { wrapper, socket, client, report } = await mountAtLegEnd()
    const nextMatch: Match = { ...MATCH, id: 'match-2', bestOf: 3 }
    const clicked = report.trigger('click')

    // The finished match frees the floor, so the server dispatches the next one
    // before it acknowledges the leg.
    socket.fire('match:assigned', { match: nextMatch, participants: [] })
    socket.ack('match:legResult', null, { ok: true, match: { ...MATCH, status: 'completed' } })
    await clicked
    await wrapper.vm.$nextTick()

    expect(client.assignment.value?.match.id).toBe('match-2')
    expect(wrapper.text()).not.toContain('Board verbunden')
  })
})
