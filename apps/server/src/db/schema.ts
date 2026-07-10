// Drizzle table definitions are the source of truth for generated migrations.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type {
  BracketSlot,
  MatchStatus,
  OutMode,
  StageFormat,
  StageType,
  TournamentStatus,
} from '@pi-darts/shared'

export const tournaments = sqliteTable('tournaments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').$type<TournamentStatus>().notNull().default('setup'),
  createdAt: text('created_at').notNull(),
})

export const participants = sqliteTable(
  'participants',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id').notNull(),
    name: text('name').notNull(),
    seed: integer('seed'),
  },
  (table) => [index('idx_participants_tournament').on(table.tournamentId)],
)

export const stages = sqliteTable(
  'stages',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id').notNull(),
    name: text('name').notNull(),
    type: text('type').$type<StageType>().notNull(),
    format: text('format').$type<StageFormat>().notNull(),
    order: integer('order').notNull(),
    bestOf: integer('best_of').notNull(),
    startScore: integer('start_score').notNull(),
    outMode: text('out_mode').$type<OutMode>().notNull(),
  },
  (table) => [index('idx_stages_tournament').on(table.tournamentId)],
)

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  stageId: text('stage_id').notNull(),
  name: text('name').notNull(),
})

export const groupMembers = sqliteTable('group_members', {
  groupId: text('group_id').notNull(),
  participantId: text('participant_id').notNull(),
})

export const matches = sqliteTable(
  'matches',
  {
    id: text('id').primaryKey(),
    tournamentId: text('tournament_id').notNull(),
    stageId: text('stage_id').notNull(),
    groupId: text('group_id'),
    round: integer('round').notNull(),
    slot: integer('slot').notNull(),
    participantAId: text('participant_a_id'),
    participantBId: text('participant_b_id'),
    bestOf: integer('best_of').notNull(),
    startScore: integer('start_score').notNull(),
    outMode: text('out_mode').$type<OutMode>().notNull(),
    status: text('status').$type<MatchStatus>().notNull().default('pending'),
    legsA: integer('legs_a').notNull().default(0),
    legsB: integer('legs_b').notNull().default(0),
    winnerId: text('winner_id'),
    nextMatchId: text('next_match_id'),
    nextSlot: text('next_slot').$type<BracketSlot>(),
  },
  (table) => [
    index('idx_matches_tournament').on(table.tournamentId),
    index('idx_matches_stage').on(table.stageId),
  ],
)

export const legs = sqliteTable(
  'legs',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id').notNull(),
    index: integer('index').notNull(),
    startScore: integer('start_score').notNull(),
    outMode: text('out_mode').$type<OutMode>().notNull(),
    winnerId: text('winner_id'),
  },
  (table) => [index('idx_legs_match').on(table.matchId)],
)

export const throws = sqliteTable(
  'throws',
  {
    id: text('id').primaryKey(),
    legId: text('leg_id').notNull(),
    participantId: text('participant_id').notNull(),
    dartIndex: integer('dart_index').notNull(),
    base: integer('base').notNull(),
    multiplier: integer('multiplier').notNull(),
    points: integer('points').notNull(),
  },
  (table) => [index('idx_throws_leg').on(table.legId)],
)
