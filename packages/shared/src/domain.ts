// Core domain model shared by the server, board, and console.
// Mirrors the vocabulary of the board's game engine (apps/board/src/game) so the
// two sides speak the same language about darts games.
import type { DartThrow as BoardDartThrow, Multiplier as BoardMultiplier } from './boardState'

/** Finishing rule for a game. A "double" finish requires the last dart be a double. */
export type OutMode = 'single' | 'double'

/** Dart multiplier: single, double, or treble. */
export type Multiplier = BoardMultiplier

/** Selectable starting scores (mirrors START_SCORES in the board engine). */
export const START_SCORES = [301, 501] as const
export type StartScore = (typeof START_SCORES)[number]

export type TournamentStatus = 'setup' | 'active' | 'completed' | 'cancelled'

/**
 * Whether a tournament is still open: boards may join it and it may be cancelled. A
 * finished or cancelled one never assigns another match.
 */
export function isOpenTournament(status: TournamentStatus): boolean {
  return status === 'setup' || status === 'active'
}

/**
 * A tournament has at most these two phases, always played in this order: a round-robin
 * group phase, then a single-elimination knockout bracket. Each is optional, but at
 * least one is on.
 */
export type StageType = 'group' | 'knockout'

/** Play order of the phases; a phase never starts before every earlier one is finished. */
export const STAGE_TYPES: readonly StageType[] = ['group', 'knockout']

/**
 * pending  – waiting on participants (e.g. an unfilled bracket slot)
 * ready    – both participants known, can be claimed by a board
 * live     – a board is currently playing it
 * completed – has a winner
 */
export type MatchStatus = 'pending' | 'ready' | 'live' | 'completed'

/** Which slot of a downstream match a winner flows into. */
export type BracketSlot = 'a' | 'b'

export interface Tournament {
  id: string
  name: string
  status: TournamentStatus
  /** When true, ready matches are auto-assigned to free floors as capacity opens up. */
  autoAssign: boolean
  /** ISO-8601 timestamp. */
  createdAt: string
}

export interface Participant {
  id: string
  tournamentId: string
  name: string
  /** Seeding for bracket generation; null when unseeded. */
  seed: number | null
}

/** A named physical playing area with exactly one connected scoring board. */
export interface Floor {
  id: string
  tournamentId: string
  name: string
}

/** Rules shared by every phase; each match copies them when it is drawn. */
interface StageBase {
  id: string
  tournamentId: string
  /** Default match length for this stage (legs to win = ceil(bestOf/2)). */
  bestOf: number
  startScore: StartScore
  outMode: OutMode
}

export interface GroupStage extends StageBase {
  type: 'group'
  /** How many round-robin groups participants are split across. */
  groupCount: number
}

export interface KnockoutStage extends StageBase {
  type: 'knockout'
  /** How many advance from each group; null when there is no group phase to cut. */
  qualifiersPerGroup: number | null
}

/** One phase of a tournament. Its name and play order follow from `type`. */
export type Stage = GroupStage | KnockoutStage

export interface Group {
  id: string
  stageId: string
  name: string
}

export interface GroupMember {
  groupId: string
  participantId: string
}

export interface Match {
  id: string
  tournamentId: string
  stageId: string
  /** Set for round-robin matches; null for knockout matches. */
  groupId: string | null
  /** Bracket round (0-based) or round-robin round number. */
  round: number
  /** Position of the match within its round. */
  slot: number
  participantAId: string | null
  participantBId: string | null
  bestOf: number
  startScore: number
  outMode: OutMode
  /** Physical floor selected by the console; null until the match is assigned. */
  floorId: string | null
  /** Position within its floor's queue; lower plays first. 0 while unassigned. */
  queueOrder: number
  status: MatchStatus
  /** Legs won by A / B so far. */
  legsA: number
  legsB: number
  winnerId: string | null
  /** Bracket progression: the match the winner advances into, and which slot. */
  nextMatchId: string | null
  nextSlot: BracketSlot | null
}

export interface Leg {
  id: string
  matchId: string
  /** 0-based leg number within the match. */
  index: number
  startScore: number
  outMode: OutMode
  winnerId: string | null
}

/** A single dart, matching the board engine's DartThrow shape. */
export type DartThrow = BoardDartThrow

export interface StoredThrow extends DartThrow {
  id: string
  legId: string
  participantId: string
  /** 0-based index of the dart within the leg. */
  dartIndex: number
}

/** Round-robin standings row for a single participant. */
export interface Standing {
  participantId: string
  played: number
  wins: number
  losses: number
  legsFor: number
  legsAgainst: number
  legDiff: number
  /** Table points (2 per win by default). */
  points: number
}

/** Per-participant live scoring state within the current leg. */
export interface LiveScore {
  participantId: string
  /** Remaining score in the current leg. */
  remaining: number
  lastThrows: DartThrow[]
}

/** Snapshot of an in-progress match, broadcast to overview screens. */
export interface LiveMatchState {
  matchId: string
  legIndex: number
  currentParticipantId: string | null
  scores: LiveScore[]
  legsA: number
  legsB: number
}
