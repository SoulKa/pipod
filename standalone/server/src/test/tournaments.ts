// Test-only tournament fixtures, built through the real services.
import { eq } from 'drizzle-orm'
import type { TournamentStatus } from '@pipod/shared'
import { db } from '../db/client'
import { tournaments } from '../db/schema'
import { reportLeg } from '../services/matches'
import { addParticipant, createTournament, startTournament } from '../services/tournaments'
import { knockoutOnly } from './phases'

/** Seed a tournament with `count` participants seeded 1..count. */
export function withPlayers(count: number) {
  const tournament = createTournament('T')
  const players = Array.from({ length: count }, (_, i) =>
    addParticipant(tournament.id, `P${i}`, i + 1),
  )
  return { tournament, players }
}

/**
 * A fully played two-player final whose stored status is forced to `status`, e.g. one
 * cancelled before finished tournaments stopped being cancellable.
 */
export function finishedButStoredAs(status: TournamentStatus) {
  const { tournament, players } = withPlayers(2)
  const [final] = startTournament(tournament.id, knockoutOnly())
  reportLeg(final!.id, 0, players[0]!.id)
  db.update(tournaments).set({ status }).where(eq(tournaments.id, tournament.id)).run()
  return tournament
}
