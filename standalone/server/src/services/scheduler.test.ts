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
import { assignMatchFloor, reorderFloorQueue } from './matches'
import { maybeAutoAssign, runAutoAssign, setAutoAssign } from './scheduler'

/** Round-robin group stage with `count` players (best-of-1, single group). */
function seedGroup(count: number) {
  const tournament = createTournament('T')
  const players = Array.from({ length: count }, (_, i) =>
    addParticipant(tournament.id, `P${i}`, i + 1),
  )
  const input: CreateStageInput = {
    name: 'RR',
    type: 'group',
    format: 'round_robin',
    bestOf: 1,
    startScore: 501,
    outMode: 'double',
  }
  const stage = createStage(tournament.id, input)
  const matches = generateStage(stage.id, { groupCount: 1 })
  return { tournament, players, matches }
}

const playersOf = (m: Match) => [m.participantAId, m.participantBId].filter(Boolean) as string[]

describe('runAutoAssign', () => {
  beforeEach(resetDb)

  it('balances disjoint round-0 matches one per floor and leaves conflicts unassigned', () => {
    const { tournament } = seedGroup(4)
    const floors = [createFloor(tournament.id, 'A'), createFloor(tournament.id, 'B')]

    runAutoAssign(tournament.id)

    // Round 0 has two player-disjoint matches → exactly one lands on each floor.
    const queues = floors.map((f) => repo.listFloorQueue(f.id))
    expect(queues[0]).toHaveLength(1)
    expect(queues[1]).toHaveLength(1)

    // The two scheduled matches never share a player.
    const scheduledPlayers = queues.flat().flatMap(playersOf)
    expect(new Set(scheduledPlayers).size).toBe(scheduledPlayers.length)

    // A 4-player round robin has 6 matches; the other 4 wait in the backlog.
    const backlog = repo
      .listMatches(tournament.id)
      .filter((m) => m.status === 'ready' && m.floorId === null)
    expect(backlog).toHaveLength(4)
  })

  it('never queues the same player twice even with a single floor', () => {
    const { tournament } = seedGroup(3)
    const floor = createFloor(tournament.id, 'A')

    runAutoAssign(tournament.id)

    // Every remaining match shares a player with the one scheduled match → only one fits.
    expect(repo.listFloorQueue(floor.id)).toHaveLength(1)
  })
})

describe('queue ordering', () => {
  beforeEach(resetDb)

  function twoDisjointReady(count = 4) {
    const seeded = seedGroup(count)
    const round0 = seeded.matches.filter((m) => m.round === 0)
    return { ...seeded, m0: round0[0]!, m1: round0[1]! }
  }

  it('appends by default and honors an explicit insert position', () => {
    const { tournament, m0, m1 } = twoDisjointReady()
    const floor = createFloor(tournament.id, 'A')

    assignMatchFloor(m0.id, floor.id)
    assignMatchFloor(m1.id, floor.id, 0) // insert m1 ahead of m0

    expect(repo.listFloorQueue(floor.id).map((m) => m.id)).toEqual([m1.id, m0.id])
    expect(repo.getMatch(m1.id)!.queueOrder).toBe(0)
    expect(repo.getMatch(m0.id)!.queueOrder).toBe(1)
  })

  it('reorderFloorQueue rewrites play order', () => {
    const { tournament, m0, m1 } = twoDisjointReady()
    const floor = createFloor(tournament.id, 'A')
    assignMatchFloor(m0.id, floor.id)
    assignMatchFloor(m1.id, floor.id)

    reorderFloorQueue(floor.id, [m1.id, m0.id])

    expect(repo.listFloorQueue(floor.id).map((m) => m.id)).toEqual([m1.id, m0.id])
  })

  it('unassigning sends a match back to the backlog and renumbers the floor', () => {
    const { tournament, m0, m1 } = twoDisjointReady()
    const floor = createFloor(tournament.id, 'A')
    assignMatchFloor(m0.id, floor.id)
    assignMatchFloor(m1.id, floor.id)

    assignMatchFloor(m0.id, null)

    expect(repo.getMatch(m0.id)!.floorId).toBeNull()
    const queue = repo.listFloorQueue(floor.id)
    expect(queue.map((m) => m.id)).toEqual([m1.id])
    expect(queue[0]!.queueOrder).toBe(0)
  })
})

describe('auto-fill flag', () => {
  beforeEach(resetDb)

  it('maybeAutoAssign is a no-op until the flag is enabled', () => {
    const { tournament } = seedGroup(4)
    createFloor(tournament.id, 'A')
    createFloor(tournament.id, 'B')

    maybeAutoAssign(tournament.id)
    expect(repo.listMatches(tournament.id).every((m) => m.floorId === null)).toBe(true)

    const updated = setAutoAssign(tournament.id, true)
    expect(updated.autoAssign).toBe(true)
    expect(repo.getTournament(tournament.id)!.autoAssign).toBe(true)
    // Enabling runs an immediate pass → the two disjoint round-0 matches are scheduled.
    expect(repo.listMatches(tournament.id).filter((m) => m.floorId !== null)).toHaveLength(2)
  })
})
