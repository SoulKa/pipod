import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { TournamentStatus } from '@pipod/shared'
import { resetDb } from '../test/db'
import { groupOnly, groupThenKnockout, knockoutOnly } from '../test/phases'
import { db } from '../db/client'
import { tournaments } from '../db/schema'
import { repo } from '../repo'
import { reportLeg } from './matches'
import {
  addParticipant,
  advancePhases,
  cancelTournament,
  createTournament,
  startTournament,
} from './tournaments'
import { syncAllTournamentStatuses, syncTournamentStatus } from './tournamentStatus'

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
    const [final] = startTournament(tournament.id, knockoutOnly())
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

  it('refuses to start without two players, staying in setup', () => {
    const { tournament } = withPlayers(1)
    expect(() => startTournament(tournament.id, knockoutOnly())).toThrow(/two participants/)
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
    const [final] = startTournament(tournament.id, knockoutOnly())

    expect(repo.getTournament(tournament.id)!.status).toBe('active')

    reportLeg(final!.id, 0, players[0]!.id)

    expect(repo.getTournament(tournament.id)!.status).toBe('completed')
  })

  it('stays active while any match is unplayed', () => {
    const { tournament } = withPlayers(4)
    const matches = startTournament(tournament.id, groupOnly())

    reportLeg(matches[0]!.id, 0, matches[0]!.participantAId!)

    expect(repo.getTournament(tournament.id)!.status).toBe('active')
  })

  it('stays active while a bracket still has a pending downstream match', () => {
    const { tournament } = withPlayers(4)
    const matches = startTournament(tournament.id, knockoutOnly())
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
    const [final] = startTournament(tournament.id, knockoutOnly())
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
    startTournament(running.id, groupOnly())

    const changed = syncAllTournamentStatuses()

    expect(changed.map((t) => t.id)).toEqual([stale.id])
    expect(repo.getTournament(running.id)!.status).toBe('active')
  })
})

/**
 * The group→knockout handover: every drawn match is completed, but the bracket has yet
 * to be drawn from the final table, so the tournament must not read as completed.
 */
describe('group → knockout handover', () => {
  beforeEach(resetDb)

  it('stays active between the last group match and the drawn bracket', () => {
    const { tournament } = withPlayers(4)
    const groupMatches = startTournament(tournament.id, groupThenKnockout())
    groupMatches.forEach((m) => reportLeg(m.id, 0, m.participantAId!))

    expect(repo.getTournament(tournament.id)!.status).toBe('active')

    const bracket = advancePhases(tournament.id)
    expect(bracket.length).toBeGreaterThan(0)
    expect(repo.getTournament(tournament.id)!.status).toBe('active')

    // Play the bracket round by round; each round's winners fill the next.
    for (let round = 0; round < 4; round++) {
      repo
        .listMatches(tournament.id)
        .filter((m) => m.status === 'ready')
        .forEach((m) => reportLeg(m.id, 0, m.participantAId!))
    }
    expect(repo.getTournament(tournament.id)!.status).toBe('completed')
  })
})
