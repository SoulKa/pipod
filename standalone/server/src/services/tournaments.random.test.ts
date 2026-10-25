// Randomised tournaments: random rosters, phase setups and results, played to the end
// through the same services the routes use. Each run checks the rules that must hold for
// any tournament, not one expected outcome. Seeds are fixed, so every run is reproducible;
// raise RUNS locally to search wider.
import { beforeEach, describe, expect, it } from 'vitest'
import type { ConfigurePhasesInput, Match, Participant } from '@pipod/shared'
import { computeStandings } from '../engine'
import { resetDb } from '../test/db'
import { groupPhase, knockoutPhase } from '../test/phases'
import { repo } from '../repo'
import { legsToWin, reportLeg } from './matches'
import { addParticipant, advancePhases, createTournament, startTournament } from './tournaments'

const RUNS = 150

/** mulberry32: a tiny seeded generator, so every run is reproducible from its seed. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rng = () => number
const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!

function randomSetup(rng: Rng): ConfigurePhasesInput {
  const shape = pick(rng, ['both', 'group', 'knockout'] as const)
  const group = groupPhase({ bestOf: pick(rng, [1, 3, 5]), groupCount: int(rng, 1, 4) })
  const knockout = knockoutPhase({
    bestOf: pick(rng, [1, 3, 5]),
    qualifiersPerGroup: int(rng, 1, 4),
  })
  // The one combination the schema refuses: a single group sending a single player on.
  if (shape === 'both' && group.groupCount * knockout.qualifiersPerGroup < 2) {
    knockout.qualifiersPerGroup = 2
  }
  return {
    group: shape === 'knockout' ? null : group,
    knockout: shape === 'group' ? null : knockout,
  }
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|')
const firstRound = (matches: Match[]) => matches.filter((m) => m.round === 0)
const playersOf = (matches: Match[]) =>
  matches.flatMap((m) => [m.participantAId, m.participantBId]).filter((id): id is string => !!id)

/** Groups are balanced, cover the roster once, and each plays a full round robin. */
function checkGroupDraw(stageId: string, roster: Participant[], groupCount: number): void {
  const groups = repo.listGroups(stageId).map((g) => repo.listGroupMembers(g.id))
  expect(groups).toHaveLength(Math.max(1, Math.min(groupCount, Math.floor(roster.length / 2))))
  expect(groups.flat().sort()).toEqual(roster.map((p) => p.id).sort())
  const sizes = groups.map((members) => members.length)
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2)
  expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)

  const matches = repo.listStageMatches(stageId)
  for (const [index, group] of repo.listGroups(stageId).entries()) {
    const members = groups[index]!
    const pairs = matches
      .filter((m) => m.groupId === group.id)
      .map((m) => pairKey(m.participantAId!, m.participantBId!))
    expect(pairs).toHaveLength((members.length * (members.length - 1)) / 2)
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(pairs.every((key) => key.split('|').every((id) => members.includes(id)))).toBe(true)
  }
}

/** The bracket holds exactly the top `perGroup` of each finished group's table. */
function checkQualifiers(groupStageId: string, bracket: Match[], perGroup: number): void {
  const matches = repo.listStageMatches(groupStageId)
  const expected = repo.listGroups(groupStageId).flatMap((group) =>
    computeStandings(
      repo.listGroupMembers(group.id),
      matches.filter((m) => m.groupId === group.id),
    )
      .slice(0, perGroup)
      .map((s) => s.participantId),
  )
  expect(playersOf(firstRound(bracket)).sort()).toEqual(expected.sort())
}

/** Play one match leg by leg with random winners until it is decided. */
function playMatch(rng: Rng, match: Match): void {
  let current = match
  for (let leg = 0; current.status !== 'completed'; leg++) {
    const winner = rng() < 0.5 ? current.participantAId! : current.participantBId!
    current = reportLeg(current.id, leg, winner).match
  }
  const need = legsToWin(current.bestOf)
  expect(Math.max(current.legsA, current.legsB)).toBe(need)
  expect(Math.min(current.legsA, current.legsB)).toBeLessThan(need)
}

function playRandomTournament(seed: number): void {
  const rng = random(seed)
  const tournament = createTournament(`Random ${seed}`)
  const roster = Array.from({ length: int(rng, 2, 9) }, (_, i) =>
    addParticipant(tournament.id, `P${i}`, rng() < 0.5 ? i + 1 : null),
  )
  const setup = randomSetup(rng)
  const drawnGroups = Math.max(
    1,
    Math.min(setup.group?.groupCount ?? 0, Math.floor(roster.length / 2)),
  )
  if (setup.group && setup.knockout && drawnGroups * setup.knockout.qualifiersPerGroup < 2) {
    // A cut to a single player is refused up front rather than leaving a bracket undrawable.
    expect(() => startTournament(tournament.id, setup)).toThrow(/at least two qualifiers/)
    return
  }
  startTournament(tournament.id, setup)
  const group = repo.getGroupStage(tournament.id)
  const knockout = repo.getKnockoutStage(tournament.id)

  if (group) checkGroupDraw(group.id, roster, group.groupCount)
  else
    expect(playersOf(firstRound(repo.listMatches(tournament.id))).sort()).toEqual(
      roster.map((p) => p.id).sort(),
    )

  let bracketChecked = !group || !knockout
  for (let guard = 0; guard < 500; guard++) {
    const ready = repo.listMatches(tournament.id).filter((m) => m.status === 'ready')
    if (!ready.length) break
    playMatch(rng, pick(rng, ready))
    // What the REST route and the socket handler do after every completed match.
    advancePhases(tournament.id)

    const all = repo.listMatches(tournament.id)
    const bracket = knockout ? all.filter((m) => m.stageId === knockout.id) : []
    const groupOpen = group
      ? all.some((m) => m.stageId === group.id && m.status !== 'completed')
      : false
    // Phases never overlap.
    if (groupOpen) expect(bracket).toEqual([])
    if (!bracketChecked && bracket.length) {
      checkQualifiers(group!.id, bracket, knockout!.qualifiersPerGroup!)
      bracketChecked = true
    }
    // Completed only once every phase is drawn and every match in it is played.
    const done =
      !groupOpen && (!knockout || bracket.length > 0) && all.every((m) => m.status === 'completed')
    expect(repo.getTournament(tournament.id)!.status).toBe(done ? 'completed' : 'active')
  }

  const all = repo.listMatches(tournament.id)
  expect(all.every((m) => m.status === 'completed')).toBe(true)
  expect(bracketChecked).toBe(true)
  expect(repo.getTournament(tournament.id)!.status).toBe('completed')
  for (const m of all) {
    expect([m.participantAId, m.participantBId]).toContain(m.winnerId)
    if (!m.nextMatchId) continue
    // Every winner moved on into the slot its bracket link names.
    const next = repo.getMatch(m.nextMatchId)!
    expect(m.nextSlot === 'a' ? next.participantAId : next.participantBId).toBe(m.winnerId)
  }
  if (knockout) {
    expect(all.filter((m) => m.stageId === knockout.id && !m.nextMatchId)).toHaveLength(1)
  }
}

// One test per seed: each stays well inside the per-test timeout on a slow CI runner, and a
// failure names its seed, so `yarn test -t "seed 15"` replays exactly that tournament.
const SEEDS = Array.from({ length: RUNS }, (_, i) => i + 1)

describe('random tournaments hold every phase rule', () => {
  beforeEach(resetDb)

  it.each(SEEDS)('seed %i', (seed) => playRandomTournament(seed))
})
