// End-to-end: a real Fastify + socket.io server, driven through a whole tournament by
// real websocket clients. The unit suites mock io on the server side and mock the
// socket on the board side, so nothing else proves the two halves actually talk.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Floor, Match, MatchAssignment, Participant, Stage, Tournament } from '@pipod/shared'
import type { RunningServer } from '../../server'
import { resetDb } from '../db'
import { api, startTestServer, waitUntil, type ApiClient } from './testServer'
import { BoardClient, SpectatorClient } from './clients'

const TEST_TIMEOUT_MS = 20_000

interface TournamentDetail {
  tournament: Tournament
  matches: Match[]
}

let server: RunningServer
let rest: ApiClient
/** Every client opened by a test, closed between tests so floors free up. */
let clients: { close: () => void }[] = []

beforeAll(async () => {
  server = await startTestServer()
  rest = api(server.url)
})

afterAll(async () => {
  await server.close()
})

beforeEach(() => {
  resetDb()
})

afterEach(() => {
  for (const client of clients) client.close()
  clients = []
})

async function openBoard(boardId: string, tournamentId: string, floorId: string) {
  const board = await BoardClient.connect(server.url, boardId)
  clients.push(board)
  await board.register(tournamentId, floorId)
  return board
}

async function openSpectator(tournamentId: string) {
  const spectator = await SpectatorClient.connect(server.url)
  clients.push(spectator)
  await spectator.subscribe(tournamentId)
  return spectator
}

async function createTournament(name: string, playerNames: string[], floorNames: string[]) {
  const tournament = await rest.post<Tournament>('/api/tournaments', { name })
  const roster: Participant[] = []
  for (const [index, playerName] of playerNames.entries()) {
    roster.push(
      await rest.post<Participant>(`/api/tournaments/${tournament.id}/participants`, {
        name: playerName,
        seed: index + 1,
      }),
    )
  }
  const floors: Floor[] = []
  for (const floorName of floorNames) {
    floors.push(
      await rest.post<Floor>(`/api/tournaments/${tournament.id}/floors`, { name: floorName }),
    )
  }
  await rest.post(`/api/tournaments/${tournament.id}/auto-assign`, { enabled: true })
  return { tournament, roster, floors }
}

/**
 * Play exactly the given matches as boards receive them. Boards poll for their next
 * assignment because the scheduler decides which floor gets what — with a round robin,
 * a floor legitimately idles when both its candidates' players are busy.
 *
 * Driving by id rather than by a count matters: the server dispatches the next round
 * the instant the last match of this one is reported, so a board can be handed a match
 * that belongs to a later phase. That one is stashed for the next call instead.
 */
async function playMatches(
  boards: BoardClient[],
  matchIds: string[],
  pickWinner: (assignment: MatchAssignment) => string,
): Promise<void> {
  const remaining = new Set(matchIds)
  await Promise.all(
    boards.map(async (board) => {
      while (remaining.size) {
        const assignment = await board.nextAssignment(300)
        if (!assignment) continue
        if (!remaining.has(assignment.match.id)) {
          // A board holds one match at a time, so it has nothing left to do here.
          board.stashAssignment(assignment)
          return
        }
        remaining.delete(assignment.match.id)
        await board.playMatch(pickWinner, assignment)
      }
    }),
  )
}

