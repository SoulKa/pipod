// Typed socket.io event maps. These are plain interfaces of event signatures, so
// this module stays free of any socket.io dependency — the server and clients
// supply them as generics to Server<...> / io<...>() for end-to-end typing.
import type { Floor, LiveMatchState, Match, Multiplier, Standing, Tournament } from './domain'

/** A live dart pushed from a board while a match is in progress. */
export interface ThrowPayload {
  matchId: string
  participantId: string
  base: number
  multiplier: Multiplier
}

/** A board reporting the winner of a completed leg. */
export interface LegResultPayload {
  matchId: string
  legIndex: number
  winnerId: string
}

/** Match config the server hands to a board that has claimed a match. */
export interface MatchAssignment {
  match: Match
  participants: { id: string; name: string }[]
}

/** Full tournament snapshot pushed to subscribers (e.g. the overview screen). */
export interface TournamentSnapshot {
  tournament: Tournament
  floors: Floor[]
  matches: Match[]
  standings: Standing[]
}

export interface ServerToClientEvents {
  'tournament:state': (payload: TournamentSnapshot) => void
  'match:assigned': (payload: MatchAssignment) => void
  'match:live': (state: LiveMatchState) => void
  'match:updated': (match: Match) => void
  'error:message': (message: string) => void
}

export interface ClientToServerEvents {
  /** Bind a board's stable ID to a tournament floor. */
  'board:register': (payload: { boardId: string; tournamentId: string; floorId: string }) => void
  /** Subscribe to a tournament's room to receive state + live updates. */
  'tournament:subscribe': (payload: { tournamentId: string }) => void
  /** A board takes ownership of a ready match. */
  'match:claim': (payload: { matchId: string; boardId: string }) => void
  'match:throw': (payload: ThrowPayload) => void
  'match:legResult': (payload: LegResultPayload) => void
}

export interface InterServerEvents {
  ping: () => void
}

export interface SocketData {
  boardId?: string
  tournamentId?: string
  floorId?: string
}
