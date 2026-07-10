// Match lifecycle: claiming, reporting legs, deciding winners, and advancing them
// through a knockout bracket. DB-facing; the pure math lives in ../engine.
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import type { Match } from '@pi-darts/shared'
import { db } from '../db/client'
import { legs, matches } from '../db/schema'
import { repo } from '../repo'

/** Legs required to win a best-of-N match. */
export function legsToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1
}

/** Mark a ready match as live (a board has claimed it). */
export function claimMatch(matchId: string): Match {
  const match = repo.getMatch(matchId)
  if (!match) throw new Error('match not found')
  if (match.status === 'completed') throw new Error('match already completed')
  db.update(matches).set({ status: 'live' }).where(eq(matches.id, matchId)).run()
  return repo.getMatch(matchId)!
}

/**
 * Push a completed match's winner into its downstream bracket slot. Returns the
 * updated downstream match (empty when there's nowhere to advance).
 */
export function advanceWinner(match: Match): Match[] {
  if (!match.winnerId || !match.nextMatchId || !match.nextSlot) return []
  const next = repo.getMatch(match.nextMatchId)
  if (!next) return []

  const patch =
    match.nextSlot === 'a' ? { participantAId: match.winnerId } : { participantBId: match.winnerId }
  const bothSet =
    (match.nextSlot === 'a' ? match.winnerId : next.participantAId) &&
    (match.nextSlot === 'b' ? match.winnerId : next.participantBId)

  db.update(matches)
    .set({ ...patch, status: bothSet ? 'ready' : next.status })
    .where(eq(matches.id, next.id))
    .run()
  return [repo.getMatch(next.id)!]
}

/**
 * Resolve first-round byes: any match with exactly one participant is auto-won by
 * that participant and its winner advanced. Iterates so chained byes settle.
 * Returns every match that changed.
 */
export function resolveByes(stageId: string): Match[] {
  const changed: Match[] = []
  let progressed = true
  while (progressed) {
    progressed = false
    for (const m of repo.listStageMatches(stageId)) {
      if (m.status === 'completed') continue
      const hasA = !!m.participantAId
      const hasB = !!m.participantBId
      if (hasA === hasB) continue // both or neither present — not a bye
      const winnerId = (m.participantAId ?? m.participantBId)!
      db.update(matches).set({ status: 'completed', winnerId }).where(eq(matches.id, m.id)).run()
      const completed = repo.getMatch(m.id)!
      changed.push(completed, ...advanceWinner(completed))
      progressed = true
    }
  }
  return changed
}

/**
 * Record a completed leg's winner, update the match tally, and — when the match is
 * decided — mark it completed and advance the winner. Returns the match plus any
 * downstream matches that changed, so the caller can broadcast them.
 */
export function reportLeg(
  matchId: string,
  legIndex: number,
  winnerId: string,
): { match: Match; changed: Match[] } {
  const match = repo.getMatch(matchId)
  if (!match) throw new Error('match not found')
  if (match.status === 'completed') throw new Error('match already completed')
  if (winnerId !== match.participantAId && winnerId !== match.participantBId) {
    throw new Error('winner is not a participant of this match')
  }

  db.insert(legs)
    .values({
      id: nanoid(),
      matchId,
      index: legIndex,
      startScore: match.startScore,
      outMode: match.outMode,
      winnerId,
    })
    .run()

  const legsA = match.legsA + (winnerId === match.participantAId ? 1 : 0)
  const legsB = match.legsB + (winnerId === match.participantBId ? 1 : 0)
  const need = legsToWin(match.bestOf)
  const decided = legsA >= need || legsB >= need
  const matchWinner =
    legsA >= need ? match.participantAId : legsB >= need ? match.participantBId : null

  db.update(matches)
    .set({
      legsA,
      legsB,
      status: decided ? 'completed' : 'live',
      winnerId: matchWinner,
    })
    .where(eq(matches.id, matchId))
    .run()

  const updated = repo.getMatch(matchId)!
  const changed: Match[] = [updated]
  if (decided) changed.push(...advanceWinner(updated))
  return { match: updated, changed }
}
