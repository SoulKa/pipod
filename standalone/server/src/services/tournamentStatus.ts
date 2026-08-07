// A tournament's status is derived from its matches rather than commanded, so the
// console sees a tournament finish the moment its last match does — no operator step.
// Kept out of ./tournaments to stay clear of a cycle: that module already imports
// ./matches, which is where the deciding leg is reported.
import { eq } from 'drizzle-orm'
import type { Tournament, TournamentStatus } from '@pipod/shared'
import { db } from '../db/client'
import { tournaments } from '../db/schema'
import { repo } from '../repo'

/**
 * Re-derive and persist a tournament's status. Returns the updated tournament, or
 * null when nothing changed, so callers can skip a redundant broadcast.
 *
 * `cancelled` is never overwritten — halting a tournament is an operator decision
 * that outranks whatever the matches say. Reversing it goes through
 * `reactivateTournament`.
 */
export function syncTournamentStatus(tournamentId: string): Tournament | null {
  const tournament = repo.getTournament(tournamentId)
  if (!tournament) throw new Error('tournament not found')
  if (tournament.status === 'cancelled') return null

  const matchList = repo.listMatches(tournamentId)
  const status: TournamentStatus = !matchList.length
    ? 'setup'
    : matchList.every((m) => m.status === 'completed')
      ? 'completed'
      : 'active'

  if (status === tournament.status) return null
  db.update(tournaments).set({ status }).where(eq(tournaments.id, tournamentId)).run()
  return { ...tournament, status }
}

/**
 * Re-derive every tournament's status, returning only those that moved. Statuses are
 * otherwise updated event-by-event, so a tournament that finished before this rule
 * existed — or while the server was down — keeps a stale one. Run at startup.
 */
export function syncAllTournamentStatuses(): Tournament[] {
  return repo
    .listTournaments()
    .map((t) => syncTournamentStatus(t.id))
    .filter((t): t is Tournament => t !== null)
}
