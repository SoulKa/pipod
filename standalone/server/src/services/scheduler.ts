// Auto-assignment scheduler: spreads unassigned ready matches across floors,
// balancing queue lengths while never scheduling a player onto two floors at once.
// DB-only — dispatching queued matches to boards is the realtime layer's job.
import { eq } from 'drizzle-orm'
import type { Tournament } from '@pi-darts/shared'
import { db } from '../db/client'
import { tournaments } from '../db/schema'
import { repo } from '../repo'
import { assignMatchFloor } from './matches'

/**
 * Assign every unassigned ready match to a floor. A match is only placed when both of
 * its players are free (not live and not already queued elsewhere), so the same player
 * is never pulled to two boards at once — conflicting matches wait in the backlog until
 * their players free up. Floors are filled shortest-queue-first to balance load.
 */
export function runAutoAssign(tournamentId: string): void {
  const floors = repo.listFloors(tournamentId)
  if (!floors.length) return
  const all = repo.listMatches(tournamentId)

  const busy = new Set<string>()
  const queueLen = new Map<string, number>(floors.map((f) => [f.id, 0]))
  for (const m of all) {
    if (m.floorId && (m.status === 'ready' || m.status === 'live')) {
      queueLen.set(m.floorId, (queueLen.get(m.floorId) ?? 0) + 1)
      if (m.participantAId) busy.add(m.participantAId)
      if (m.participantBId) busy.add(m.participantBId)
    }
  }

  // listMatches is ordered by round/slot, so earlier rounds are scheduled first.
  const candidates = all.filter((m) => m.status === 'ready' && m.floorId === null)
  for (const match of candidates) {
    const players = [match.participantAId, match.participantBId].filter(
      (id): id is string => !!id,
    )
    if (players.some((id) => busy.has(id))) continue
    const target = floors.reduce((best, f) =>
      (queueLen.get(f.id) ?? 0) < (queueLen.get(best.id) ?? 0) ? f : best,
    )
    assignMatchFloor(match.id, target.id)
    queueLen.set(target.id, (queueLen.get(target.id) ?? 0) + 1)
    players.forEach((id) => busy.add(id))
  }
}

/** Persist the auto-fill flag; enabling it kicks off an immediate assignment pass. */
export function setAutoAssign(tournamentId: string, enabled: boolean): Tournament {
  const tournament = repo.getTournament(tournamentId)
  if (!tournament) throw new Error('tournament not found')
  db.update(tournaments).set({ autoAssign: enabled }).where(eq(tournaments.id, tournamentId)).run()
  if (enabled) runAutoAssign(tournamentId)
  return { ...tournament, autoAssign: enabled }
}

/** Run an assignment pass only when the tournament has auto-fill enabled. */
export function maybeAutoAssign(tournamentId: string): void {
  if (repo.getTournament(tournamentId)?.autoAssign) runAutoAssign(tournamentId)
}