describe('full tournament over websockets', () => {
  it(
    'runs a group stage and knockout to completion',
    async () => {
      const { tournament, roster, floors } = await createTournament(
        'E2E Cup',
        ['Ann', 'Bob', 'Cid', 'Dee'],
        ['Floor 1', 'Floor 2'],
      )
      const [ann, bob] = roster as [Participant, Participant]
      const [floorOne, floorTwo] = floors as [Floor, Floor]

      // Seed order doubles as the result table: the better seed always wins its leg,
      // which makes both the group standings and the knockout seeding deterministic.
      const seedRank = new Map(roster.map((p, index) => [p.id, index]))
      const betterSeedWins = (assignment: MatchAssignment): string =>
        [...assignment.participants].sort((a, b) => seedRank.get(a.id)! - seedRank.get(b.id)!)[0]!
          .id

      const boardOne = await openBoard('board-1', tournament.id, floorOne.id)
      const boardTwo = await openBoard('board-2', tournament.id, floorTwo.id)
      const spectator = await openSpectator(tournament.id)

      const groupStage = await rest.post<Stage>(`/api/tournaments/${tournament.id}/stages`, {
        name: 'Group',
        type: 'group',
        format: 'round_robin',
        bestOf: 1,
        startScore: 501,
        outMode: 'double',
      })
      const groupMatches = await rest.post<Match[]>(`/api/stages/${groupStage.id}/generate`, {
        groupCount: 1,
      })
      expect(groupMatches).toHaveLength(6)

      await playMatches(
        [boardOne, boardTwo],
        groupMatches.map((match) => match.id),
        betterSeedWins,
      )

      // Every match is played, so the tournament reads completed even though the
      // operator still has a knockout stage to add.
      const afterGroups = await spectator.waitForState(
        (snapshot) =>
          snapshot.tournament.status === 'completed' &&
          snapshot.matches.every((match) => match.status === 'completed'),
      )
      expect(afterGroups.standings.map((standing) => standing.participantId)).toEqual(
        roster.map((p) => p.id),
      )
      expect(afterGroups.standings[0]).toMatchObject({ wins: 3, losses: 0, points: 6 })

      // The overview saw legs in flight, not just results.
      const groupIds = new Set(groupMatches.map((match) => match.id))
      expect(spectator.liveStates().some((state) => groupIds.has(state.matchId))).toBe(true)

      // All four qualify, so the bracket has two rounds — enough for a semifinal
      // winner to be advanced into the final's slot.
      const knockoutStage = await rest.post<Stage>(`/api/tournaments/${tournament.id}/stages`, {
        name: 'Knockout',
        type: 'knockout',
        format: 'single_elimination',
        bestOf: 3,
        startScore: 501,
        outMode: 'double',
      })
      const bracket = await rest.post<Match[]>(`/api/stages/${knockoutStage.id}/generate`, {
        qualifiersPerGroup: 4,
      })
      expect(bracket).toHaveLength(3)
      const finalId = bracket.find((match) => match.nextMatchId === null)!.id
      const semis = bracket.filter((match) => match.id !== finalId)
      expect(semis.every((match) => match.status === 'ready')).toBe(true)

      const reopened = await rest.get<TournamentDetail>(`/api/tournaments/${tournament.id}`)
      expect(reopened.tournament.status).toBe('active')

      await playMatches(
        [boardOne, boardTwo],
        semis.map((match) => match.id),
        betterSeedWins,
      )

      // Both semifinal winners were pushed into the final, which is now playable.
      const afterSemis = await rest.get<TournamentDetail>(`/api/tournaments/${tournament.id}`)
      const pendingFinal = afterSemis.matches.find((match) => match.id === finalId)!
      expect([pendingFinal.participantAId, pendingFinal.participantBId]).toEqual([ann.id, bob.id])
      expect(afterSemis.tournament.status).toBe('active')

      await playMatches([boardOne, boardTwo], [finalId], betterSeedWins)

      const detail = await rest.get<TournamentDetail>(`/api/tournaments/${tournament.id}`)
      const playedFinal = detail.matches.find((match) => match.id === finalId)!
      expect(playedFinal).toMatchObject({
        status: 'completed',
        winnerId: ann.id,
        legsA: 2,
        legsB: 0,
      })
      expect(detail.tournament.status).toBe('completed')

      const finalState = await spectator.waitForState(
        (snapshot) => snapshot.tournament.status === 'completed' && snapshot.matches.length === 9,
      )
      expect(finalState.matches.every((match) => match.status === 'completed')).toBe(true)

      // The floor that hosted the final is released, so its board falls back to
      // offline play instead of holding a finished match.
      const finalBoard = playedFinal.floorId === floorOne.id ? boardOne : boardTwo
      expect(finalBoard.session.snapshot).toBeNull()
      expect(finalBoard.errors()).toEqual([])
    },
    TEST_TIMEOUT_MS,
  )
})

