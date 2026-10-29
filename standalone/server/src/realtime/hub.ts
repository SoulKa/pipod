// Central place to build tournament snapshots and broadcast them. Both the REST
// routes and the socket handlers push updates through here so overview screens stay
// in sync no matter what triggered the change.
import type { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  InterServerEvents,
  LiveMatchState,
  Match,
  Participant,
  ServerToClientEvents,
  SocketData,
  TournamentSnapshot,
} from '@pipod/shared'
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
  // A new server has nobody who saw the last list.
  lastListJson = ''
}

/** Room of clients following the tournament list (the viewer at `/`). */
export const TOURNAMENT_LIST_ROOM = 'tournaments'

/** Last list sent to that room, so a snapshot that changed nothing list-wide stays quiet. */
let lastListJson = ''

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

/**
 * Push the tournament list when it differs from the last push. Every snapshot broadcast
 * runs through here — that covers status changes no matter which mutation caused them.
 */
export function broadcastTournamentList(): void {
  if (!io) return
  const list = repo.listTournaments()
  const json = JSON.stringify(list)
  if (json === lastListJson) return
  lastListJson = json
  io.to(TOURNAMENT_LIST_ROOM).emit('tournaments:list', list)
}

export function broadcastSnapshot(tournamentId: string): void {
  if (!io) return
  // Also covers deletion, where there is no snapshot left to send.
  broadcastTournamentList()
  const snapshot = buildSnapshot(tournamentId)
  if (snapshot) io.to(roomFor(tournamentId)).emit('tournament:state', snapshot)
}

/** Lets a board refresh a participant's picture on its match intro without a reassignment. */
export function broadcastParticipant(participant: Participant): void {
  io?.to(roomFor(participant.tournamentId)).emit('participant:updated', participant)
}

export function broadcastMatch(match: Match): void {
  io?.to(roomFor(match.tournamentId)).emit('match:updated', match)
}

export function broadcastLive(tournamentId: string, state: LiveMatchState): void {
  io?.to(roomFor(tournamentId)).emit('match:live', state)
}
