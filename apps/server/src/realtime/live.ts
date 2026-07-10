// In-memory mirror of in-progress match scoring, used only to feed overview
// screens. The board remains the authority; on each leg result the mirror resets,
// which also corrects any transient drift (e.g. from a bust).
import type { DartThrow, LiveMatchState, Match } from '@pi-darts/shared'

const live = new Map<string, LiveMatchState>()

/** Begin (or restart) live tracking for a match at a fresh leg. */
export function startLive(match: Match): LiveMatchState {
  const ids = [match.participantAId, match.participantBId].filter((id): id is string => !!id)
  const state: LiveMatchState = {
    matchId: match.id,
    legIndex: match.legsA + match.legsB,
    currentParticipantId: ids[0] ?? null,
    legsA: match.legsA,
    legsB: match.legsB,
    scores: ids.map((participantId) => ({
      participantId,
      remaining: match.startScore,
      lastThrows: [],
    })),
  }
  live.set(match.id, state)
  return state
}

export function getLive(matchId: string): LiveMatchState | undefined {
  return live.get(matchId)
}

/** Apply a single dart to the live mirror (subtract points, roll last-3 darts). */
export function applyThrow(
  matchId: string,
  participantId: string,
  dart: DartThrow,
): LiveMatchState | undefined {
  const state = live.get(matchId)
  if (!state) return undefined
  const score = state.scores.find((s) => s.participantId === participantId)
  if (!score) return undefined

  score.remaining = Math.max(0, score.remaining - dart.points)
  score.lastThrows = [...score.lastThrows, dart].slice(-3)
  state.currentParticipantId = participantId
  return state
}

/** Reset both players' remaining scores for the next leg. */
export function resetLeg(match: Match): LiveMatchState | undefined {
  const state = live.get(match.id)
  if (!state) return undefined
  state.legIndex = match.legsA + match.legsB
  state.legsA = match.legsA
  state.legsB = match.legsB
  for (const s of state.scores) {
    s.remaining = match.startScore
    s.lastThrows = []
  }
  return state
}

export function endLive(matchId: string): void {
  live.delete(matchId)
}
