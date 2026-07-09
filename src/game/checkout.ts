import type { DartThrow, Multiplier, OutMode } from './useDartGame'

// A single way to finish: the darts to throw, in order, finishing dart last.
export interface CheckoutRoute {
  darts: DartThrow[]
  label: string
}

// Highest single dart is T20 = 60; used to bound what's reachable.
const MAX_DART = 60

// Every legal scoring dart: singles/doubles/trebles 1–20, single bull (25),
// double bull (50). No miss and no treble-25 (illegal, see NumberPad.isIllegal).
const DART_OPTIONS: DartThrow[] = (() => {
  const opts: DartThrow[] = []
  for (let base = 1; base <= 20; base++) {
    for (const multiplier of [1, 2, 3] as Multiplier[]) {
      opts.push({ base, multiplier, points: base * multiplier })
    }
  }
  opts.push({ base: 25, multiplier: 1, points: 25 })
  opts.push({ base: 25, multiplier: 2, points: 50 })
  return opts
})()

function isDouble(d: DartThrow): boolean {
  return d.multiplier === 2
}

export function dartLabel(base: number, multiplier: Multiplier): string {
  if (base === 25) return multiplier === 2 ? 'Bull' : '25'
  const prefix = multiplier === 2 ? 'D' : multiplier === 3 ? 'T' : ''
  return `${prefix}${base}`
}

// Lower = more preferred as a *setup* dart (trebles first, then bull, singles, doubles).
function setupWeight(d: DartThrow): number {
  if (d.multiplier === 3) return 20 - d.base // T20 best … T1 worst
  if (d.base === 25) return d.multiplier === 2 ? 25 : 26 // bull 50 / 25
  if (d.multiplier === 1) return 30 + (20 - d.base) // singles
  return 50 + (20 - d.base) // doubles are a poor setup
}

// Lower = more preferred as the *finishing* dart.
function finishWeight(d: DartThrow, outMode: OutMode): number {
  if (outMode === 'double') return d.base === 25 ? 40 : 20 - d.base // D20 best, bull last
  return MAX_DART - d.points // single-out: prefer a bigger finishing dart
}

// All multisets of 1..maxDarts darts whose points sum exactly to `target`.
// Non-decreasing option index avoids counting permutations twice.
function setupCombos(target: number, maxDarts: number): DartThrow[][] {
  const results: DartThrow[][] = []
  const current: DartThrow[] = []
  const rec = (startIdx: number, remaining: number) => {
    if (remaining === 0) {
      results.push([...current])
      return
    }
    if (current.length === maxDarts) return
    for (let i = startIdx; i < DART_OPTIONS.length; i++) {
      const d = DART_OPTIONS[i]!
      if (d.points > remaining) continue
      current.push(d)
      rec(i, remaining - d.points)
      current.pop()
    }
  }
  rec(0, target)
  return results
}

/**
 * Suggest up to `maxRoutes` ways to finish from `score` using at most `dartsLeft`
 * darts, respecting the out mode (single-out: any finishing dart; double-out: the
 * finishing dart must be a double, incl. bull 50). Routes are ranked fewest-darts
 * first, then by a preference favouring trebles/bull for setup and standard doubles
 * to finish. Returns [] when no finish is possible this turn.
 */
export function suggestCheckouts(
  score: number,
  dartsLeft: number,
  outMode: OutMode,
  maxRoutes = 3,
): CheckoutRoute[] {
  const minFinish = outMode === 'double' ? 2 : 1
  if (dartsLeft < 1 || score < minFinish || score > MAX_DART * dartsLeft) return []

  const finishingDarts =
    outMode === 'double' ? DART_OPTIONS.filter(isDouble) : DART_OPTIONS

  interface Ranked {
    darts: DartThrow[]
    len: number
    setupSum: number
    finishW: number
    label: string
  }

  const ranked: Ranked[] = []
  for (const finish of finishingDarts) {
    const remaining = score - finish.points
    if (remaining < 0) continue

    // Setup darts needed before the finish (0 when the finish alone hits the score).
    const setups = remaining === 0 ? [[]] : setupCombos(remaining, dartsLeft - 1)
    for (const setup of setups) {
      const ordered = [...setup].sort((a, b) => setupWeight(a) - setupWeight(b))
      const darts = [...ordered, finish]
      ranked.push({
        darts,
        len: darts.length,
        setupSum: ordered.reduce((sum, d) => sum + setupWeight(d), 0),
        finishW: finishWeight(finish, outMode),
        label: darts.map((d) => dartLabel(d.base, d.multiplier)).join(' '),
      })
    }
  }

  ranked.sort(
    (a, b) =>
      a.len - b.len ||
      a.setupSum - b.setupSum ||
      a.finishW - b.finishW ||
      a.label.localeCompare(b.label),
  )

  const seen = new Set<string>()
  const routes: CheckoutRoute[] = []
  for (const r of ranked) {
    if (seen.has(r.label)) continue
    seen.add(r.label)
    routes.push({ darts: r.darts, label: r.label })
    if (routes.length >= maxRoutes) break
  }
  return routes
}
