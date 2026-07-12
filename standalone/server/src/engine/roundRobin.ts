// Pure round-robin scheduling via the circle method. No Vue, no DB — just data in,
// pairings out — so it can be unit-tested in isolation.

export interface SeedMatch {
  round: number
  slot: number
  aId: string
  bId: string
}

const BYE = '__BYE__'

/**
 * Generate a single round-robin (everyone plays everyone once) for the given
 * participant ids. With an odd count, one participant sits out each round (the
 * bye is dropped from the output). Returns pairings tagged with round + slot.
 */
export function generateRoundRobin(participantIds: string[]): SeedMatch[] {
  const players = [...participantIds]
  if (players.length < 2) return []
  if (players.length % 2 !== 0) players.push(BYE)

  const n = players.length
  const rounds = n - 1
  const half = n / 2
  const arr = [...players]
  const matches: SeedMatch[] = []

  for (let round = 0; round < rounds; round++) {
    let slot = 0
    for (let i = 0; i < half; i++) {
      const a = arr[i]!
      const b = arr[n - 1 - i]!
      if (a !== BYE && b !== BYE) {
        matches.push({ round, slot, aId: a, bId: b })
        slot++
      }
    }
    // Rotate all but the first element clockwise (standard circle method).
    const fixed = arr[0]!
    const rest = arr.slice(1)
    rest.unshift(rest.pop()!)
    arr.splice(0, arr.length, fixed, ...rest)
  }

  return matches
}
