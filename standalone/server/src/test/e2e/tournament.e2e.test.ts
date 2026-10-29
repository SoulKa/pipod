// End-to-end: a real Fastify + socket.io server, driven through a whole tournament by
// real websocket clients. The unit suites mock io on the server side and mock the
// socket on the board side, so nothing else proves the two halves actually talk.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type {
  ConfigurePhasesInput,
  Floor,
  Match,
  MatchAssignment,
  Participant,
  Tournament,
  TournamentDetail,
} from '@pipod/shared'
import { AVATAR_PHOTO_MAX_BYTES } from '@pipod/shared'
import type { RunningServer } from '../../server'
import { resetDb } from '../db'
import { api, startTestServer, waitUntil, type ApiClient } from './testServer'
import { BoardClient, SpectatorClient } from './clients'

const TEST_TIMEOUT_MS = 20_000

const rules = { startScore: 501, outMode: 'double' } as const

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

/** Start a tournament with these phases; resolves with the first phase's matches. */
function start(tournamentId: string, phases: ConfigurePhasesInput): Promise<Match[]> {
  return rest.post<Match[]>(`/api/tournaments/${tournamentId}/start`, phases)
}

/** A one-match best-of-3 final, the smallest tournament there is. */
const finalOnly: ConfigurePhasesInput = {
  group: null,
  knockout: { ...rules, bestOf: 3, qualifiersPerGroup: 2 },
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

      // All four qualify, so the bracket has two rounds — enough for a semifinal
      // winner to be advanced into the final's slot.
      const groupMatches = await start(tournament.id, {
        group: { ...rules, bestOf: 1, groupCount: 1 },
        knockout: { ...rules, bestOf: 3, qualifiersPerGroup: 4 },
      })
      expect(groupMatches).toHaveLength(6)

      await playMatches(
        [boardOne, boardTwo],
        groupMatches.map((match) => match.id),
        betterSeedWins,
      )

      // The last group result draws the bracket from the final table on its own; the
      // tournament never reads completed in between.
      const afterGroups = await spectator.waitForState((snapshot) => snapshot.matches.length === 9)
      expect(afterGroups.tournament.status).toBe('active')
      expect(afterGroups.standings.map((standing) => standing.participantId)).toEqual(
        roster.map((p) => p.id),
      )
      expect(afterGroups.standings[0]).toMatchObject({ wins: 3, losses: 0, points: 6 })
      expect(spectator.states().some((snap) => snap.tournament.status === 'completed')).toBe(false)

      // The overview saw legs in flight, not just results.
      const groupIds = new Set(groupMatches.map((match) => match.id))
      expect(spectator.liveStates().some((state) => groupIds.has(state.matchId))).toBe(true)

      const bracket = afterGroups.matches.filter((match) => !groupIds.has(match.id))
      expect(bracket).toHaveLength(3)
      const finalId = bracket.find((match) => match.nextMatchId === null)!.id
      const semis = bracket.filter((match) => match.id !== finalId)
      expect(semis.every((match) => match.status !== 'pending')).toBe(true)
      // Seeded 1v4 and 2v3 from the table.
      expect(semis.map((m) => [m.participantAId, m.participantBId])).toEqual([
        [roster[0]!.id, roster[3]!.id],
        [roster[1]!.id, roster[2]!.id],
      ])

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

      // No snapshot ever showed a knockout match started next to an open group match.
      for (const snap of spectator.states()) {
        const groupOpen = snap.matches.some((m) => groupIds.has(m.id) && m.status !== 'completed')
        const knockoutStarted = snap.matches.some(
          (m) => !groupIds.has(m.id) && (m.status === 'live' || m.floorId !== null),
        )
        expect(groupOpen && knockoutStarted).toBe(false)
      }

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
    await start(tournament.id, finalOnly)
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
    'refuses a board joining a tournament that is over',
    async () => {
      const { tournament, roster, floor, board, assignment } = await liveMatch()
      await board.playMatch(() => roster[0]!.id, assignment)
      const detail = await rest.get<TournamentDetail>(`/api/tournaments/${tournament.id}`)
      expect(detail.tournament.status).toBe('completed')
      board.close()

      const late = await BoardClient.connect(server.url, 'board-2')
      clients.push(late)
      late.sendRegister(tournament.id, floor.id)
      const message = await late.events.wait('error:message')
      expect(message).toBe('this tournament is over')
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

describe('starting player over websockets', () => {
  /** A single live best-of-3 match on one floor, dispatched to a registered board. */
  async function liveMatch() {
    const { tournament, roster, floors } = await createTournament(
      'Starter Cup',
      ['Ann', 'Bob'],
      ['Floor 1'],
    )
    const floor = floors[0]!
    const board = await openBoard('board-1', tournament.id, floor.id)
    await start(tournament.id, finalOnly)
    const assignment = await board.nextAssignment()
    expect(assignment).not.toBeNull()
    return { tournament, roster, floor, board, assignment: assignment! }
  }

  it(
    'dispatches a match with nobody chosen, so the board asks',
    async () => {
      const { board } = await liveMatch()
      expect(board.session.snapshot?.tournament?.firstLegStarter).toBeNull()
      expect(board.session.snapshot?.currentPlayerIndex).toBe(0)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'alternates the throw into the next leg it seeds',
    async () => {
      const { roster, board } = await liveMatch()
      await board.chooseStarter(1)
      expect(board.session.snapshot?.currentPlayerIndex).toBe(1)

      const ack = await board.playLeg(roster[0]!.id)
      expect(ack.ok).toBe(true)

      expect(board.session.snapshot?.tournament).toMatchObject({
        legIndex: 1,
        firstLegStarter: 1,
      })
      expect(board.session.snapshot?.currentPlayerIndex).toBe(0)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'keeps the choice for a board that reconnects mid-match',
    async () => {
      const { tournament, floor, board } = await liveMatch()
      await board.chooseStarter(1)

      board.close()
      const floorRoom = `floor:${tournament.id}:${floor.id}`
      await waitUntil(() => !server.io.sockets.adapter.rooms.get(floorRoom)?.size, {
        label: 'the floor room to empty',
      })

      const reconnected = await openBoard('board-1', tournament.id, floor.id)
      expect(reconnected.session.snapshot?.tournament?.firstLegStarter).toBe(1)
      expect(reconnected.session.snapshot?.currentPlayerIndex).toBe(1)
    },
    TEST_TIMEOUT_MS,
  )
})

describe('server log stream over websockets', () => {
  const LOG_ROOM = 'logs'

  /** A console that is definitely in (or out of) the log room before the test acts. */
  async function openLogWatcher(watching: boolean) {
    const watcher = await SpectatorClient.connect(server.url)
    clients.push(watcher)
    const before = server.io.sockets.adapter.rooms.get(LOG_ROOM)?.size ?? 0
    watcher.subscribeToLogs()
    await waitUntil(() => (server.io.sockets.adapter.rooms.get(LOG_ROOM)?.size ?? 0) > before, {
      label: 'the log room to accept the console',
    })
    if (!watching) {
      watcher.unsubscribeFromLogs()
      await waitUntil(() => (server.io.sockets.adapter.rooms.get(LOG_ROOM)?.size ?? 0) === before, {
        label: 'the log room to release the console',
      })
    }
    return watcher
  }

  it(
    'forwards live lines with their level and fields',
    async () => {
      const watcher = await openLogWatcher(true)

      const tournament = await rest.post<Tournament>('/api/tournaments', { name: 'Log Cup' })

      const line = await watcher.waitForLog((entry) => entry.message === 'tournament created')
      expect(line).toMatchObject({
        level: 'info',
        fields: { tournament: tournament.id, name: 'Log Cup' },
      })
      expect(line.seq).toBeGreaterThan(0)
      expect(Number.isNaN(Date.parse(line.time))).toBe(false)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'includes debug lines, which the server itself is not printing at LOG_LEVEL=silent',
    async () => {
      const watcher = await openLogWatcher(true)
      const tournament = await rest.post<Tournament>('/api/tournaments', { name: 'Debug Cup' })

      await rest.post<Participant>(`/api/tournaments/${tournament.id}/participants`, {
        name: 'Ann',
        seed: 1,
      })

      const line = await watcher.waitForLog((entry) => entry.message === 'participant added')
      expect(line).toMatchObject({ level: 'debug', fields: { participant: 'Ann' } })
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'sends nothing to a console that unsubscribed, or never asked',
    async () => {
      const quiet = await openLogWatcher(false)
      const stranger = await SpectatorClient.connect(server.url)
      clients.push(stranger)
      const watcher = await openLogWatcher(true)

      await rest.post<Tournament>('/api/tournaments', { name: 'Quiet Cup' })
      await watcher.waitForLog((entry) => entry.fields?.name === 'Quiet Cup')

      expect(quiet.logs()).toEqual([])
      expect(stranger.logs()).toEqual([])
    },
    TEST_TIMEOUT_MS,
  )
})

describe('participants over REST', () => {
  it(
    'refuses to remove a player once a match is drawn for them',
    async () => {
      const { tournament, roster } = await createTournament('Keep Cup', ['Ann', 'Bob'], [])
      await start(tournament.id, finalOnly)

      const response = await fetch(`${server.url}/api/participants/${roster[0]!.id}`, {
        method: 'DELETE',
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        error: 'cannot remove a participant who is in a match',
      })
      const detail = await rest.get<TournamentDetail>(`/api/tournaments/${tournament.id}`)
      expect(detail.participants).toHaveLength(2)
    },
    TEST_TIMEOUT_MS,
  )
})

describe('phase setup over REST', () => {
  it(
    'locks the phases once the tournament has started',
    async () => {
      const { tournament } = await createTournament('Locked Cup', ['Ann', 'Bob'], [])
      await start(tournament.id, finalOnly)

      await expect(
        rest.put(`/api/tournaments/${tournament.id}/phases`, {
          group: { ...rules, bestOf: 1, groupCount: 1 },
          knockout: null,
        }),
      ).rejects.toThrow(/400: .*phases cannot change once the tournament has started/)

      const detail = await rest.get<TournamentDetail>(`/api/tournaments/${tournament.id}`)
      expect(detail.stages.map((stage) => stage.type)).toEqual(['knockout'])
    },
    TEST_TIMEOUT_MS,
  )
})

describe('tournament list over websockets', () => {
  it(
    'pushes the list when a tournament is created, starts and is deleted',
    async () => {
      const viewer = await SpectatorClient.connect(server.url)
      clients.push(viewer)
      expect(await viewer.followTournaments()).toEqual([])

      const { tournament } = await createTournament('List Cup', ['Ann', 'Bob'], [])
      await viewer.waitForList((list) => list.some((t) => t.id === tournament.id))

      await start(tournament.id, finalOnly)
      await viewer.waitForList((list) =>
        list.some((t) => t.id === tournament.id && t.status === 'active'),
      )

      await fetch(`${server.url}/api/tournaments/${tournament.id}`, { method: 'DELETE' })
      await viewer.waitForList((list) => list.length === 0)
    },
    TEST_TIMEOUT_MS,
  )
})

describe('player pictures over REST and websockets', () => {
  /** Smallest byte string the server accepts as a JPEG; it never decodes the image. */
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

  /** Fetch a photo under the version the upload was given — the URL clients use. */
  async function getPhoto(participantId: string, upload: Response) {
    const { avatar } = (await upload.json()) as Participant
    if (avatar?.kind !== 'photo') throw new Error('upload did not set a photo')
    return fetch(`${server.url}/api/participants/${participantId}/avatar?v=${avatar.version}`)
  }

  function putPhoto(participantId: string, body: Buffer, type = 'image/jpeg') {
    return fetch(`${server.url}/api/participants/${participantId}/avatar/photo`, {
      method: 'PUT',
      headers: { 'content-type': type },
      body: new Uint8Array(body),
    })
  }

  it(
    'pushes a changed picture to the board holding the match',
    async () => {
      const { tournament, roster, floors } = await createTournament(
        'Picture Cup',
        ['Ann', 'Bob'],
        ['Floor 1'],
      )
      const board = await openBoard('board-1', tournament.id, floors[0]!.id)
      await start(tournament.id, finalOnly)
      const assignment = await board.nextAssignment()
      expect(assignment?.participants.map((p) => p.avatar)).toEqual([null, null])

      const ann = roster[0]!
      await rest.put(`/api/participants/${ann.id}/avatar/emoji`, { emoji: '🍺' })
      const withEmoji = await board.events.wait('participant:updated')
      expect(withEmoji).toMatchObject({ id: ann.id, avatar: { kind: 'emoji', emoji: '🍺' } })

      expect((await putPhoto(ann.id, jpeg)).status).toBe(200)
      const withPhoto = await board.events.wait('participant:updated')
      expect(withPhoto.avatar).toMatchObject({ kind: 'photo' })
      const avatar = withPhoto.avatar!

      if (avatar.kind !== 'photo') throw new Error('expected a photo')
      const served = await fetch(
        `${server.url}/api/participants/${ann.id}/avatar?v=${avatar.version}`,
      )
      expect(served.headers.get('content-type')).toBe('image/jpeg')
      expect(served.headers.get('cache-control')).toContain('immutable')
      expect(Buffer.from(await served.arrayBuffer())).toEqual(jpeg)
      // Only the current version is served: anything else would be cached as immutable.
      expect((await fetch(`${server.url}/api/participants/${ann.id}/avatar`)).status).toBe(404)
      expect((await fetch(`${server.url}/api/participants/${ann.id}/avatar?v=stale`)).status).toBe(
        404,
      )

      // A reconnecting board gets the picture with its assignment.
      board.close()
      const reconnected = await openBoard('board-1', tournament.id, floors[0]!.id)
      const resumed = await reconnected.nextAssignment()
      expect(resumed?.participants.find((p) => p.id === ann.id)?.avatar).toEqual(avatar)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'pushes a rename to the tournament room too',
    async () => {
      const { tournament, roster } = await createTournament('Rename Cup', ['Ann'], [])
      const spectator = await openSpectator(tournament.id)
      const response = await fetch(`${server.url}/api/participants/${roster[0]!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Anna' }),
      })
      expect(response.status).toBe(200)
      expect(await spectator.events.wait('participant:updated')).toMatchObject({ name: 'Anna' })
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'replaces one picture kind with the other and removes it',
    async () => {
      const { tournament, roster } = await createTournament('Swap Cup', ['Ann'], [])
      const ann = roster[0]!
      const avatarOf = async () =>
        (await rest.get<TournamentDetail>(`/api/tournaments/${tournament.id}`)).participants[0]!
          .avatar

      const first = await putPhoto(ann.id, jpeg)
      expect(await avatarOf()).toMatchObject({ kind: 'photo' })

      await rest.put(`/api/participants/${ann.id}/avatar/emoji`, { emoji: '👨‍👩‍👧' })
      expect(await avatarOf()).toEqual({ kind: 'emoji', emoji: '👨‍👩‍👧' })
      expect((await getPhoto(ann.id, first)).status).toBe(404)

      const second = await putPhoto(ann.id, jpeg)
      await fetch(`${server.url}/api/participants/${ann.id}/avatar`, { method: 'DELETE' })
      expect(await avatarOf()).toBeNull()
      expect((await getPhoto(ann.id, second)).status).toBe(404)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'refuses what is not a picture',
    async () => {
      const { roster } = await createTournament('Strict Cup', ['Ann'], [])
      const ann = roster[0]!

      await expect(
        rest.put(`/api/participants/${ann.id}/avatar/emoji`, { emoji: 'lol' }),
      ).rejects.toThrow(/400/)
      await expect(
        rest.put(`/api/participants/${ann.id}/avatar/emoji`, { emoji: '🍺🍺' }),
      ).rejects.toThrow(/400/)
      expect((await putPhoto(ann.id, Buffer.from('not a jpeg'))).status).toBe(400)
      expect((await putPhoto(ann.id, jpeg, 'image/png')).status).toBe(415)
      const tooBig = Buffer.concat([jpeg, Buffer.alloc(AVATAR_PHOTO_MAX_BYTES)])
      expect((await putPhoto(ann.id, tooBig)).status).toBe(413)
      expect((await putPhoto('nobody', jpeg)).status).toBe(404)
      await expect(
        rest.put('/api/participants/nobody/avatar/emoji', { emoji: '🍺' }),
      ).rejects.toThrow(/404/)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'deletes photos along with their tournament',
    async () => {
      const { tournament, roster } = await createTournament('Gone Cup', ['Ann'], [])
      const ann = roster[0]!
      const upload = await putPhoto(ann.id, jpeg)
      await fetch(`${server.url}/api/tournaments/${tournament.id}`, { method: 'DELETE' })
      expect((await getPhoto(ann.id, upload)).status).toBe(404)
    },
    TEST_TIMEOUT_MS,
  )
})
