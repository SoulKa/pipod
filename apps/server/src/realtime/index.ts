// socket.io wiring: boards claim matches and stream throws/leg results; overview
// screens subscribe to a tournament room and receive snapshots + live updates.
import type { Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  DartThrow,
  Match,
  Multiplier,
  ServerToClientEvents,
  SocketData,
} from '@pi-darts/shared'
import { repo } from '../repo'
import { dispatchMatch, reportLeg } from '../services/matches'
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
import { applyThrow, endLive, resetLeg, startLive } from './live'

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
      dispatchQueuedFloorMatch(tournamentId, floorId)
    })

    socket.on('tournament:subscribe', ({ tournamentId }) => {
      socket.data.tournamentId = tournamentId
      socket.join(roomFor(tournamentId))
      const snapshot = buildSnapshot(tournamentId)
      if (snapshot) socket.emit('tournament:state', snapshot)
    })

    socket.on('match:throw', ({ matchId, participantId, base, multiplier }) => {
      const match = repo.getMatch(matchId)
      if (!match || !canControlMatch(socket, match)) return
      const dart: DartThrow = {
        base,
        multiplier: multiplier as Multiplier,
        points: base * multiplier,
      }
      const state = applyThrow(matchId, participantId, dart)
      if (state) broadcastLive(match.tournamentId, state)
    })

    socket.on('match:legResult', ({ matchId, legIndex, winnerId }) => {
      try {
        const assignedMatch = repo.getMatch(matchId)
        if (!assignedMatch || !canControlMatch(socket, assignedMatch)) return
        const { match, changed } = reportLeg(matchId, legIndex, winnerId)
        for (const m of changed) broadcastMatch(m)

        if (match.status === 'completed') {
          endLive(matchId)
        } else {
          const state = resetLeg(match)
          if (state) broadcastLive(match.tournamentId, state)
        }
        broadcastSnapshot(match.tournamentId)
        if (match.status === 'completed' && match.floorId) {
          dispatchQueuedFloorMatch(match.tournamentId, match.floorId)
        }
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
  const names = new Map(repo.listParticipants(liveMatch.tournamentId).map((p) => [p.id, p.name]))
  const participants = [liveMatch.participantAId, liveMatch.participantBId]
    .filter((id): id is string => !!id)
    .map((id) => ({ id, name: names.get(id) ?? 'Unknown' }))
  startLive(liveMatch)
  ioServer.to(room).emit('match:assigned', { match: liveMatch, participants })
  broadcastMatch(liveMatch)
  broadcastSnapshot(liveMatch.tournamentId)
  return liveMatch
}

function dispatchQueuedFloorMatch(tournamentId: string, floorId: string): void {
  const next = repo
    .listMatches(tournamentId)
    .find((match) => match.floorId === floorId && match.status === 'ready')
  if (next) dispatchFloorMatch(next)
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
