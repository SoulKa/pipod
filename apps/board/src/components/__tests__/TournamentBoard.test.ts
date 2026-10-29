import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardGameSnapshot, BoardTournamentState, Match, MatchAssignment } from '@pipod/shared'
import { TAP_GUARD_MS } from '@pipod/ui'

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

const PARTICIPANTS: MatchAssignment['participants'] = [
  { id: 'pa', name: 'Alice', avatar: null },
  { id: 'pb', name: 'Bob', avatar: null },
]

/** A snapshot of a leg in which seat 0 has just checked out. */
function finishedLeg(overrides: Partial<BoardTournamentState> = {}): BoardGameSnapshot {
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
      firstLegStarter: 0,
      ...overrides,
    },
  }
}

/** An untouched first leg of `matchId`, as the server seeds it before anyone has picked. */
function freshLeg(matchId: string): BoardGameSnapshot {
  const leg = finishedLeg({ activeMatchId: matchId, firstLegStarter: null })
  return {
    ...leg,
    players: leg.players.map((p) => ({ ...p, score: 301 })),
    finishOrder: [],
    bannerIndex: null,
  }
}

/** Mount the board and register it on the floor, with no match assigned yet. */
async function mountBoard() {
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
  return { wrapper, socket, client }
}

/** The starter screen's name buttons, in seat order. */
function starterButtons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.choice')
}

/** Let the tap guard of whatever just appeared run out, as a deliberate tap would. */
async function waitOutGuard(wrapper: ReturnType<typeof mount>) {
  // Render first: the guard's clock only starts once the new screen has mounted.
  await flushPromises()
  vi.advanceTimersByTime(TAP_GUARD_MS)
  await flushPromises()
}

function gameOnButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) => b.text() === 'Game on!')
}

function reportButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) => b.text().includes('Ergebnis'))
}

/** Confirm the match intro and land on the starter screen, ready to pick. */
async function confirmIntro(wrapper: ReturnType<typeof mount>) {
  await waitOutGuard(wrapper)
  await gameOnButton(wrapper)!.trigger('click')
  await waitOutGuard(wrapper)
}

/** Mount the board, connect it to a fake server, and play into a finished leg. */
async function mountAtLegEnd() {
  const { wrapper, socket, client } = await mountBoard()
  socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
  await flushPromises()
  socket.fire('board:session', { snapshot: finishedLeg(), revision: 1 })
  await waitOutGuard(wrapper)

  const report = reportButton(wrapper)!
  expect(report).toBeDefined()
  return { wrapper, socket, client, report }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  // Only timeouts: the tap guards run on them, and nothing here waits on anything else.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TournamentBoard match intro', () => {
  it('introduces the assigned match before asking who throws first', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', {
      match: { ...MATCH, bestOf: 5, startScore: 501, outMode: 'double' },
      participants: PARTICIPANTS,
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Bob')
    expect(wrapper.text()).toContain('Best of 5 Legs · 501 · Double-Out')
    expect(wrapper.text()).not.toContain('Wer beginnt?')

    await confirmIntro(wrapper)
    expect(wrapper.text()).toContain('Wer beginnt?')
    expect(socket.events('board:snapshot')).toHaveLength(0)
  })

  it("shows each player's picture, or their initials without one", async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', {
      match: MATCH,
      participants: [
        { id: 'pa', name: 'Alice', avatar: { kind: 'photo', version: 'abc123' } },
        { id: 'pb', name: 'Bob', avatar: null },
      ],
    })
    await flushPromises()

    const plates = wrapper.findAll('.plate')
    expect(plates[0]!.find('img').attributes('src')).toBe(
      'http://192.168.0.5:3000/api/participants/pa/avatar?v=abc123',
    )
    expect(plates[1]!.find('.initials').text()).toBe('B')
  })

  it('swaps in a picture changed while the intro is up, without restarting the match', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
    await flushPromises()

    socket.fire('participant:updated', {
      id: 'pb',
      tournamentId: MATCH.tournamentId,
      name: 'Bob',
      seed: null,
      avatar: { kind: 'emoji', emoji: '🦈' },
    })
    await flushPromises()

    expect(wrapper.findAll('.plate')[1]!.find('.emoji').text()).toBe('🦈')
    expect(wrapper.text()).toContain('Nächstes Match')
  })

  it('introduces the next match even when the server seeded a snapshot for it', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
    await flushPromises()
    await confirmIntro(wrapper)
    await starterButtons(wrapper)[0]!.trigger('click')
    socket.fire('board:session', { snapshot: finishedLeg(), revision: 1 })
    await waitOutGuard(wrapper)
    const report = reportButton(wrapper)!
    await report.trigger('click')
    socket.ack('match:legResult', null, { ok: true, match: { ...MATCH, status: 'completed' } })
    await flushPromises()

    // The server seeds an untouched leg for the next match before the board takes it over.
    const next: Match = { ...MATCH, id: 'match-2' }
    socket.fire('board:session', { snapshot: freshLeg(next.id), revision: 2 })
    socket.fire('match:assigned', { match: next, participants: PARTICIPANTS })
    await flushPromises()

    expect(gameOnButton(wrapper)).toBeDefined()
    expect(wrapper.text()).not.toContain('Wer beginnt?')
  })

  it('skips the intro when resuming a match already underway', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
    await flushPromises()
    socket.fire('board:session', { snapshot: finishedLeg(), revision: 1 })
    await flushPromises()

    expect(gameOnButton(wrapper)).toBeUndefined()
    expect(wrapper.text()).toContain('Ergebnis')
  })
})

