// socket.io wiring: boards claim matches and stream throws/leg results; overview
// screens subscribe to a tournament room and receive snapshots + live updates.
import type { Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  DartThrow,
  Multiplier,
  ServerToClientEvents,
  SocketData,
} from '@pi-darts/shared'
import { repo } from '../repo'
import { claimMatch, reportLeg } from '../services/matches'
import {
  broadcastLive,
  broadcastMatch,
  broadcastSnapshot,
  buildSnapshot,
  roomFor,
  setIo,
  type IoServer,
} from './hub'
import { applyThrow, endLive, resetLeg, startLive } from './live'

type BoardSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>

export function setupRealtime(io: IoServer): void {
  setIo(io)

  io.on('connection', (socket: BoardSocket) => {
    socket.on('board:register', ({ boardId }) => {
      socket.data.boardId = boardId
    })

    socket.on('tournament:subscribe', ({ tournamentId }) => {
      socket.data.tournamentId = tournamentId
      socket.join(roomFor(tournamentId))
      const snapshot = buildSnapshot(tournamentId)
      if (snapshot) socket.emit('tournament:state', snapshot)
    })

    socket.on('match:claim', ({ matchId }) => {
      try {
        const match = claimMatch(matchId)
        const names = new Map(repo.listParticipants(match.tournamentId).map((p) => [p.id, p.name]))
        const participants = [match.participantAId, match.participantBId]
          .filter((id): id is string => !!id)
          .map((id) => ({ id, name: names.get(id) ?? 'Unknown' }))

        startLive(match)
        socket.join(roomFor(match.tournamentId))
        socket.emit('match:assigned', { match, participants })
        broadcastMatch(match)
        broadcastSnapshot(match.tournamentId)
      } catch (err) {
        socket.emit('error:message', errorText(err))
      }
    })

    socket.on('match:throw', ({ matchId, participantId, base, multiplier }) => {
      const match = repo.getMatch(matchId)
      if (!match) return
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
        const { match, changed } = reportLeg(matchId, legIndex, winnerId)
        for (const m of changed) broadcastMatch(m)

        if (match.status === 'completed') {
          endLive(matchId)
        } else {
          const state = resetLeg(match)
          if (state) broadcastLive(match.tournamentId, state)
        }
        broadcastSnapshot(match.tournamentId)
      } catch (err) {
        socket.emit('error:message', errorText(err))
      }
    })
  })
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'unexpected error'
}
