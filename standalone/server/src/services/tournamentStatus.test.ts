import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { CreateStageInput, TournamentStatus } from '@pipod/shared'
import { resetDb } from '../test/db'
import { db } from '../db/client'
import { tournaments } from '../db/schema'
import { repo } from '../repo'
import { reportLeg } from './matches'
import {
  addParticipant,
  cancelTournament,
  createStage,
  createTournament,
  generateStage,
} from './tournaments'
import { syncAllTournamentStatuses, syncTournamentStatus } from './tournamentStatus'

const stageInput = (over: Partial<CreateStageInput>): CreateStageInput => ({
  name: 'Stage',
  type: 'group',
  format: 'round_robin',
  bestOf: 1,
  startScore: 501,
  outMode: 'double',
  ...over,
})

const knockoutInput = () => stageInput({ type: 'knockout', format: 'single_elimination' })

/** Seed a tournament with `count` participants seeded 1..count. */
function withPlayers(count: number) {
  const tournament = createTournament('T')
  const players = Array.from({ length: count }, (_, i) =>
    addParticipant(tournament.id, `P${i}`, i + 1),
  )
  return { tournament, players }
}

describe('syncTournamentStatus', () => {
  beforeEach(resetDb)

  it('leaves a cancelled tournament cancelled even when every match is done', () => {
    const { tournament, players } = withPlayers(2)
    const stage = createStage(tournament.id, knockoutInput())
    const [final] = generateStage(stage.id)
    reportLeg(final!.id, 0, players[0]!.id)
    cancelTournament(tournament.id)

    expect(syncTournamentStatus(tournament.id)).toBeNull()
    expect(repo.getTournament(tournament.id)!.status).toBe('cancelled')
  })

  it('returns null when the derived status already matches the stored one', () => {
    const { tournament } = withPlayers(2)
    expect(syncTournamentStatus(tournament.id)).toBeNull()
    expect(repo.getTournament(tournament.id)!.status).toBe('setup')
  })

  it('falls back to setup when a stage generates no matches at all', () => {
    // A one-player bracket has nothing to schedule, so the tournament is still
    // being set up despite generateStage having flipped it to active.
    const { tournament } = withPlayers(1)
    const stage = createStage(tournament.id, knockoutInput())

    expect(generateStage(stage.id)).toHaveLength(0)
    expect(repo.getTournament(tournament.id)!.status).toBe('setup')
  })

  it('throws for an unknown tournament', () => {
    expect(() => syncTournamentStatus('nope')).toThrow(/not found/)
  })
})

describe('completion on the deciding leg', () => {
  beforeEach(resetDb)

  it('completes the tournament when the final match is decided', () => {
    const { tournament, players } = withPlayers(2)
    const stage = createStage(tournament.id, knockoutInput())
    const [final] = generateStage(stage.id)

    expect(repo.getTournament(tournament.id)!.status).toBe('active')

    reportLeg(final!.id, 0, players[0]!.id)

    expect(repo.getTournament(tournament.id)!.status).toBe('completed')
  })

  it('stays active while any match is unplayed', () => {
    const { tournament } = withPlayers(4)
    const stage = createStage(tournament.id, stageInput({ type: 'group' }))
    const matches = generateStage(stage.id, { groupCount: 1 })

    reportLeg(matches[0]!.id, 0, matches[0]!.participantAId!)

    expect(repo.getTournament(tournament.id)!.status).toBe('active')
  })

  it('stays active while a bracket still has a pending downstream match', () => {
    const { tournament } = withPlayers(4)
    const stage = createStage(tournament.id, knockoutInput())
    const matches = generateStage(stage.id)
    const round0 = matches.filter((m) => m.round === 0)

    round0.forEach((m) => reportLeg(m.id, 0, m.participantAId!))

    expect(repo.getTournament(tournament.id)!.status).toBe('active')
  })
})

/**
 * Statuses are only re-derived when something happens, so a tournament that finished
 * before this rule existed keeps whatever it was last written with. Reconciling at
 * startup heals those rows.
 */
describe('syncAllTournamentStatuses', () => {
  beforeEach(resetDb)

  /** Play a tournament to its end, then force its row back to a stale status. */
  function finishedButStoredAs(status: TournamentStatus) {
    const { tournament, players } = withPlayers(2)
    const stage = createStage(tournament.id, knockoutInput())
    const [final] = generateStage(stage.id)
    reportLeg(final!.id, 0, players[0]!.id)
    db.update(tournaments).set({ status }).where(eq(tournaments.id, tournament.id)).run()
    return tournament
  }

  it('completes a tournament left behind as active', () => {
    const stale = finishedButStoredAs('active')

    const changed = syncAllTournamentStatuses()

    expect(changed.map((t) => t.id)).toEqual([stale.id])
    expect(repo.getTournament(stale.id)!.status).toBe('completed')
  })

  it('leaves a cancelled tournament alone', () => {
    const stale = finishedButStoredAs('cancelled')

    expect(syncAllTournamentStatuses()).toEqual([])
    expect(repo.getTournament(stale.id)!.status).toBe('cancelled')
  })

  it('reports nothing when every tournament is already correct', () => {
    finishedButStoredAs('completed')
    expect(syncAllTournamentStatuses()).toEqual([])
  })

  it('reconciles each tournament independently', () => {
    const stale = finishedButStoredAs('active')
    const { tournament: running } = withPlayers(4)
    const stage = createStage(running.id, stageInput({ type: 'group' }))
    generateStage(stage.id, { groupCount: 1 })

    const changed = syncAllTournamentStatuses()

    expect(changed.map((t) => t.id)).toEqual([stale.id])
    expect(repo.getTournament(running.id)!.status).toBe('active')
  })
})

/**
 * The group→knockout window: every match is completed while the operator has yet to
 * generate the next stage, so the tournament briefly reads as completed. Generating
 * the knockout must put it back to active.
 */
describe('group → knockout window', () => {
  beforeEach(resetDb)

  it('completes after the group stage, then reactivates when the knockout is generated', () => {
    const { tournament } = withPlayers(2)
    const group = createStage(tournament.id, stageInput({ type: 'group' }))
    const groupMatches = generateStage(group.id, { groupCount: 1 })
    groupMatches.forEach((m) => reportLeg(m.id, 0, m.participantAId!))

    expect(repo.getTournament(tournament.id)!.status).toBe('completed')

    const knockout = createStage(tournament.id, knockoutInput())
    generateStage(knockout.id)

    expect(repo.getTournament(tournament.id)!.status).toBe('active')
  })
})
