import type { Match } from '@pipod/shared'

/**
 * Matches whose players are known but haven't started, roughly in the order they will be
 * played: those already queued on a board first, by queue position, then the backlog. The
 * viewers are the players waiting for their turn, so this is what they look for.
 */
export function upNextMatches(matches: Match[]): Match[] {
  return matches
    .filter((m) => m.status === 'ready' && m.participantAId && m.participantBId)
    .sort(
      (a, b) =>
        Number(a.floorId === null) - Number(b.floorId === null) ||
        a.queueOrder - b.queueOrder ||
        a.round - b.round ||
        a.slot - b.slot,
    )
}
