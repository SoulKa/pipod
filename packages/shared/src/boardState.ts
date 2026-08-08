// Serializable board state shared by a floor board and the tournament server.
// It deliberately contains no Vue refs or computed values, so it can be persisted as JSON.
import { z } from 'zod'
import { outModeSchema, startScoreSchema } from './rest'

export const multiplierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

export const dartThrowSchema = z
  .object({
    base: z.number().int().min(0).max(25),
    multiplier: multiplierSchema,
    points: z.number().int().min(0).max(60),
  })
  .superRefine(({ base, multiplier, points }, ctx) => {
    if (base === 25 && multiplier === 3) {
      ctx.addIssue({ code: 'custom', message: 'triple bull is not a legal dart' })
    }
    if (points !== base * multiplier) {
      ctx.addIssue({ code: 'custom', message: 'points must equal base × multiplier' })
    }
  })

export const gameOptionsSchema = z.object({
  startScore: startScoreSchema,
  outMode: outModeSchema,
})

export const boardPlayerSchema = z.object({
  name: z.string().min(1).max(60),
  score: z.number().int().min(0).max(501),
  lastThrows: z.array(dartThrowSchema).max(3),
})

const turnSnapshotSchema = z.object({
  players: z.array(boardPlayerSchema).max(32),
  currentPlayerIndex: z.number().int().min(0),
  currentThrows: z.array(dartThrowSchema).max(3),
  finishOrder: z.array(z.number().int().min(0)).max(32),
  bannerIndex: z.number().int().min(0).nullable(),
})

function validateTurnState(state: z.infer<typeof turnSnapshotSchema>, ctx: z.RefinementCtx): void {
  const { players, currentPlayerIndex, finishOrder, bannerIndex } = state
  if (players.length === 0) {
    if (currentPlayerIndex !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['currentPlayerIndex'],
        message: 'must be 0 without players',
      })
    }
    if (finishOrder.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['finishOrder'], message: 'requires players' })
    }
    if (bannerIndex !== null) {
      ctx.addIssue({ code: 'custom', path: ['bannerIndex'], message: 'requires players' })
    }
    return
  }

  if (currentPlayerIndex >= players.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['currentPlayerIndex'],
      message: 'must reference a player',
    })
  }
  if (
    new Set(finishOrder).size !== finishOrder.length ||
    finishOrder.some((index) => index >= players.length)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['finishOrder'],
      message: 'must contain unique player indices',
    })
  }
  if (bannerIndex !== null && bannerIndex >= players.length) {
    ctx.addIssue({ code: 'custom', path: ['bannerIndex'], message: 'must reference a player' })
  }
}

export const boardTurnSnapshotSchema = turnSnapshotSchema.superRefine(validateTurnState)

export const seatSchema = z.union([z.literal(0), z.literal(1)])

export const boardTournamentStateSchema = z.object({
  activeMatchId: z.string().min(1),
  participantIds: z.array(z.string().min(1)).length(2),
  legIndex: z.number().int().min(0),
  legsA: z.number().int().min(0),
  legsB: z.number().int().min(0),
  // Seat that threw first in leg 0 of this match, picked on the board before the
  // match starts. Null means nobody has chosen yet, which is what makes the board
  // show its starter screen. Defaulted so sessions persisted before this existed
  // still parse instead of being dropped mid-match.
  firstLegStarter: seatSchema.nullable().default(null),
})

/** Legs alternate the throw: whoever did not start the previous leg starts the next. */
export function legStarterSeat(firstLegStarter: Seat, legIndex: number): Seat {
  return ((firstLegStarter + legIndex) % 2) as Seat
}

/**
 * Complete mutable state of the board engine, including its undo stack and optional
 * tournament context. This is the JSON value a registered floor persists.
 */
export const boardGameSnapshotSchema = turnSnapshotSchema
  .extend({
    phase: z.enum(['setup', 'playing']),
    options: gameOptionsSchema,
    history: z.array(boardTurnSnapshotSchema).max(300),
    tournament: boardTournamentStateSchema.nullable(),
  })
  .superRefine(validateTurnState)

export const boardSnapshotPayloadSchema = z.object({
  snapshot: boardGameSnapshotSchema,
  expectedRevision: z.number().int().min(0),
})

export type Multiplier = z.infer<typeof multiplierSchema>
export type Seat = z.infer<typeof seatSchema>
export type DartThrow = z.infer<typeof dartThrowSchema>
export type GameOptions = z.infer<typeof gameOptionsSchema>
export type BoardPlayer = z.infer<typeof boardPlayerSchema>
export type BoardTurnSnapshot = z.infer<typeof boardTurnSnapshotSchema>
export type BoardTournamentState = z.infer<typeof boardTournamentStateSchema>
export type BoardGameSnapshot = z.infer<typeof boardGameSnapshotSchema>
export type BoardSnapshotInput = z.infer<typeof boardSnapshotPayloadSchema>
