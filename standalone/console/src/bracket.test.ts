import { describe, expect, it } from 'vitest'
import type { Match } from '@pipod/shared'
import { activeRoundIndex, buildBracketRounds, championOf } from './bracket'

function match(over: Partial<Match> = {}): Match {
  return {
    id: 'm',
    tournamentId: 't1',
    stageId: 's1',
    groupId: null,
    round: 0,
    slot: 0,
    participantAId: null,
    participantBId: null,
    bestOf: 3,
    startScore: 501,
    outMode: 'double',
    floorId: null,
    queueOrder: 0,
    status: 'ready',
    legsA: 0,
    legsB: 0,
    winnerId: null,
    nextMatchId: null,
    nextSlot: null,
    ...over,
  }
}

/** A single-elimination bracket for `size` players: rounds log2(size)..0, all pending. */
function bracket(size: number): Match[] {
  const out: Match[] = []
  for (let round = 0; 2 ** (round + 1) <= size; round++) {
    const count = size / 2 ** (round + 1)
    for (let slot = 0; slot < count; slot++) {
      out.push(match({ id: `R${round}M${slot}`, round, slot }))
    }
  }
  return out
}

describe('buildBracketRounds', () => {
  it('groups matches by round, ascending, with slots in order', () => {
    const shuffled = [
      match({ id: 'a', round: 1, slot: 0 }),
      match({ id: 'b', round: 0, slot: 1 }),
      match({ id: 'c', round: 0, slot: 0 }),
    ]
    const rounds = buildBracketRounds(shuffled)

    expect(rounds.map((r) => r.round)).toEqual([0, 1])
    expect(rounds[0]!.matches.map((m) => m.id)).toEqual(['c', 'b'])
    expect(rounds[1]!.matches.map((m) => m.id)).toEqual(['a'])
  })

  it('names rounds by their depth below the final', () => {
    expect(buildBracketRounds(bracket(2)).map((r) => r.label)).toEqual(['Finale'])
    expect(buildBracketRounds(bracket(4)).map((r) => r.label)).toEqual(['Halbfinale', 'Finale'])
    expect(buildBracketRounds(bracket(8)).map((r) => r.label)).toEqual([
      'Viertelfinale',
      'Halbfinale',
      'Finale',
    ])
    expect(buildBracketRounds(bracket(16)).map((r) => r.label)).toEqual([
      'Achtelfinale',
      'Viertelfinale',
      'Halbfinale',
      'Finale',
    ])
  })

  it('falls back to a numbered label for rounds beyond the last of sixteen', () => {
    expect(buildBracketRounds(bracket(32))[0]!.label).toBe('Runde 1')
  })

  it('returns nothing for a stage with no matches', () => {
    expect(buildBracketRounds([])).toEqual([])
  })
})

describe('championOf', () => {
  it('is null while the final is still open', () => {
    expect(championOf(buildBracketRounds(bracket(4)))).toBeNull()
  })

  it('is the winner of the last round once decided', () => {
    const matches = bracket(4)
    matches[matches.length - 1] = match({
      id: 'final',
      round: 1,
      slot: 0,
      status: 'completed',
      winnerId: 'pA',
    })
    expect(championOf(buildBracketRounds(matches))).toBe('pA')
  })
})

describe('activeRoundIndex', () => {
  it('points at the first round holding an unfinished match', () => {
    const matches = bracket(8).map((m) =>
      m.round === 0 ? { ...m, status: 'completed' as const } : m,
    )
    expect(activeRoundIndex(buildBracketRounds(matches))).toBe(1)
  })

  it('skips a round that byes already completed', () => {
    const matches: Match[] = bracket(4).map((m) => ({ ...m, status: 'completed' as const }))
    matches[matches.length - 1] = match({ id: 'final', round: 1, slot: 0, status: 'ready' })
    expect(activeRoundIndex(buildBracketRounds(matches))).toBe(1)
  })

  it('is null when every match is done', () => {
    const matches = bracket(4).map((m) => ({ ...m, status: 'completed' as const }))
    expect(activeRoundIndex(buildBracketRounds(matches))).toBeNull()
  })

  it('is null for an empty bracket', () => {
    expect(activeRoundIndex([])).toBeNull()
  })
})
