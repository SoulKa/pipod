// Pure shaping of a knockout stage's flat match list into the rows a bracket tree
// renders. No Vue dependency — the component only lays these out.
import type { Match } from '@pipod/shared'

export interface BracketRound {
  /** The stage's own 0-based round number. */
  round: number
  label: string
  matches: Match[]
}

/** Round names counted back from the final; anything deeper falls back to a number. */
const LABELS_FROM_FINAL = ['Finale', 'Halbfinale', 'Viertelfinale', 'Achtelfinale']

/**
 * Group a knockout stage's matches into rounds, earliest first, each round's matches
 * ordered by slot so they sit above the match their winners feed into.
 */
export function buildBracketRounds(matches: Match[]): BracketRound[] {
  const byRound = new Map<number, Match[]>()
  for (const match of matches) {
    const bucket = byRound.get(match.round)
    if (bucket) bucket.push(match)
    else byRound.set(match.round, [match])
  }

  const ordered = [...byRound.keys()].sort((a, b) => a - b)
  return ordered.map((round, index) => ({
    round,
    label: LABELS_FROM_FINAL[ordered.length - 1 - index] ?? `Runde ${index + 1}`,
    matches: byRound.get(round)!.sort((a, b) => a.slot - b.slot),
  }))
}

/** The tournament winner: whoever won the final. Null while it is undecided. */
export function championOf(rounds: BracketRound[]): string | null {
  return rounds.at(-1)?.matches.at(-1)?.winnerId ?? null
}

/**
 * Index of the round currently in play — the earliest one still holding an unfinished
 * match. Null once everything is done, which callers read as "look at the final".
 */
export function activeRoundIndex(rounds: BracketRound[]): number | null {
  const index = rounds.findIndex((r) => r.matches.some((m) => m.status !== 'completed'))
  return index === -1 ? null : index
}
