// Central place to build tournament snapshots and broadcast them. Both the REST
// routes and the socket handlers push updates through here so overview screens stay
// in sync no matter what triggered the change.
import type { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  InterServerEvents,
  LiveMatchState,
  Match,
  ServerToClientEvents,
  SocketData,
  TournamentSnapshot,
} from '@pi-darts/shared'
import { repo } from '../repo'
import { computeStandings } from '../engine'

export type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

let io: IoServer | null = null

export function setIo(server: IoServer): void {
  io = server
}

export function roomFor(tournamentId: string): string {
  return `tournament:${tournamentId}`
}

export function floorRoomFor(tournamentId: string, floorId: string): string {
  return `floor:${tournamentId}:${floorId}`
}

/** Assemble the full state of a tournament for subscribers. */
export function buildSnapshot(tournamentId: string): TournamentSnapshot | null {
  const tournament = repo.getTournament(tournamentId)
  if (!tournament) return null
  const matches = repo.listMatches(tournamentId)
  const participantIds = repo.listParticipants(tournamentId).map((p) => p.id)
  const standings = computeStandings(participantIds, matches)
  return { tournament, floors: repo.listFloors(tournamentId), matches, standings }
}

export function broadcastSnapshot(tournamentId: string): void {
  if (!io) return
  const snapshot = buildSnapshot(tournamentId)
  if (snapshot) io.to(roomFor(tournamentId)).emit('tournament:state', snapshot)
}

export function broadcastMatch(match: Match): void {
  io?.to(roomFor(match.tournamentId)).emit('match:updated', match)
}

export function broadcastLive(tournamentId: string, state: LiveMatchState): void {
  io?.to(roomFor(tournamentId)).emit('match:live', state)
}
