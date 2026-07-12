// Socket wiring for floor registration, durable board snapshots, and leg results.
import type { Socket } from 'socket.io'
import type {
  BoardGameSnapshot,
  ClientToServerEvents,
  Match,
  ServerToClientEvents,
  SocketData,
} from '@pi-darts/shared'
import { boardSnapshotPayloadSchema } from '@pi-darts/shared'
import { repo } from '../repo'
import { dispatchMatch, reportLeg } from '../services/matches'
import { maybeAutoAssign } from '../services/scheduler'
import {
  clearFloorSession,
  ensureFloorSession,
  getFloorSession,
  initializeFloorSession,
  saveFloorSnapshot,
} from '../services/floorSessions'
import {
  broadcastLive,
  broadcastMatch,
  broadcastSnapshot,
  buildSnapshot,
  floorRoomFor,
  roomFor,
  setIo,
  type IoServer,
} from './hub'
import { createMatchSnapshot, deriveLiveMatchState } from './live'

type BoardSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>

let ioServer: IoServer | null = null

export function setupRealtime(io: IoServer): void {
  ioServer = io
  setIo(io)

  io.on('connection', (socket: BoardSocket) => {
    socket.on('board:register', ({ boardId, tournamentId, floorId }) => {
      const floor = repo.getFloor(floorId)
      if (!floor || floor.tournamentId !== tournamentId) {
        socket.emit('error:message', 'selected floor does not belong to this tournament')
        return
      }
      const nextFloorRoom = floorRoomFor(tournamentId, floorId)
      const occupants = io.sockets.adapter.rooms.get(nextFloorRoom)
      if (occupants && !(occupants.size === 1 && socket.rooms.has(nextFloorRoom))) {
        socket.emit('error:message', 'another board is already connected to this floor')
        return
      }
      if (socket.data.tournamentId && socket.data.floorId) {
        socket.leave(floorRoomFor(socket.data.tournamentId, socket.data.floorId))
      }
      socket.data.boardId = boardId
      socket.data.tournamentId = tournamentId
      socket.data.floorId = floorId
      socket.join(roomFor(tournamentId))
      socket.join(nextFloorRoom)
      const session = ensureFloorSession(floor)
      const live = repo
        .listMatches(tournamentId)
        .find((match) => match.floorId === floorId && match.status === 'live')
      if (live && session.matchId === live.id && session.snapshot) {
        socket.emit('board:session', toBoardSession(session))
        socket.emit('match:assigned', { match: live, participants: participantsFor(live) })
        const state = deriveLiveMatchState(session.snapshot)
        if (state) broadcastLive(tournamentId, state)
      } else {
        socket.emit('board:session', toBoardSession(session))
        maybeAutoAssign(tournamentId)
        dispatchQueuedFloorMatch(floorId)
      }
    })

    socket.on('tournament:subscribe', ({ tournamentId }) => {
      socket.data.tournamentId = tournamentId
      socket.join(roomFor(tournamentId))
      const snapshot = buildSnapshot(tournamentId)
      if (snapshot) socket.emit('tournament:state', snapshot)
    })

    socket.on('board:snapshot', (payload, reply) => {
      const parsed = boardSnapshotPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        rejectSnapshot(socket, reply, 'invalid board snapshot')
        return
      }
      const floor = registeredFloor(socket)
      if (!floor) {
        rejectSnapshot(socket, reply, 'register a floor before saving a snapshot')
        return
      }

      const current = getFloorSession(floor.id) ?? ensureFloorSession(floor)
      const matchId = authorizeSnapshot(socket, floor.id, parsed.data.snapshot, current.matchId)
      if (matchId === undefined) {
        reply({ ok: false, message: 'snapshot is not authorized' })
        return
      }

      const saved = saveFloorSnapshot(
        floor,
        parsed.data.snapshot,
        matchId,
        parsed.data.expectedRevision,
      )
      if (!saved) {
        const latest = getFloorSession(floor.id)
        reply({
          ok: false,
          message: 'snapshot revision conflict',
          ...(latest ? { session: toBoardSession(latest) } : {}),
        })
        return
      }

      const session = toBoardSession(saved)
      reply({ ok: true, session })
      socket.emit('board:session', session)
      const state = deriveLiveMatchState(parsed.data.snapshot)
      if (state) broadcastLive(floor.tournamentId, state)
    })

    socket.on('match:legResult', ({ matchId, legIndex, winnerId }) => {
      try {
        const assignedMatch = repo.getMatch(matchId)
        if (!assignedMatch || !canControlMatch(socket, assignedMatch)) return
        const { match, changed } = reportLeg(matchId, legIndex, winnerId)
        for (const m of changed) broadcastMatch(m)

        const floor = match.floorId ? repo.getFloor(match.floorId) : undefined
        if (floor) {
          if (match.status === 'completed') {
            const session = clearFloorSession(floor)
            io.to(floorRoomFor(match.tournamentId, floor.id)).emit(
              'board:session',
              toBoardSession(session),
            )
          } else {
            const nextLeg = createAssignmentSnapshot(match)
            const session = initializeFloorSession(floor, match, nextLeg)
            io.to(floorRoomFor(match.tournamentId, floor.id)).emit(
              'board:session',
              toBoardSession(session),
            )
            const state = deriveLiveMatchState(nextLeg)
            if (state) broadcastLive(match.tournamentId, state)
          }
        }
        if (match.status === 'completed') {
          maybeAutoAssign(match.tournamentId)
          dispatchReadyFloors(match.tournamentId)
        }
        broadcastSnapshot(match.tournamentId)
      } catch (err) {
        socket.emit('error:message', errorText(err))
      }
    })
  })
}

