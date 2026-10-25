// A tournament's status is derived from its matches rather than commanded, so the
// console sees a tournament finish the moment its last match does — no operator step.
// Kept out of ./tournaments to stay clear of a cycle: that module already imports
// ./matches, which is where the deciding leg is reported.
import { eq } from 'drizzle-orm'
import type { Tournament, TournamentStatus } from '@pipod/shared'
import { db } from '../db/client'
import { tournaments } from '../db/schema'
import { log } from '../logger'
import { repo } from '../repo'

/**
 * What a tournament's matches say its status is: no matches → still in setup; every
 * phase drawn and every match done → completed; otherwise active. A knockout phase
 * that is still waiting on the group phase keeps a fully played group phase active.
 */
export function deriveTournamentStatus(tournamentId: string): TournamentStatus {
  const matchList = repo.listMatches(tournamentId)
  if (!matchList.length) return 'setup'
  const undrawn = repo
    .listStages(tournamentId)
    .some((stage) => !matchList.some((m) => m.stageId === stage.id))
  return !undrawn && matchList.every((m) => m.status === 'completed') ? 'completed' : 'active'
}

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

  const status = deriveTournamentStatus(tournamentId)
  if (status === tournament.status) return null
  db.update(tournaments).set({ status }).where(eq(tournaments.id, tournamentId)).run()
  log.info(
    { tournament: tournamentId, name: tournament.name, from: tournament.status, to: status },
    'tournament status changed',
  )
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
