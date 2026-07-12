// Pure single-elimination bracket generation. Produces matches with LOCAL ids and
// links (nextLocalId/nextSlot); the service maps local ids to real db ids. Byes are
// left as null slots for the caller to resolve.
import type { BracketSlot } from '@pi-darts/shared'

export interface BracketMatch {
  localId: string
  round: number
  slot: number
  aId: string | null
  bId: string | null
  nextLocalId: string | null
  nextSlot: BracketSlot | null
}

/** Smallest power of two >= n (minimum 1). */
export function nextPowerOfTwo(n: number): number {
  let size = 1
  while (size < n) size *= 2
  return size
}

/**
 * Standard bracket seeding order for a bracket of `size` (a power of two).
 * Returns 0-based positions so seed 1 meets the lowest seed, seed 2 is placed in
 * the opposite half, etc. e.g. size 4 -> [0, 3, 1, 2].
 */
export function seedOrder(size: number): number[] {
  let arr = [1, 2]
  while (arr.length < size) {
    const total = arr.length * 2 + 1
    const next: number[] = []
    for (const x of arr) {
      next.push(x)
      next.push(total - x)
    }
    arr = next
  }
  return arr.map((x) => x - 1)
}

/**
 * Build a single-elimination bracket from seeds (index 0 = top seed). Fewer than a
 * power-of-two seeds are padded with null "bye" slots, positioned so top seeds get
 * the byes. Round 0 holds the first-round matches; later rounds have empty slots
 * that winners advance into.
 */
export function generateSingleElimination(seeds: (string | null)[]): BracketMatch[] {
  if (seeds.length < 2) return []

  const size = nextPowerOfTwo(seeds.length)
  const padded: (string | null)[] = [...seeds]
  while (padded.length < size) padded.push(null)

  const order = seedOrder(size)
  const ordered = order.map((pos) => padded[pos] ?? null)
  const totalRounds = Math.log2(size)

  const byRound: BracketMatch[][] = []
  for (let round = 0; round < totalRounds; round++) {
    const count = size / 2 ** (round + 1)
    const roundMatches: BracketMatch[] = []
    for (let slot = 0; slot < count; slot++) {
      roundMatches.push({
        localId: `R${round}M${slot}`,
        round,
        slot,
        aId: round === 0 ? (ordered[slot * 2] ?? null) : null,
        bId: round === 0 ? (ordered[slot * 2 + 1] ?? null) : null,
        nextLocalId: null,
        nextSlot: null,
      })
    }
    byRound.push(roundMatches)
  }

  // Link each match to its parent in the next round.
  for (let round = 0; round < totalRounds - 1; round++) {
    byRound[round]!.forEach((match, idx) => {
      const parent = byRound[round + 1]![Math.floor(idx / 2)]!
      match.nextLocalId = parent.localId
      match.nextSlot = idx % 2 === 0 ? 'a' : 'b'
    })
  }

  return byRound.flat()
}
