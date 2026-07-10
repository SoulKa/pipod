// Pure standings computation for round-robin groups.
import type { Match, Standing } from '@pi-darts/shared'

/** Points awarded per win in group tables. */
export const POINTS_PER_WIN = 2

/**
 * Tally standings for a set of participants from their completed matches.
 * Sorted by points, then leg difference, then legs won. Only completed matches
 * with a winner and both participants set are counted.
 */
export function computeStandings(participantIds: string[], matches: Match[]): Standing[] {
  const table = new Map<string, Standing>()
  for (const id of participantIds) {
    table.set(id, {
      participantId: id,
      played: 0,
      wins: 0,
      losses: 0,
      legsFor: 0,
      legsAgainst: 0,
      legDiff: 0,
      points: 0,
    })
  }

  for (const m of matches) {
    if (m.status !== 'completed' || !m.winnerId) continue
    if (!m.participantAId || !m.participantBId) continue
    const a = table.get(m.participantAId)
    const b = table.get(m.participantBId)
    if (!a || !b) continue

    a.played++
    b.played++
    a.legsFor += m.legsA
    a.legsAgainst += m.legsB
    b.legsFor += m.legsB
    b.legsAgainst += m.legsA

    if (m.winnerId === m.participantAId) {
      a.wins++
      b.losses++
      a.points += POINTS_PER_WIN
    } else {
      b.wins++
      a.losses++
      b.points += POINTS_PER_WIN
    }
  }

  const rows = [...table.values()]
  for (const s of rows) s.legDiff = s.legsFor - s.legsAgainst
  rows.sort((x, y) => y.points - x.points || y.legDiff - x.legDiff || y.legsFor - x.legsFor)
  return rows
}
