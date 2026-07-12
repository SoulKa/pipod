import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateStageInput, Match } from '@pi-darts/shared'
import { resetDb } from '../test/db'
import { repo } from '../repo'
import {
  addParticipant,
  createFloor,
  createStage,
  createTournament,
  generateStage,
} from './tournaments'
import {
  assignMatchFloor,
  claimMatch,
  dispatchMatch,
  legsToWin,
  reportLeg,
} from './matches'

describe('legsToWin', () => {
  it.each([
    [1, 1],
    [3, 2],
    [5, 3],
    [7, 4],
  ])('best-of-%i needs %i legs', (bestOf, expected) => {
    expect(legsToWin(bestOf)).toBe(expected)
  })
})

/** Create a knockout stage seeded 1..count and return its generated matches. */
function seedKnockout(count: number, bestOf: number) {
  const tournament = createTournament('T')
  const players = Array.from({ length: count }, (_, i) =>
    addParticipant(tournament.id, `P${i}`, i + 1),
  )
  const input: CreateStageInput = {
    name: 'KO',
    type: 'knockout',
    format: 'single_elimination',
    bestOf,
    startScore: 501,
    outMode: 'double',
  }
  const stage = createStage(tournament.id, input)
  const matches = generateStage(stage.id)
  return { tournament, players, stage, matches }
}

const round0 = (matches: Match[]) => matches.filter((m) => m.round === 0)
const finalOf = (matches: Match[]) => matches.find((m) => m.nextMatchId === null)!

describe('reportLeg', () => {
  beforeEach(resetDb)

  it('rejects a winner who is not in the match', () => {
    const { matches } = seedKnockout(4, 1)
    const match = round0(matches)[0]!
    expect(() => reportLeg(match.id, 0, 'nobody')).toThrow(/not a participant/)
  })

  it('accumulates legs and completes the match at best-of threshold', () => {
    const { matches } = seedKnockout(4, 3)
    const match = round0(matches)[0]!
    const winner = match.participantAId!

    const first = reportLeg(match.id, 0, winner)
    expect(first.match.status).toBe('live')
    expect(first.match.legsA).toBe(1)

    const second = reportLeg(match.id, 1, winner)
    expect(second.match.status).toBe('completed')
    expect(second.match.legsA).toBe(2)
    expect(second.match.winnerId).toBe(winner)
  })

  it('advances both winners into the final, flipping it to ready', () => {
    const { matches } = seedKnockout(4, 1)
    const [m0, m1] = round0(matches)
    const final = finalOf(matches)

    reportLeg(m0!.id, 0, m0!.participantAId!)
    // Only one side filled → final still waiting.
    expect(repo.getMatch(final.id)!.status).toBe('pending')

    reportLeg(m1!.id, 0, m1!.participantBId!)
    const filledFinal = repo.getMatch(final.id)!
    expect(filledFinal.status).toBe('ready')
    // m0 feeds slot a, m1 feeds slot b (bracket link order).
    expect(filledFinal.participantAId).toBe(m0!.participantAId)
    expect(filledFinal.participantBId).toBe(m1!.participantBId)
  })
})

describe('resolveByes (via generateStage)', () => {
  beforeEach(resetDb)

  it('auto-completes a single-participant match and advances the winner', () => {
    // Three seeds pad to a size-4 bracket; the top seed (seed 1) draws a bye.
    const { players, matches } = seedKnockout(3, 1)
    const topSeed = players[0]! // seed 1

    const bye = round0(matches).find((m) => m.participantBId === null)!
    expect(bye).toMatchObject({ status: 'completed', winnerId: topSeed.id })

    const final = finalOf(matches)
    expect(final.participantAId).toBe(topSeed.id)
  })
})

describe('match lifecycle guards', () => {
  beforeEach(resetDb)

  it('claims a ready match, then refuses to re-claim a completed one', () => {
    const { matches } = seedKnockout(4, 1)
    const match = round0(matches)[0]!

    expect(claimMatch(match.id).status).toBe('live')

    reportLeg(match.id, 0, match.participantAId!)
    expect(() => claimMatch(match.id)).toThrow(/already completed/)
  })

  it('assigns a floor only to a ready match in the same tournament', () => {
    const { tournament, matches } = seedKnockout(4, 1)
    const match = round0(matches)[0]!
    const floor = createFloor(tournament.id, 'Floor 1')

    const other = createTournament('Other')
    const otherFloor = createFloor(other.id, 'Elsewhere')
    expect(() => assignMatchFloor(match.id, otherFloor.id)).toThrow(/does not belong/)

    expect(assignMatchFloor(match.id, floor.id).floorId).toBe(floor.id)
  })

  it('dispatches a match to its assigned floor', () => {
    const { tournament, matches } = seedKnockout(4, 1)
    const match = round0(matches)[0]!
    const floor = createFloor(tournament.id, 'Floor 1')
    assignMatchFloor(match.id, floor.id)

    expect(() => dispatchMatch(match.id, 'wrong-floor')).toThrow(/not ready for this floor/)
    expect(dispatchMatch(match.id, floor.id).status).toBe('live')
  })
})
