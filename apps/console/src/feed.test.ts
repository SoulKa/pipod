import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Match } from '@pi-darts/shared'
import type { TournamentDetail } from './api'

// The feed talks to two collaborators — the REST client and the socket. Mock both
// so we can drive socket events by hand and assert how the feed patches its state.
const getTournament = vi.fn<(id: string) => Promise<TournamentDetail>>()
vi.mock('./api', () => ({ api: { getTournament: (id: string) => getTournament(id) } }))

type Handler = (...args: unknown[]) => void

class FakeSocket {
  private readonly handlers = new Map<string, Handler>()
  emit = vi.fn()
  disconnect = vi.fn()
  on(event: string, handler: Handler): this {
    this.handlers.set(event, handler)
    return this
  }
  /** Simulate the server pushing an event to the client. */
  fire(event: string, ...args: unknown[]): void {
    const handler = this.handlers.get(event)
    if (!handler) throw new Error(`no handler registered for "${event}"`)
    handler(...args)
  }
}

let socket: FakeSocket
vi.mock('./socket', () => ({ createSocket: () => socket }))

import { useTournamentFeed } from './feed'

function match(id: string, over: Partial<Match> = {}): Match {
  return {
    id,
    tournamentId: 't1',
    stageId: 's1',
    groupId: null,
    round: 0,
    slot: 0,
    participantAId: null,
    participantBId: null,
    bestOf: 3,
    startScore: 501,
    outMode: 'double',
    floorId: null,
    queueOrder: 0,
    status: 'ready',
    legsA: 0,
    legsB: 0,
    winnerId: null,
    nextMatchId: null,
    nextSlot: null,
    ...over,
  }
}

function detail(matches: Match[]): TournamentDetail {
  return {
    tournament: { id: 't1', name: 'Cup', status: 'active', autoAssign: false, createdAt: 'now' },
    floors: [],
    participants: [],
    stages: [],
    matches,
    groups: [],
  }
}

beforeEach(() => {
  socket = new FakeSocket()
  getTournament.mockReset()
})

describe('useTournamentFeed.open', () => {
  it('loads detail over REST and subscribes once connected', async () => {
    getTournament.mockResolvedValue(detail([match('m1')]))
    const feed = useTournamentFeed()

    await feed.open('t1')

    expect(getTournament).toHaveBeenCalledWith('t1')
    expect(feed.detail.value?.matches).toHaveLength(1)
    expect(feed.connected.value).toBe(false)

    socket.fire('connect')
    expect(feed.connected.value).toBe(true)
    expect(socket.emit).toHaveBeenCalledWith('tournament:subscribe', { tournamentId: 't1' })
  })

  it('clears connected on disconnect', async () => {
    getTournament.mockResolvedValue(detail([]))
    const feed = useTournamentFeed()
    await feed.open('t1')

    socket.fire('connect')
    socket.fire('disconnect')
    expect(feed.connected.value).toBe(false)
  })
})

describe('live patching', () => {
  it('replaces a known match in place on match:updated', async () => {
    getTournament.mockResolvedValue(detail([match('m1', { legsA: 0 })]))
    const feed = useTournamentFeed()
    await feed.open('t1')

    socket.fire('match:updated', match('m1', { legsA: 2, status: 'live' }))

    expect(feed.detail.value?.matches).toHaveLength(1)
    expect(feed.detail.value?.matches[0]?.legsA).toBe(2)
    expect(feed.detail.value?.matches[0]?.status).toBe('live')
  })

  it('appends an unknown match on match:updated', async () => {
    getTournament.mockResolvedValue(detail([match('m1')]))
    const feed = useTournamentFeed()
    await feed.open('t1')

    socket.fire('match:updated', match('m2'))

    expect(feed.detail.value?.matches.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('keys live scores by match id on match:live', async () => {
    getTournament.mockResolvedValue(detail([]))
    const feed = useTournamentFeed()
    await feed.open('t1')

    socket.fire('match:live', {
      matchId: 'm1',
      legIndex: 0,
      currentParticipantId: 'p1',
      scores: [],
      legsA: 0,
      legsB: 0,
    })

    expect(feed.live.value.get('m1')?.currentParticipantId).toBe('p1')
  })

  it('updates standings and refetches detail on tournament:state', async () => {
    getTournament.mockResolvedValue(detail([]))
    const feed = useTournamentFeed()
    await feed.open('t1')
    expect(getTournament).toHaveBeenCalledTimes(1)

    const standings = [
      {
        participantId: 'p1',
        played: 1,
        wins: 1,
        losses: 0,
        legsFor: 2,
        legsAgainst: 0,
        legDiff: 2,
        points: 2,
      },
    ]
    socket.fire('tournament:state', { standings })

    expect(feed.standings.value).toEqual(standings)
    // A fresh snapshot triggers a re-read of the full detail.
    expect(getTournament).toHaveBeenCalledTimes(2)
  })
})

describe('useTournamentFeed.close', () => {
  it('disconnects the socket', async () => {
    getTournament.mockResolvedValue(detail([]))
    const feed = useTournamentFeed()
    await feed.open('t1')

    feed.close()
    expect(socket.disconnect).toHaveBeenCalled()
  })
})
