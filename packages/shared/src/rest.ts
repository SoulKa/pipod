// Zod schemas for every REST request body, shared so the server validates and
// the console builds forms against a single source of truth.
import { z } from 'zod'

export const outModeSchema = z.enum(['single', 'double'])
export const stageTypeSchema = z.enum(['group', 'knockout'])

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

/** Match rules every phase sets for its own matches. */
const phaseRulesSchema = z.object({
  bestOf: z.number().int().min(1).max(21).default(3),
  startScore: startScoreSchema.default(501),
  outMode: outModeSchema.default('double'),
})

export const groupPhaseSchema = phaseRulesSchema.extend({
  /** How many round-robin groups to split participants across. */
  groupCount: z.number().int().min(1).max(16).default(1),
})
export type GroupPhaseInput = z.infer<typeof groupPhaseSchema>

export const knockoutPhaseSchema = phaseRulesSchema.extend({
  /** How many advance from each group; ignored without a group phase. */
  qualifiersPerGroup: z.number().int().min(1).max(8).default(2),
})
export type KnockoutPhaseInput = z.infer<typeof knockoutPhaseSchema>

/** Why a phase setup is refused; clients key their own wording off these. */
export const PHASE_SETUP_ERRORS = {
  noPhase: 'at least one phase must be enabled',
  tooFewQualifiers: 'the knockout phase needs at least two qualifiers',
} as const

/** A tournament's phase setup: null turns a phase off. Replaces any previous setup. */
export const configurePhasesSchema = z
  .object({
    group: groupPhaseSchema.nullable(),
    knockout: knockoutPhaseSchema.nullable(),
  })
  .refine((v) => v.group || v.knockout, { message: PHASE_SETUP_ERRORS.noPhase })
  .refine(
    (v) => !v.group || !v.knockout || v.group.groupCount * v.knockout.qualifiersPerGroup >= 2,
    {
      message: PHASE_SETUP_ERRORS.tooFewQualifiers,
    },
  )
export type ConfigurePhasesInput = z.infer<typeof configurePhasesSchema>

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

/** Response of `GET /api/info`. */
export interface ServerInfo {
  /**
   * Origin other devices on the LAN reach the server at — what QR codes link to, since the
   * console itself is often opened on `localhost`. `PUBLIC_URL` when set, else the detected
   * LAN address; null when neither is known.
   */
  publicOrigin: string | null
}
