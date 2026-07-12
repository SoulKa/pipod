// Durable floor-board state. SQLite stores JSON, but every value is validated before use.
import { and, eq } from 'drizzle-orm'
import type { BoardGameSnapshot, BoardSession, Floor, Match } from '@pi-darts/shared'
import { boardGameSnapshotSchema } from '@pi-darts/shared'
import { db } from '../db/client'
import { floorSessions } from '../db/schema'

export interface StoredFloorSession extends BoardSession {
  floorId: string
  tournamentId: string
  matchId: string | null
  updatedAt: string
}

function now(): string {
  return new Date().toISOString()
}

function decodeSnapshot(value: string | null): BoardGameSnapshot | null {
  if (!value) return null
  try {
    const parsed = boardGameSnapshotSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function toSession(row: typeof floorSessions.$inferSelect): StoredFloorSession {
  return {
    floorId: row.floorId,
    tournamentId: row.tournamentId,
    matchId: row.matchId,
    snapshot: decodeSnapshot(row.snapshot),
    revision: row.revision,
    updatedAt: row.updatedAt,
  }
}

/** Create the session lazily, which lets a registered board persist even before dispatch. */
export function ensureFloorSession(floor: Floor): StoredFloorSession {
  const existing = db.select().from(floorSessions).where(eq(floorSessions.floorId, floor.id)).get()
  if (existing) return toSession(existing)

  const createdAt = now()
  db.insert(floorSessions)
    .values({
      floorId: floor.id,
      tournamentId: floor.tournamentId,
      matchId: null,
      snapshot: null,
      revision: 0,
      updatedAt: createdAt,
    })
    .run()
  return {
    floorId: floor.id,
    tournamentId: floor.tournamentId,
    matchId: null,
    snapshot: null,
    revision: 0,
    updatedAt: createdAt,
  }
}

export function getFloorSession(floorId: string): StoredFloorSession | undefined {
  const row = db.select().from(floorSessions).where(eq(floorSessions.floorId, floorId)).get()
  return row ? toSession(row) : undefined
}

/**
 * Replace the session only if the board saved from the revision it restored. This
 * prevents an older reconnecting client from overwriting a newer floor state.
 */
export function saveFloorSnapshot(
  floor: Floor,
  snapshot: BoardGameSnapshot,
  matchId: string | null,
  expectedRevision: number,
): StoredFloorSession | null {
  ensureFloorSession(floor)
  const revision = expectedRevision + 1
  const changed = db
    .update(floorSessions)
    .set({
      matchId,
      snapshot: JSON.stringify(snapshot),
      revision,
      updatedAt: now(),
    })
    .where(and(eq(floorSessions.floorId, floor.id), eq(floorSessions.revision, expectedRevision)))
    .run()
  if (changed.changes === 0) return null
  return getFloorSession(floor.id)!
}

/** Server-created assignments advance the revision so all stale board uploads lose. */
export function initializeFloorSession(
  floor: Floor,
  match: Match,
  snapshot: BoardGameSnapshot,
): StoredFloorSession {
  const current = ensureFloorSession(floor)
  db.update(floorSessions)
    .set({
      matchId: match.id,
      snapshot: JSON.stringify(snapshot),
      revision: current.revision + 1,
      updatedAt: now(),
    })
    .where(eq(floorSessions.floorId, floor.id))
    .run()
  return getFloorSession(floor.id)!
}

export function clearFloorSession(floor: Floor): StoredFloorSession {
  const current = ensureFloorSession(floor)
  db.update(floorSessions)
    .set({
      matchId: null,
      snapshot: null,
      revision: current.revision + 1,
      updatedAt: now(),
    })
    .where(eq(floorSessions.floorId, floor.id))
    .run()
  return getFloorSession(floor.id)!
}
