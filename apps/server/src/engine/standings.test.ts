import { describe, expect, it } from 'vitest'
import type { Match } from '@pi-darts/shared'
import { computeStandings, POINTS_PER_WIN } from './standings'

/** Build a completed match; override only the fields a case cares about. */
function match(over: Partial<Match>): Match {
  return {
    id: 'm',
    tournamentId: 't',
    stageId: 's',
    groupId: 'g',
    round: 0,
    slot: 0,
    participantAId: null,
    participantBId: null,
    bestOf: 3,
    startScore: 501,
    outMode: 'double',
    floorId: null,
    queueOrder: 0,
    status: 'completed',
    legsA: 0,
    legsB: 0,
    winnerId: null,
    nextMatchId: null,
    nextSlot: null,
    ...over,
  }
}

describe('computeStandings', () => {
  it('gives every participant a zeroed row when no matches are played', () => {
    const rows = computeStandings(['a', 'b'], [])
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.played === 0 && r.points === 0 && r.legDiff === 0)).toBe(true)
  })

  it('tallies wins, losses, legs, and points from a completed match', () => {
    const rows = computeStandings(
      ['a', 'b'],
      [match({ participantAId: 'a', participantBId: 'b', winnerId: 'a', legsA: 2, legsB: 1 })],
    )
    const a = rows.find((r) => r.participantId === 'a')!
    const b = rows.find((r) => r.participantId === 'b')!

    expect(a).toMatchObject({ played: 1, wins: 1, losses: 0, legsFor: 2, legsAgainst: 1 })
    expect(a.points).toBe(POINTS_PER_WIN)
    expect(a.legDiff).toBe(1)
    expect(b).toMatchObject({ played: 1, wins: 0, losses: 1, legsFor: 1, legsAgainst: 2 })
    expect(b.points).toBe(0)
    expect(b.legDiff).toBe(-1)
  })

  it('sorts by points, then leg difference, then legs won', () => {
    const rows = computeStandings(
      ['a', 'b', 'c'],
      [
        // a and b each win once → tie on points; a has the better leg diff.
        match({ participantAId: 'a', participantBId: 'c', winnerId: 'a', legsA: 2, legsB: 0 }),
        match({ participantAId: 'b', participantBId: 'c', winnerId: 'b', legsA: 2, legsB: 1 }),
      ],
    )
    expect(rows.map((r) => r.participantId)).toEqual(['a', 'b', 'c'])
  })

  it('breaks a points-and-legdiff tie by legs won', () => {
    const rows = computeStandings(
      ['a', 'b', 'c', 'd'],
      [
        match({ participantAId: 'a', participantBId: 'c', winnerId: 'a', legsA: 3, legsB: 1 }),
        match({ participantAId: 'b', participantBId: 'd', winnerId: 'b', legsA: 2, legsB: 0 }),
      ],
    )
    // a and b both: 1 win, legDiff +2. a won more legs (3 vs 2) → ranks first.
    expect(rows.slice(0, 2).map((r) => r.participantId)).toEqual(['a', 'b'])
  })

  it('ignores matches that are not completed, lack a winner, or lack a participant', () => {
    const rows = computeStandings(
      ['a', 'b'],
      [
        match({ participantAId: 'a', participantBId: 'b', winnerId: 'a', status: 'live' }),
        match({ participantAId: 'a', participantBId: 'b', winnerId: null }),
        match({ participantAId: 'a', participantBId: null, winnerId: 'a' }),
      ],
    )
    expect(rows.every((r) => r.played === 0)).toBe(true)
  })

  it('skips winners that are not in the participant list', () => {
    const rows = computeStandings(
      ['a'],
      [match({ participantAId: 'a', participantBId: 'z', winnerId: 'a', legsA: 2, legsB: 0 })],
    )
    // 'z' is unknown, so the whole match is skipped.
    expect(rows[0]!.played).toBe(0)
  })
})
