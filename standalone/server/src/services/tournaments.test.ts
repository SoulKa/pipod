import { beforeEach, describe, expect, it } from 'vitest'
import { configurePhasesSchema } from '@pipod/shared'
import { resetDb } from '../test/db'
import {
  groupOnly,
  groupPhase,
  groupThenKnockout,
  knockoutOnly,
  knockoutPhase,
} from '../test/phases'
import { finishedButStoredAs, withPlayers } from '../test/tournaments'
import { repo } from '../repo'
import { reportLeg } from './matches'
import {
  advancePhases,
  cancelTournament,
  configurePhases,
  createFloor,
  deleteTournament,
  reactivateTournament,
  startTournament,
} from './tournaments'

describe('createTournament / addParticipant', () => {
  beforeEach(resetDb)

  it('persists a tournament in setup and lists its participants', () => {
    const { tournament, players } = withPlayers(2)
    expect(repo.getTournament(tournament.id)).toMatchObject({ name: 'T', status: 'setup' })
    expect(
      repo
        .listParticipants(tournament.id)
        .map((p) => p.id)
        .sort(),
    ).toEqual(players.map((p) => p.id).sort())
  })
})

describe('configurePhases', () => {
  beforeEach(resetDb)

  it('stores both phases in play order with their settings', () => {
    const { tournament } = withPlayers(4)
    configurePhases(tournament.id, {
      knockout: knockoutPhase({ bestOf: 5, qualifiersPerGroup: 1 }),
      group: groupPhase({ groupCount: 2 }),
    })

    expect(repo.listStages(tournament.id)).toMatchObject([
      { type: 'group', groupCount: 2 },
      { type: 'knockout', bestOf: 5, qualifiersPerGroup: 1 },
    ])
  })

  it('replaces the previous setup instead of adding to it', () => {
    const { tournament } = withPlayers(4)
    configurePhases(tournament.id, groupThenKnockout())
    configurePhases(tournament.id, knockoutOnly())

    // Everyone plays a bracket without a group phase, so there is no cut to store.
    expect(repo.listStages(tournament.id)).toMatchObject([
      { type: 'knockout', qualifiersPerGroup: null },
    ])
  })

  it('refuses to change phases once the tournament has started', () => {
    const { tournament } = withPlayers(2)
    startTournament(tournament.id, groupOnly())

    expect(() => configurePhases(tournament.id, groupOnly({ groupCount: 2 }))).toThrow(/started/)
  })

  it('rejects a setup with no phase, or a bracket with a single qualifier', () => {
    expect(configurePhasesSchema.safeParse({ group: null, knockout: null }).success).toBe(false)
    expect(
      configurePhasesSchema.safeParse(
        groupThenKnockout({ groupCount: 1 }, { qualifiersPerGroup: 1 }),
      ).success,
    ).toBe(false)
  })
})

describe('startTournament', () => {
  beforeEach(resetDb)

  it('draws only the group phase when both phases are on', () => {
    const { tournament } = withPlayers(4)

    const matches = startTournament(tournament.id, groupThenKnockout())

    const [group, knockout] = repo.listStages(tournament.id)
    expect(matches.every((m) => m.stageId === group!.id)).toBe(true)
    expect(repo.listStageMatches(knockout!.id)).toHaveLength(0)
    expect(repo.getTournament(tournament.id)!.status).toBe('active')
  })

  it('refuses to start twice', () => {
    const { tournament } = withPlayers(2)
    startTournament(tournament.id, knockoutOnly())
    expect(() => startTournament(tournament.id, knockoutOnly())).toThrow(/started/)
  })

  it('keeps the previous setup when the start is refused', () => {
    const { tournament } = withPlayers(1)
    configurePhases(tournament.id, groupOnly({ bestOf: 5 }))

    expect(() => startTournament(tournament.id, knockoutOnly())).toThrow(/two participants/)
    expect(repo.listStages(tournament.id)).toMatchObject([{ type: 'group', bestOf: 5 }])
  })

  it('refuses a cut that leaves one qualifier once the groups are drawn', () => {
    // Two groups of one qualifier is fine on paper, but three players make a single group.
    const { tournament } = withPlayers(3)
    const setup = groupThenKnockout({ groupCount: 2 }, { qualifiersPerGroup: 1 })

    expect(() => startTournament(tournament.id, setup)).toThrow(/at least two qualifiers/)
    expect(repo.listMatches(tournament.id)).toHaveLength(0)
  })

  it('schedules a full round-robin in a single group', () => {
    const { tournament } = withPlayers(4)
    const matches = startTournament(tournament.id, groupOnly())

    // 4 players, everyone plays everyone once → 6 matches, all immediately playable.
    expect(matches).toHaveLength(6)
    expect(matches.every((m) => m.status === 'ready')).toBe(true)
    expect(repo.listGroups(matches[0]!.stageId)).toHaveLength(1)
  })

  it('snake-drafts participants into balanced groups by seed', () => {
    const { tournament, players } = withPlayers(4)
    const [match] = startTournament(tournament.id, groupOnly({ groupCount: 2 }))

    const groups = repo.listGroups(match!.stageId)
    expect(groups).toHaveLength(2)
    const members = groups.map((g) => repo.listGroupMembers(g.id).sort())
    // Snake draft of seeds [1,2,3,4]: group A = seeds 1 & 4, group B = seeds 2 & 3.
    const [p1, p2, p3, p4] = players
    expect(members).toContainEqual([p1!.id, p4!.id].sort())
    expect(members).toContainEqual([p2!.id, p3!.id].sort())
  })

  it('never makes a group too small to play a match', () => {
    const { tournament } = withPlayers(3)
    const matches = startTournament(tournament.id, groupOnly({ groupCount: 3 }))

    // Three groups of one would leave nothing to play; one group of three plays 3 matches.
    expect(repo.listGroups(matches[0]!.stageId)).toHaveLength(1)
    expect(matches).toHaveLength(3)
  })

  it('builds a knockout-only bracket seeded by participant seed', () => {
    const { tournament, players } = withPlayers(4)
    const matches = startTournament(tournament.id, knockoutOnly())

    expect(matches).toHaveLength(3) // 2 first-round + final
    const round0 = matches.filter((m) => m.round === 0)
    // Top seed (1) meets lowest seed (4) in the first match.
    expect(round0[0]).toMatchObject({
      participantAId: players[0]!.id,
      participantBId: players[3]!.id,
    })
    expect(round0.every((m) => m.status === 'ready')).toBe(true)
  })
})

