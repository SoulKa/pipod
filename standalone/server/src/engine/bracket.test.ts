import { describe, expect, it } from 'vitest'
import { generateSingleElimination, nextPowerOfTwo, seedOrder } from './bracket'

describe('nextPowerOfTwo', () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 4],
    [5, 8],
    [8, 8],
    [9, 16],
  ])('rounds %i up to %i', (input, expected) => {
    expect(nextPowerOfTwo(input)).toBe(expected)
  })
})

describe('seedOrder', () => {
  it('places the top seed against the lowest for size 4', () => {
    expect(seedOrder(4)).toEqual([0, 3, 1, 2])
  })

  it('keeps seeds 1 and 2 in opposite halves for size 8', () => {
    const order = seedOrder(8)
    expect(order).toEqual([0, 7, 3, 4, 1, 6, 2, 5])
    // Seed 1 (index 0) in the first half, seed 2 (index 1) in the second half.
    expect(order.indexOf(0)).toBeLessThan(4)
    expect(order.indexOf(1)).toBeGreaterThanOrEqual(4)
  })
})

describe('generateSingleElimination', () => {
  it('returns nothing for fewer than two seeds', () => {
    expect(generateSingleElimination([])).toEqual([])
    expect(generateSingleElimination(['a'])).toEqual([])
  })

  it('builds a full bracket for a power-of-two field', () => {
    const bracket = generateSingleElimination(['A', 'B', 'C', 'D'])

    // size - 1 total matches; 2 rounds (0 and 1).
    expect(bracket).toHaveLength(3)
    expect(new Set(bracket.map((m) => m.round))).toEqual(new Set([0, 1]))

    const round0 = bracket.filter((m) => m.round === 0)
    const round1 = bracket.filter((m) => m.round === 1)
    expect(round0).toHaveLength(2)
    expect(round1).toHaveLength(1)

    // Standard seeding: top seed A meets lowest D; seeds B and C in the other match.
    expect(round0[0]).toMatchObject({ aId: 'A', bId: 'D' })
    expect(round0[1]).toMatchObject({ aId: 'B', bId: 'C' })

    // The final has no players yet and nowhere to advance.
    expect(round1[0]).toMatchObject({ aId: null, bId: null, nextLocalId: null, nextSlot: null })
  })

  it('links round-zero matches into the two slots of their parent', () => {
    const bracket = generateSingleElimination(['A', 'B', 'C', 'D'])
    const round0 = bracket.filter((m) => m.round === 0)
    const final = bracket.find((m) => m.round === 1)!

    expect(round0[0]!.nextLocalId).toBe(final.localId)
    expect(round0[1]!.nextLocalId).toBe(final.localId)
    // The two feeders fill opposite slots.
    expect([round0[0]!.nextSlot, round0[1]!.nextSlot].sort()).toEqual(['a', 'b'])
  })

  it('gives byes to the top seeds when the field is not a power of two', () => {
    // Three seeds pad to a size-4 bracket; the top seed should get the empty slot.
    const bracket = generateSingleElimination(['A', 'B', 'C'])
    const round0 = bracket.filter((m) => m.round === 0)

    const byes = round0.filter((m) => m.aId === null || m.bId === null)
    expect(byes).toHaveLength(1)
    // A (top seed) is paired against a null bye.
    expect(round0[0]).toMatchObject({ aId: 'A', bId: null })
    expect(round0[1]).toMatchObject({ aId: 'B', bId: 'C' })
  })

  it('produces log2(size) rounds and size-1 matches for eight seeds', () => {
    const seeds = Array.from({ length: 8 }, (_, i) => `s${i}`)
    const bracket = generateSingleElimination(seeds)

    expect(bracket).toHaveLength(7)
    expect(new Set(bracket.map((m) => m.round))).toEqual(new Set([0, 1, 2]))
    expect(bracket.filter((m) => m.round === 0)).toHaveLength(4)
    // localIds are unique.
    expect(new Set(bracket.map((m) => m.localId)).size).toBe(bracket.length)
  })
})
