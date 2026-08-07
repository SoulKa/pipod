// Typed socket.io event maps. These are plain interfaces of event signatures, so
// this module stays free of any socket.io dependency — the server and clients
// supply them as generics to Server<...> / io<...>() for end-to-end typing.
import type { BoardGameSnapshot } from './boardState'
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

/**
 * Acknowledgement for a reported leg. A board must not advance its own match state
 * until the server confirms — an unregistered or stale board is rejected here.
 */
export type LegResultResponse = { ok: true; match: Match } | { ok: false; message: string }

/** Match config the server hands to a board that has claimed a match. */
export interface MatchAssignment {
  match: Match
  participants: { id: string; name: string }[]
}

/** The persisted state returned after registering a floor board or saving a snapshot. */
export interface BoardSession {
  snapshot: BoardGameSnapshot | null
  revision: number
}

export interface BoardSnapshotPayload {
  snapshot: BoardGameSnapshot
  /** Optimistic-lock revision received with the latest BoardSession. */
  expectedRevision: number
}

export type BoardSnapshotResponse =
  { ok: true; session: BoardSession } | { ok: false; message: string; session?: BoardSession }

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
  /** Sent after registration so a reconnecting board can restore its full state. */
  'board:session': (session: BoardSession) => void
  'error:message': (message: string) => void
}

export interface ClientToServerEvents {
  /** Bind a board's stable ID to a tournament floor. */
  'board:register': (payload: { boardId: string; tournamentId: string; floorId: string }) => void
  /** Subscribe to a tournament's room to receive state + live updates. */
  'tournament:subscribe': (payload: { tournamentId: string }) => void
  /** A board takes ownership of a ready match. */
  'match:claim': (payload: { matchId: string; boardId: string }) => void
  /** Save an entire board state atomically instead of mirroring individual darts. */
  'board:snapshot': (
    payload: BoardSnapshotPayload,
    reply: (response: BoardSnapshotResponse) => void,
  ) => void
  /** Legacy no-op retained while boards migrate to board:snapshot uploads. */
  'match:throw': (payload: ThrowPayload) => void
  'match:legResult': (
    payload: LegResultPayload,
    reply: (response: LegResultResponse) => void,
  ) => void
}

export interface InterServerEvents {
  ping: () => void
}

export interface SocketData {
  boardId?: string
  tournamentId?: string
  floorId?: string
}