describe('advancePhases', () => {
  beforeEach(resetDb)

  function startBothPhases(players: number, groupCount: number, qualifiersPerGroup: number) {
    const seeded = withPlayers(players)
    const groupMatches = startTournament(
      seeded.tournament.id,
      groupThenKnockout({ groupCount }, { qualifiersPerGroup }),
    )
    const knockout = repo.getKnockoutStage(seeded.tournament.id)!
    return { ...seeded, knockout, groupMatches }
  }

  it('waits for the last group match before drawing the bracket', () => {
    const { tournament, knockout, groupMatches } = startBothPhases(4, 1, 2)
    const [last, ...rest] = groupMatches
    rest.forEach((m) => reportLeg(m.id, 0, m.participantAId!))

    expect(advancePhases(tournament.id)).toEqual([])
    expect(repo.listStageMatches(knockout.id)).toHaveLength(0)

    reportLeg(last!.id, 0, last!.participantAId!)
    expect(advancePhases(tournament.id)).toHaveLength(1)
    // Drawn once; later completions leave the bracket alone.
    expect(advancePhases(tournament.id)).toEqual([])
    expect(repo.listStageMatches(knockout.id)).toHaveLength(1)
  })

  it('seeds the bracket with the qualifiers of every group, winners first', () => {
    // Snake draft of seeds 1-4 into two groups: A = 1 & 4, B = 2 & 3.
    const { tournament, players, groupMatches } = startBothPhases(4, 2, 1)
    // The lower seed wins each group, so the qualifiers are seeds 4 and 3.
    for (const m of groupMatches) {
      const [a, b] = [m.participantAId!, m.participantBId!]
      const rank = (id: string) => players.findIndex((p) => p.id === id)
      reportLeg(m.id, 0, rank(a) > rank(b) ? a : b)
    }

    const [final] = advancePhases(tournament.id)

    expect([final!.participantAId, final!.participantBId].sort()).toEqual(
      [players[3]!.id, players[2]!.id].sort(),
    )
    expect(final!.status).toBe('ready')
  })

  it('does nothing for a single-phase tournament', () => {
    const { tournament } = withPlayers(2)
    const [only] = startTournament(tournament.id, groupOnly())
    reportLeg(only!.id, 0, only!.participantAId!)

    expect(advancePhases(tournament.id)).toEqual([])
    expect(repo.getTournament(tournament.id)!.status).toBe('completed')
  })
})

describe('cancel / reactivate status derivation', () => {
  beforeEach(resetDb)

  it('reactivates a match-less tournament back to setup', () => {
    const { tournament } = withPlayers(2)
    expect(cancelTournament(tournament.id).status).toBe('cancelled')
    expect(reactivateTournament(tournament.id).status).toBe('setup')
  })

  it('reactivates a partially-played tournament back to active', () => {
    const { tournament } = withPlayers(4)
    startTournament(tournament.id, groupOnly())
    cancelTournament(tournament.id)
    expect(reactivateTournament(tournament.id).status).toBe('active')
  })

  it('reactivates a fully-played tournament back to completed', () => {
    const tournament = finishedButStoredAs('cancelled')
    expect(reactivateTournament(tournament.id).status).toBe('completed')
  })

  it('refuses to cancel a completed tournament', () => {
    const tournament = finishedButStoredAs('completed')
    expect(() => cancelTournament(tournament.id)).toThrow(/already over/)
    expect(repo.getTournament(tournament.id)!.status).toBe('completed')
  })

  it('refuses to cancel a tournament twice', () => {
    const { tournament } = withPlayers(2)
    cancelTournament(tournament.id)
    expect(() => cancelTournament(tournament.id)).toThrow(/already over/)
  })

  it('refuses to reactivate a tournament that is not cancelled', () => {
    const { tournament } = withPlayers(2)
    expect(() => reactivateTournament(tournament.id)).toThrow(/not cancelled/)
  })
})

describe('deleteTournament', () => {
  beforeEach(resetDb)

  it('removes the tournament and every dependent row', () => {
    const { tournament } = withPlayers(4)
    createFloor(tournament.id, 'Floor 1')
    const matches = startTournament(tournament.id, groupOnly())
    reportLeg(matches[0]!.id, 0, matches[0]!.participantAId!)

    deleteTournament(tournament.id)

    expect(repo.getTournament(tournament.id)).toBeUndefined()
    expect(repo.listParticipants(tournament.id)).toHaveLength(0)
    expect(repo.listFloors(tournament.id)).toHaveLength(0)
    expect(repo.listStages(tournament.id)).toHaveLength(0)
    expect(repo.listMatches(tournament.id)).toHaveLength(0)
  })
})