/** Dispatch a match immediately when its assigned floor has a connected board. */
export function dispatchFloorMatch(match: Match): Match | null {
  if (!ioServer || !match.floorId) return null
  const room = floorRoomFor(match.tournamentId, match.floorId)
  if ((ioServer.sockets.adapter.rooms.get(room)?.size ?? 0) !== 1) return null
  const liveMatch = dispatchMatch(match.id, match.floorId)
  const floorId = liveMatch.floorId
  if (!floorId) return null
  const floor = repo.getFloor(floorId)
  if (!floor) return null
  const participants = participantsFor(liveMatch)
  const snapshot = createMatchSnapshot(liveMatch, participants)
  const session = initializeFloorSession(floor, liveMatch, snapshot)
  ioServer.to(room).emit('match:assigned', { match: liveMatch, participants })
  ioServer.to(room).emit('board:session', toBoardSession(session))
  const state = deriveLiveMatchState(snapshot)
  if (state) broadcastLive(liveMatch.tournamentId, state)
  broadcastMatch(liveMatch)
  broadcastSnapshot(liveMatch.tournamentId)
  return liveMatch
}

/** Dispatch a floor's next ready match (queue order), unless a match is already live on it. */
export function dispatchQueuedFloorMatch(floorId: string): void {
  const queue = repo.listFloorQueue(floorId)
  if (queue.some((match) => match.status === 'live')) return // floor is busy playing
  const next = queue.find((match) => match.status === 'ready')
  if (next) dispatchFloorMatch(next)
}

/** Fill every idle, connected floor in a tournament with its next ready match. */
export function dispatchReadyFloors(tournamentId: string): void {
  for (const floor of repo.listFloors(tournamentId)) dispatchQueuedFloorMatch(floor.id)
}

function participantsFor(match: Match): { id: string; name: string }[] {
  const names = new Map(repo.listParticipants(match.tournamentId).map((p) => [p.id, p.name]))
  return [match.participantAId, match.participantBId]
    .filter((id): id is string => !!id)
    .map((id) => ({ id, name: names.get(id) ?? 'Unknown' }))
}

function createAssignmentSnapshot(match: Match): BoardGameSnapshot {
  return createMatchSnapshot(match, participantsFor(match))
}

function toBoardSession(session: { snapshot: BoardGameSnapshot | null; revision: number }): {
  snapshot: BoardGameSnapshot | null
  revision: number
} {
  return { snapshot: session.snapshot, revision: session.revision }
}

function registeredFloor(socket: BoardSocket) {
  if (!socket.data.floorId || !socket.data.tournamentId) return undefined
  const floor = repo.getFloor(socket.data.floorId)
  return floor?.tournamentId === socket.data.tournamentId ? floor : undefined
}

/**
 * Tournament snapshots may only update the active match assigned to this exact floor.
 * A null tournament field is valid for a board's local calculator, but cannot erase a
 * live match session.
 */
function authorizeSnapshot(
  socket: BoardSocket,
  floorId: string,
  snapshot: BoardGameSnapshot,
  currentMatchId: string | null,
): string | null | undefined {
  const tournament = snapshot.tournament
  if (!tournament) {
    if (currentMatchId) {
      const current = repo.getMatch(currentMatchId)
      if (current?.status === 'live') {
        socket.emit('error:message', 'an active match requires a tournament snapshot')
        return undefined
      }
    }
    return null
  }

  const match = repo.getMatch(tournament.activeMatchId)
  if (!match || !canControlMatch(socket, match) || match.floorId !== floorId) return undefined
  const participantIds = [match.participantAId, match.participantBId]
  if (
    participantIds.some((id) => !id) ||
    participantIds[0] !== tournament.participantIds[0] ||
    participantIds[1] !== tournament.participantIds[1] ||
    snapshot.phase !== 'playing' ||
    snapshot.players.length !== participantIds.length ||
    tournament.legIndex !== match.legsA + match.legsB ||
    tournament.legsA !== match.legsA ||
    tournament.legsB !== match.legsB
  ) {
    socket.emit('error:message', 'snapshot does not match the assigned match')
    return undefined
  }
  return match.id
}

function rejectSnapshot(
  socket: BoardSocket,
  reply: (response: { ok: false; message: string }) => void,
  message: string,
): void {
  socket.emit('error:message', message)
  reply({ ok: false, message })
}

function canControlMatch(socket: BoardSocket, match: Match | undefined): boolean {
  if (
    !match ||
    match.status !== 'live' ||
    !match.floorId ||
    match.tournamentId !== socket.data.tournamentId ||
    match.floorId !== socket.data.floorId
  ) {
    socket.emit('error:message', 'this board is not assigned to the match')
    return false
  }
  return true
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'unexpected error'
}
