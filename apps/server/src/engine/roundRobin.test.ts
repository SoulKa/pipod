import { describe, expect, it } from 'vitest'
import { generateRoundRobin, type SeedMatch } from './roundRobin'

/** Unordered key for a pairing so we can assert "every pair meets once" regardless of side. */
const pairKey = (m: SeedMatch) => [m.aId, m.bId].sort().join('-')

describe('generateRoundRobin', () => {
  it('returns nothing for fewer than two participants', () => {
    expect(generateRoundRobin([])).toEqual([])
    expect(generateRoundRobin(['a'])).toEqual([])
  })

  it('schedules a single match for two participants', () => {
    const matches = generateRoundRobin(['a', 'b'])
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ round: 0, slot: 0 })
    expect(pairKey(matches[0]!)).toBe('a-b')
  })

  it.each([
    [2, 1],
    [4, 6],
    [6, 15],
  ])('pairs everyone exactly once for %i players (%i matches)', (count, expected) => {
    const ids = Array.from({ length: count }, (_, i) => `p${i}`)
    const matches = generateRoundRobin(ids)

    expect(matches).toHaveLength(expected)
    // n-1 rounds, each numbered 0..n-2.
    expect(new Set(matches.map((m) => m.round)).size).toBe(count - 1)
    // Every distinct unordered pair appears exactly once.
    const keys = matches.map(pairKey)
    expect(new Set(keys).size).toBe(expected)
    // No self-matches.
    expect(matches.every((m) => m.aId !== m.bId)).toBe(true)
  })

  it.each([
    [3, 3],
    [5, 10],
  ])('drops the bye for odd counts: %i players → %i matches', (count, expected) => {
    const ids = Array.from({ length: count }, (_, i) => `p${i}`)
    const matches = generateRoundRobin(ids)

    expect(matches).toHaveLength(expected)
    // The synthetic bye must never leak into a pairing.
    expect(matches.every((m) => m.aId !== '__BYE__' && m.bId !== '__BYE__')).toBe(true)
    // A bye is added to make the field even, so there are `count` rounds (n = count+1).
    expect(new Set(matches.map((m) => m.round)).size).toBe(count)
    expect(new Set(matches.map(pairKey)).size).toBe(expected)
  })

  it('numbers slots contiguously from zero within each round', () => {
    const matches = generateRoundRobin(['a', 'b', 'c', 'd'])
    const byRound = new Map<number, number[]>()
    for (const m of matches) {
      byRound.set(m.round, [...(byRound.get(m.round) ?? []), m.slot])
    }
    for (const slots of byRound.values()) {
      expect([...slots].sort((x, y) => x - y)).toEqual(slots.map((_, i) => i))
    }
  })
})