describe('TournamentBoard tap guards', () => {
  it('ignores the report tap bouncing onto the next match the server swapped in', async () => {
    const { wrapper, socket, report } = await mountAtLegEnd()
    const clicked = report.trigger('click')
    socket.fire('match:assigned', {
      match: { ...MATCH, id: 'match-2' },
      participants: PARTICIPANTS,
    })
    socket.ack('match:legResult', null, { ok: true, match: { ...MATCH, status: 'completed' } })
    await clicked
    await flushPromises()

    // The bounce lands right away, before the new screen is armed.
    await gameOnButton(wrapper)!.trigger('click')
    expect(gameOnButton(wrapper)).toBeDefined()

    await confirmIntro(wrapper)
    expect(wrapper.text()).toContain('Wer beginnt?')
  })

  it('ignores a starter pick that lands as the starter screen appears', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
    await flushPromises()
    await waitOutGuard(wrapper)
    await gameOnButton(wrapper)!.trigger('click')
    await flushPromises()

    await starterButtons(wrapper)[0]!.trigger('click')
    expect(socket.events('board:snapshot')).toHaveLength(0)
    expect(wrapper.text()).toContain('Wer beginnt?')
  })

  it('ignores the report tap bouncing onto the next leg', async () => {
    const { wrapper, socket } = await mountBoard()
    const bestOfThree: Match = { ...MATCH, bestOf: 3 }
    socket.fire('match:assigned', { match: bestOfThree, participants: PARTICIPANTS })
    await flushPromises()
    await confirmIntro(wrapper)
    await starterButtons(wrapper)[0]!.trigger('click')
    socket.fire('board:session', { snapshot: finishedLeg(), revision: 1 })
    await waitOutGuard(wrapper)
    await reportButton(wrapper)!.trigger('click')
    socket.ack('match:legResult', null, { ok: true, match: { ...bestOfThree, legsA: 1 } })
    await flushPromises()

    const pad20 = () => wrapper.findAll('button').find((b) => b.text() === '20')!
    const saves = socket.events('board:snapshot').length
    await pad20().trigger('click')
    expect(socket.events('board:snapshot')).toHaveLength(saves)

    await waitOutGuard(wrapper)
    await pad20().trigger('click')
    expect(socket.events('board:snapshot')).toHaveLength(saves + 1)
  })

  it('ignores a report tap that lands as the result card appears', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
    await flushPromises()
    socket.fire('board:session', { snapshot: finishedLeg(), revision: 1 })
    await flushPromises()

    const report = reportButton(wrapper)!
    await report.trigger('click')
    expect(socket.events('match:legResult')).toHaveLength(0)
  })
})

