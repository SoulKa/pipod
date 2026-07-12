// Overview live state is derived from the board's durable full snapshot, never from
// an independently reconstructed sequence of per-dart socket messages.
import type { BoardGameSnapshot, LiveMatchState, Match } from '@pi-darts/shared'

export function createMatchSnapshot(
  match: Match,
  participants: { id: string; name: string }[],
): BoardGameSnapshot {
  const participantIds = [match.participantAId, match.participantBId].filter(
    (id): id is string => !!id,
  )
  const names = new Map(participants.map((participant) => [participant.id, participant.name]))
  return {
    phase: 'playing',
    options: { startScore: match.startScore as 301 | 501, outMode: match.outMode },
    players: participantIds.map((id) => ({
      name: names.get(id) ?? 'Unknown',
      score: match.startScore,
      lastThrows: [],
    })),
    currentPlayerIndex: 0,
    currentThrows: [],
    finishOrder: [],
    bannerIndex: null,
    history: [],
    tournament: {
      activeMatchId: match.id,
      participantIds,
      legIndex: match.legsA + match.legsB,
      legsA: match.legsA,
      legsB: match.legsB,
    },
  }
}

export function deriveLiveMatchState(snapshot: BoardGameSnapshot): LiveMatchState | null {
  const tournament = snapshot.tournament
  if (!tournament) return null
  return {
    matchId: tournament.activeMatchId,
    legIndex: tournament.legIndex,
    currentParticipantId: tournament.participantIds[snapshot.currentPlayerIndex] ?? null,
    legsA: tournament.legsA,
    legsB: tournament.legsB,
    scores: tournament.participantIds.map((participantId, index) => {
      const player = snapshot.players[index]
      return {
        participantId,
        remaining: player?.score ?? 0,
        // The active turn has not yet been copied into lastThrows by the board engine.
        lastThrows:
          index === snapshot.currentPlayerIndex
            ? snapshot.currentThrows
            : (player?.lastThrows ?? []),
      }
    }),
  }
}