describe('match-end race conditions over websockets', () => {
  /** A single live best-of-3 match on one floor, dispatched to a registered board. */
  async function liveMatch() {
    const { tournament, roster, floors } = await createTournament(
      'Race Cup',
      ['Ann', 'Bob'],
      ['Floor 1'],
    )
    const floor = floors[0]!
    const board = await openBoard('board-1', tournament.id, floor.id)
    const stage = await rest.post<Stage>(`/api/tournaments/${tournament.id}/stages`, {
      name: 'Final',
      type: 'knockout',
      format: 'single_elimination',
      bestOf: 3,
      startScore: 501,
      outMode: 'double',
    })
    await rest.post<Match[]>(`/api/stages/${stage.id}/generate`, {})
    const assignment = await board.nextAssignment()
    expect(assignment).not.toBeNull()
    return { tournament, roster, floor, board, assignment: assignment! }
  }

  it(
    'rejects a snapshot saved from a stale revision and returns the current session',
    async () => {
      const { board } = await liveMatch()
      const snapshot = board.session.snapshot!
      const staleRevision = board.session.revision - 1
      expect(staleRevision).toBeGreaterThanOrEqual(0)

      const response = await board.uploadSnapshot(snapshot, staleRevision)
      expect(response.ok).toBe(false)
      if (response.ok) throw new Error('expected the stale snapshot to be rejected')
      expect(response.message).toBe('snapshot revision conflict')
      expect(response.session?.revision).toBe(board.session.revision)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'acks a re-sent leg result without counting it twice',
    async () => {
      const { roster, board, assignment } = await liveMatch()
      const winnerId = roster[0]!.id

      const first = await board.reportLeg(assignment.match.id, 0, winnerId)
      expect(first.ok).toBe(true)
      const repeat = await board.reportLeg(assignment.match.id, 0, winnerId)
      expect(repeat.ok).toBe(true)
      if (!repeat.ok) throw new Error('expected the repeat to be acknowledged')
      expect(repeat.match.legsA).toBe(1)

      const detail = await rest.get<TournamentDetail>(
        `/api/tournaments/${assignment.match.tournamentId}`,
      )
      expect(detail.matches[0]).toMatchObject({ legsA: 1, legsB: 0, status: 'live' })
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'refuses a leg result from a board that never registered',
    async () => {
      const { roster, assignment } = await liveMatch()
      const stranger = await BoardClient.connect(server.url, 'stranger')
      clients.push(stranger)

      const response = await stranger.reportLeg(assignment.match.id, 0, roster[0]!.id)
      expect(response).toEqual({
        ok: false,
        message: 'this board is not assigned to the match',
      })
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'refuses a second board on an occupied floor',
    async () => {
      const { tournament, floor } = await liveMatch()
      const intruder = await BoardClient.connect(server.url, 'board-2')
      clients.push(intruder)

      intruder.sendRegister(tournament.id, floor.id)
      const message = await intruder.events.wait('error:message')
      expect(message).toBe('another board is already connected to this floor')
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'restores the live match to a board that reconnects mid-match',
    async () => {
      const { tournament, roster, floor, board, assignment } = await liveMatch()
      const ack = await board.playLeg(roster[0]!.id)
      expect(ack.ok).toBe(true)

      board.close()
      const floorRoom = `floor:${tournament.id}:${floor.id}`
      await waitUntil(() => !server.io.sockets.adapter.rooms.get(floorRoom)?.size, {
        label: 'the floor room to empty',
      })

      const reconnected = await openBoard('board-1', tournament.id, floor.id)
      expect(reconnected.session.snapshot?.tournament).toMatchObject({
        activeMatchId: assignment.match.id,
        legIndex: 1,
        legsA: 1,
        legsB: 0,
      })
      const restored = await reconnected.nextAssignment()
      expect(restored?.match.id).toBe(assignment.match.id)
    },
    TEST_TIMEOUT_MS,
  )
})
