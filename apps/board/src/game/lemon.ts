// Type-only import: a value import would cycle, since useDartGame imports isLemonTurn.
import type { DartThrow } from './useDartGame'

// The 5-1-20 cluster sits side by side at the top of the board, so hitting all three
// singles means you were aiming at 20 and sprayed. Scores 26 — the classic "lemon".
const LEMON_NUMBERS = [1, 5, 20]

/** True when a completed turn is three single darts on 5, 1 and 20 in any order. */
export function isLemonTurn(throws: DartThrow[]): boolean {
  if (throws.length !== LEMON_NUMBERS.length) return false
  if (throws.some((dart) => dart.multiplier !== 1)) return false

  const bases = throws.map((dart) => dart.base).sort((a, b) => a - b)
  return LEMON_NUMBERS.every((n, i) => bases[i] === n)
}
