import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateStageInput } from '@pi-darts/shared'
import { resetDb } from '../test/db'
import { repo } from '../repo'
import { reportLeg } from './matches'
import {
  addParticipant,
  cancelTournament,
  createFloor,
  createStage,
  createTournament,
  deleteTournament,
  generateStage,
  reactivateTournament,
} from './tournaments'

const stageInput = (over: Partial<CreateStageInput>): CreateStageInput => ({
  name: 'Stage',
  type: 'group',
  format: 'round_robin',
  bestOf: 1,
  startScore: 501,
  outMode: 'double',
  ...over,
})

/** Seed a tournament with `count` participants seeded 1..count. */
function withPlayers(count: number) {
  const tournament = createTournament('T')
  const players = Array.from({ length: count }, (_, i) =>
    addParticipant(tournament.id, `P${i}`, i + 1),
  )
  return { tournament, players }
}

describe('createTournament / addParticipant', () => {
  beforeEach(resetDb)

  it('persists a tournament in setup and lists its participants', () => {
    const { tournament, players } = withPlayers(2)
    expect(repo.getTournament(tournament.id)).toMatchObject({ name: 'T', status: 'setup' })
    expect(repo.listParticipants(tournament.id).map((p) => p.id).sort()).toEqual(
      players.map((p) => p.id).sort(),
    )
  })
})

describe('generateStage — group', () => {
  beforeEach(resetDb)

  it('schedules a full round-robin in a single group', () => {
    const { tournament } = withPlayers(4)
    const stage = createStage(tournament.id, stageInput({ type: 'group' }))
    const matches = generateStage(stage.id, { groupCount: 1 })

    // 4 players, everyone plays everyone once → 6 matches, all immediately playable.
    expect(matches).toHaveLength(6)
    expect(matches.every((m) => m.status === 'ready')).toBe(true)
    expect(repo.listGroups(stage.id)).toHaveLength(1)
    // Generating a stage activates the tournament.
    expect(repo.getTournament(tournament.id)!.status).toBe('active')
  })

  it('snake-drafts participants into balanced groups by seed', () => {
    const { tournament, players } = withPlayers(4)
    const stage = createStage(tournament.id, stageInput({ type: 'group' }))
    generateStage(stage.id, { groupCount: 2 })

    const groups = repo.listGroups(stage.id)
    expect(groups).toHaveLength(2)
    const members = groups.map((g) => repo.listGroupMembers(g.id).sort())
    // Snake draft of seeds [1,2,3,4]: group A = seeds 1 & 4, group B = seeds 2 & 3.
    const [p1, p2, p3, p4] = players
    expect(members).toContainEqual([p1!.id, p4!.id].sort())
    expect(members).toContainEqual([p2!.id, p3!.id].sort())
  })

  it('regenerating a stage replaces prior matches (idempotent)', () => {
    const { tournament } = withPlayers(4)
    const stage = createStage(tournament.id, stageInput({ type: 'group' }))
    generateStage(stage.id, { groupCount: 1 })
    const second = generateStage(stage.id, { groupCount: 1 })
    expect(second).toHaveLength(6)
    expect(repo.listStageMatches(stage.id)).toHaveLength(6)
  })
})

describe('generateStage — knockout', () => {
  beforeEach(resetDb)

  it('builds a bracket seeded by participant seed', () => {
    const { tournament, players } = withPlayers(4)
    const stage = createStage(
      tournament.id,
      stageInput({ type: 'knockout', format: 'single_elimination' }),
    )
    const matches = generateStage(stage.id)

    expect(matches).toHaveLength(3) // 2 first-round + final
    const round0 = matches.filter((m) => m.round === 0)
    // Top seed (1) meets lowest seed (4) in the first match.
    expect(round0[0]).toMatchObject({ participantAId: players[0]!.id, participantBId: players[3]!.id })
    expect(round0.every((m) => m.status === 'ready')).toBe(true)
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
    const stage = createStage(tournament.id, stageInput({ type: 'group' }))
    generateStage(stage.id, { groupCount: 1 })
    cancelTournament(tournament.id)
    expect(reactivateTournament(tournament.id).status).toBe('active')
  })

  it('reactivates a fully-played tournament back to completed', () => {
    const { tournament, players } = withPlayers(2)
    const stage = createStage(
      tournament.id,
      stageInput({ type: 'knockout', format: 'single_elimination' }),
    )
    const [final] = generateStage(stage.id)
    reportLeg(final!.id, 0, players[0]!.id)

    cancelTournament(tournament.id)
    expect(reactivateTournament(tournament.id).status).toBe('completed')
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
    const stage = createStage(tournament.id, stageInput({ type: 'group' }))
    const matches = generateStage(stage.id, { groupCount: 1 })
    reportLeg(matches[0]!.id, 0, matches[0]!.participantAId!)

    deleteTournament(tournament.id)

    expect(repo.getTournament(tournament.id)).toBeUndefined()
    expect(repo.listParticipants(tournament.id)).toHaveLength(0)
    expect(repo.listFloors(tournament.id)).toHaveLength(0)
    expect(repo.listStages(tournament.id)).toHaveLength(0)
    expect(repo.listMatches(tournament.id)).toHaveLength(0)
  })
})
