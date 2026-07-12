// Zod schemas for every REST request body, shared so the server validates and
// the console builds forms against a single source of truth.
import { z } from 'zod'

export const outModeSchema = z.enum(['single', 'double'])
export const stageTypeSchema = z.enum(['group', 'knockout'])
export const stageFormatSchema = z.enum(['round_robin', 'single_elimination', 'double_elimination'])

/** 301 or 501, matching the board's selectable start scores. */
export const startScoreSchema = z
  .number()
  .int()
  .refine((v) => v === 301 || v === 501, { message: 'startScore must be 301 or 501' })

export const createTournamentSchema = z.object({
  name: z.string().min(1).max(100),
})
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>

export const createFloorSchema = z.object({
  name: z.string().min(1).max(60),
})
export type CreateFloorInput = z.infer<typeof createFloorSchema>

export const assignMatchFloorSchema = z.object({
  /** null clears the assignment, sending the match back to the unassigned backlog. */
  floorId: z.string().min(1).nullable(),
  /** Insertion index within the target floor's queue; appended when omitted. */
  position: z.number().int().min(0).optional(),
})
export type AssignMatchFloorInput = z.infer<typeof assignMatchFloorSchema>

/** Rewrite a floor's queue order from a full list of its match ids (front to back). */
export const reorderQueueSchema = z.object({
  matchIds: z.string().array(),
})
export type ReorderQueueInput = z.infer<typeof reorderQueueSchema>

/** Toggle a tournament's auto-fill scheduling. */
export const autoAssignToggleSchema = z.object({
  enabled: z.boolean(),
})
export type AutoAssignToggleInput = z.infer<typeof autoAssignToggleSchema>

export const addParticipantSchema = z.object({
  name: z.string().min(1).max(60),
  seed: z.number().int().positive().nullable().optional(),
})
export type AddParticipantInput = z.infer<typeof addParticipantSchema>

export const updateParticipantSchema = addParticipantSchema.partial()
export type UpdateParticipantInput = z.infer<typeof updateParticipantSchema>

export const createStageSchema = z.object({
  name: z.string().min(1).max(60),
  type: stageTypeSchema,
  format: stageFormatSchema,
  bestOf: z.number().int().min(1).max(21).default(3),
  startScore: startScoreSchema.default(501),
  outMode: outModeSchema.default('double'),
  /** For group stages: how many groups to split participants across. */
  groupCount: z.number().int().min(1).max(16).optional(),
})
export type CreateStageInput = z.infer<typeof createStageSchema>

/** Report a completed leg's winner (server tallies match legs from these). */
export const reportLegSchema = z.object({
  legIndex: z.number().int().min(0),
  winnerId: z.string().min(1),
})
export type ReportLegInput = z.infer<typeof reportLegSchema>

/** A single dart, validated for the live feed / persistence. */
export const dartSchema = z.object({
  base: z.number().int().min(0).max(25),
  multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})
export type DartInput = z.infer<typeof dartSchema>