describe('TournamentBoard starting player', () => {
  it('asks who throws first instead of starting the assigned match', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
    await flushPromises()
    await confirmIntro(wrapper)

    expect(wrapper.text()).toContain('Wer beginnt?')
    expect(starterButtons(wrapper).map((b) => b.text())).toEqual(['Alice', 'Bob'])
    // Nothing is committed until someone picks, so a reload just asks again.
    expect(socket.events('board:snapshot')).toHaveLength(0)
  })

  it('starts the leg with the chosen seat and records the choice', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
    await flushPromises()
    await confirmIntro(wrapper)
    await starterButtons(wrapper)[1]!.trigger('click')

    const saved = socket.events('board:snapshot').at(-1)!.args[0] as {
      snapshot: BoardGameSnapshot
    }
    expect(saved.snapshot.currentPlayerIndex).toBe(1)
    expect(saved.snapshot.tournament?.firstLegStarter).toBe(1)
    expect(saved.snapshot.players.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    await flushPromises()
    expect(wrapper.text()).not.toContain('Wer beginnt?')
  })

  it('alternates the throw in the next leg of the same match', async () => {
    const { wrapper, socket } = await mountBoard()
    const bestOfThree: Match = { ...MATCH, bestOf: 3 }
    socket.fire('match:assigned', { match: bestOfThree, participants: PARTICIPANTS })
    await flushPromises()
    await confirmIntro(wrapper)
    await starterButtons(wrapper)[1]!.trigger('click')

    // Seat 1 started leg 0 and seat 0 won it; leg 1 goes back to seat 0.
    socket.fire('board:session', {
      snapshot: finishedLeg({ firstLegStarter: 1 }),
      revision: 1,
    })
    await waitOutGuard(wrapper)
    const report = reportButton(wrapper)!
    await report.trigger('click')
    socket.ack('match:legResult', null, { ok: true, match: { ...bestOfThree, legsA: 1 } })
    await flushPromises()

    const saved = socket.events('board:snapshot').at(-1)!.args[0] as {
      snapshot: BoardGameSnapshot
    }
    expect(saved.snapshot.tournament?.legIndex).toBe(1)
    expect(saved.snapshot.currentPlayerIndex).toBe(0)
    expect(saved.snapshot.tournament?.firstLegStarter).toBe(1)
    expect(wrapper.text()).not.toContain('Wer beginnt?')
  })

  it('does not interrupt a leg that is already underway without a stored choice', async () => {
    const { wrapper, socket } = await mountBoard()
    socket.fire('match:assigned', { match: MATCH, participants: PARTICIPANTS })
    await flushPromises()
    socket.fire('board:session', {
      snapshot: finishedLeg({ firstLegStarter: null }),
      revision: 1,
    })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Wer beginnt?')
    expect(wrapper.text()).toContain('Ergebnis')
  })

  it('asks again once the match is over', async () => {
    const { wrapper, socket, client } = await mountAtLegEnd()
    await reportButton(wrapper)!.trigger('click')
    socket.ack('match:legResult', null, { ok: true, match: { ...MATCH, status: 'completed' } })
    await flushPromises()

    expect(client.assignment.value).toBeNull()
    socket.fire('match:assigned', {
      match: { ...MATCH, id: 'match-2' },
      participants: PARTICIPANTS,
    })
    await flushPromises()
    await confirmIntro(wrapper)
    expect(wrapper.text()).toContain('Wer beginnt?')
  })
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
    await flushPromises()

    expect(wrapper.text()).not.toContain('snapshot revision conflict')
    expect(report.text()).toContain('Ergebnis')
  })

  it('stays on the result screen when the server rejects the report', async () => {
    const { wrapper, socket, report } = await mountAtLegEnd()
    await report.trigger('click')
    socket.ack('match:legResult', null, { ok: false, message: 'not assigned' })
    await flushPromises()

    expect(wrapper.text()).toContain('not assigned')
    const retry = reportButton(wrapper)
    expect(retry).toBeDefined()
  })

  it('leaves tournament mode only after the server confirms the deciding leg', async () => {
    const { wrapper, socket, client, report } = await mountAtLegEnd()
    await report.trigger('click')
    expect(wrapper.text()).not.toContain('Board verbunden')

    socket.ack('match:legResult', null, { ok: true, match: { ...MATCH, status: 'completed' } })
    await flushPromises()

    expect(client.assignment.value).toBeNull()
    expect(wrapper.text()).toContain('Board verbunden')
  })

  it('keeps a match the server assigned while the report was in flight', async () => {
    const { wrapper, socket, client, report } = await mountAtLegEnd()
    const nextMatch: Match = { ...MATCH, id: 'match-2', bestOf: 3 }
    const clicked = report.trigger('click')

    // The finished match frees the floor, so the server dispatches the next one
    // before it acknowledges the leg.
    socket.fire('match:assigned', { match: nextMatch, participants: PARTICIPANTS })
    socket.ack('match:legResult', null, { ok: true, match: { ...MATCH, status: 'completed' } })
    await clicked
    await flushPromises()

    expect(client.assignment.value?.match.id).toBe('match-2')
    expect(wrapper.text()).not.toContain('Board verbunden')
  })
})
