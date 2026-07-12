// Tournament orchestration: CRUD for tournaments/participants/stages and the
// schedule/bracket generation that turns a stage into concrete matches.
import { nanoid } from 'nanoid'
import { eq, inArray } from 'drizzle-orm'
import type {
  CreateStageInput,
  Floor,
  Match,
  Participant,
  Stage,
  Tournament,
} from '@pi-darts/shared'
import { db } from '../db/client'
import {
  floorSessions,
  floors,
  groupMembers,
  groups,
  legs,
  matches,
  participants,
  stages,
  throws,
  tournaments,
} from '../db/schema'
import { repo } from '../repo'
import { computeStandings, generateRoundRobin, generateSingleElimination } from '../engine'
import { resolveByes } from './matches'

export function createTournament(name: string): Tournament {
  const row: Tournament = {
    id: nanoid(),
    name,
    status: 'setup',
    autoAssign: false,
    createdAt: new Date().toISOString(),
  }
  db.insert(tournaments).values(row).run()
  return row
}

/** Halt a tournament without losing its data; boards stop receiving new matches. */
export function cancelTournament(id: string): Tournament {
  const tournament = repo.getTournament(id)
  if (!tournament) throw new Error('tournament not found')
  db.update(tournaments).set({ status: 'cancelled' }).where(eq(tournaments.id, id)).run()
  return { ...tournament, status: 'cancelled' }
}

/**
 * Undo a cancellation. The pre-cancel status isn't stored, so derive it from the data:
 * no matches → still in setup; all matches done → completed; otherwise active.
 */
export function reactivateTournament(id: string): Tournament {
  const tournament = repo.getTournament(id)
  if (!tournament) throw new Error('tournament not found')
  if (tournament.status !== 'cancelled') throw new Error('tournament is not cancelled')
  const matchList = repo.listMatches(id)
  const status: Tournament['status'] = !matchList.length
    ? 'setup'
    : matchList.every((m) => m.status === 'completed')
      ? 'completed'
      : 'active'
  db.update(tournaments).set({ status }).where(eq(tournaments.id, id)).run()
  return { ...tournament, status }
}

/** Permanently delete a tournament and every row that hangs off it (no FK cascades). */
export function deleteTournament(id: string): void {
  if (!repo.getTournament(id)) throw new Error('tournament not found')

  const matchIds = repo.listMatches(id).map((m) => m.id)
  if (matchIds.length) {
    const legIds = db
      .select({ id: legs.id })
      .from(legs)
      .where(inArray(legs.matchId, matchIds))
      .all()
      .map((row) => row.id)
    if (legIds.length) db.delete(throws).where(inArray(throws.legId, legIds)).run()
    db.delete(legs).where(inArray(legs.matchId, matchIds)).run()
  }

  const stageIds = repo.listStages(id).map((s) => s.id)
  const groupIds = stageIds.flatMap((stageId) => repo.listGroups(stageId).map((g) => g.id))
  if (groupIds.length) db.delete(groupMembers).where(inArray(groupMembers.groupId, groupIds)).run()

  db.delete(matches).where(eq(matches.tournamentId, id)).run()
  if (stageIds.length) db.delete(groups).where(inArray(groups.stageId, stageIds)).run()
  db.delete(stages).where(eq(stages.tournamentId, id)).run()
  db.delete(floorSessions).where(eq(floorSessions.tournamentId, id)).run()
  db.delete(floors).where(eq(floors.tournamentId, id)).run()
  db.delete(participants).where(eq(participants.tournamentId, id)).run()
  db.delete(tournaments).where(eq(tournaments.id, id)).run()
}

export function createFloor(tournamentId: string, name: string): Floor {
  const row: Floor = { id: nanoid(), tournamentId, name }
  db.insert(floors).values(row).run()
  return row
}

export function deleteFloor(floorId: string): void {
  const floor = repo.getFloor(floorId)
  if (!floor) throw new Error('floor not found')
  if (repo.listMatches(floor.tournamentId).some((match) => match.floorId === floorId)) {
    throw new Error('cannot remove a floor assigned to a match')
  }
  db.delete(floorSessions).where(eq(floorSessions.floorId, floorId)).run()
  db.delete(floors).where(eq(floors.id, floorId)).run()
}

export function addParticipant(
  tournamentId: string,
  name: string,
  seed: number | null,
): Participant {
  const row: Participant = { id: nanoid(), tournamentId, name, seed }
  db.insert(participants).values(row).run()
  return row
}

export function updateParticipant(
  id: string,
  patch: Partial<Pick<Participant, 'name' | 'seed'>>,
): void {
  db.update(participants).set(patch).where(eq(participants.id, id)).run()
}

export function deleteParticipant(id: string): void {
  db.delete(participants).where(eq(participants.id, id)).run()
}

export function createStage(tournamentId: string, input: CreateStageInput): Stage {
  const order = repo.listStages(tournamentId).length
  const row: Stage = {
    id: nanoid(),
    tournamentId,
    name: input.name,
    type: input.type,
    format: input.format,
    order,
    bestOf: input.bestOf,
    startScore: input.startScore,
    outMode: input.outMode,
  }
  db.insert(stages).values(row).run()
  return row
}

/** Sort participants by seed (unseeded last), then name — the default seeding. */
function bySeed(a: Participant, b: Participant): number {
  const sa = a.seed ?? Number.POSITIVE_INFINITY
  const sb = b.seed ?? Number.POSITIVE_INFINITY
  return sa - sb || a.name.localeCompare(b.name)
}

/** Snake-draft participants into `groupCount` balanced groups. */
function distributeToGroups(ordered: Participant[], groupCount: number): string[][] {
  const buckets: string[][] = Array.from({ length: groupCount }, () => [])
  ordered.forEach((p, i) => {
    const row = Math.floor(i / groupCount)
    const col = i % groupCount
    const g = row % 2 === 0 ? col : groupCount - 1 - col
    buckets[g]!.push(p.id)
  })
  return buckets
}

/**
 * Order qualifiers from a completed group stage for knockout seeding: all group
 * winners first (ranked against each other), then all runners-up, etc., limited to
 * `perGroup` qualifiers from each group.
 */
function qualifiersFromGroupStage(groupStage: Stage, perGroup: number): string[] {
  const stageMatches = repo.listStageMatches(groupStage.id)
  const rankedPerGroup = repo.listGroups(groupStage.id).map((group) => {
    const members = repo.listGroupMembers(group.id)
    const groupMatches = stageMatches.filter((m) => m.groupId === group.id)
    return computeStandings(members, groupMatches)
  })

  const seeds: string[] = []
  for (let rank = 0; rank < perGroup; rank++) {
    const atRank = rankedPerGroup
      .map((standings) => standings[rank])
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((x, y) => y.points - x.points || y.legDiff - x.legDiff)
    for (const s of atRank) seeds.push(s.participantId)
  }
  return seeds
}

/** Remove any previously generated matches/groups for a stage (idempotent regen). */
function clearStage(stageId: string): void {
  const existingGroups = repo.listGroups(stageId)
  if (existingGroups.length) {
    db.delete(groupMembers)
      .where(
        inArray(
          groupMembers.groupId,
          existingGroups.map((g) => g.id),
        ),
      )
      .run()
    db.delete(groups).where(eq(groups.stageId, stageId)).run()
  }
  db.delete(matches).where(eq(matches.stageId, stageId)).run()
}

/**
 * Generate all matches for a stage. Round-robin (group) stages split participants
 * into groups and schedule everyone-plays-everyone. Knockout stages seed from the
 * previous group stage's standings (if any) or by participant seed, then build a
 * single-elimination bracket and resolve byes.
 */
export function generateStage(
  stageId: string,
  opts: { groupCount?: number; qualifiersPerGroup?: number } = {},
): Match[] {
  const stage = repo.getStage(stageId)
  if (!stage) throw new Error('stage not found')

  clearStage(stageId)
  db.update(tournaments)
    .set({ status: 'active' })
    .where(eq(tournaments.id, stage.tournamentId))
    .run()

  const roster = repo.listParticipants(stage.tournamentId).sort(bySeed)

  if (stage.type === 'group') {
    const groupCount = Math.max(1, Math.min(opts.groupCount ?? 1, roster.length))
    const buckets = distributeToGroups(roster, groupCount)
    buckets.forEach((memberIds, gi) => {
      const groupId = nanoid()
      db.insert(groups)
        .values({ id: groupId, stageId, name: `Group ${String.fromCharCode(65 + gi)}` })
        .run()
      for (const participantId of memberIds) {
        db.insert(groupMembers).values({ groupId, participantId }).run()
      }
      for (const seed of generateRoundRobin(memberIds)) {
        insertMatch(stage, {
          groupId,
          round: seed.round,
          slot: seed.slot,
          participantAId: seed.aId,
          participantBId: seed.bId,
          status: 'ready',
        })
      }
    })
    return repo.listStageMatches(stageId)
  }

  // Knockout: seed from a prior group stage if present, else by participant seed.
  const priorGroupStage = repo
    .listStages(stage.tournamentId)
    .filter((s) => s.type === 'group' && s.order < stage.order)
    .at(-1)

  const seedIds = priorGroupStage
    ? qualifiersFromGroupStage(priorGroupStage, opts.qualifiersPerGroup ?? 2)
    : roster.map((p) => p.id)

  const bracket = generateSingleElimination(seedIds)
  const idByLocal = new Map(bracket.map((m) => [m.localId, nanoid()] as const))

  for (const m of bracket) {
    insertMatch(
      stage,
      {
        round: m.round,
        slot: m.slot,
        participantAId: m.aId,
        participantBId: m.bId,
        status: m.aId && m.bId ? 'ready' : 'pending',
        nextMatchId: m.nextLocalId ? idByLocal.get(m.nextLocalId)! : null,
        nextSlot: m.nextSlot,
      },
      idByLocal.get(m.localId)!,
    )
  }

  resolveByes(stageId)
  return repo.listStageMatches(stageId)
}

/** Insert a match, filling in stage-level defaults. */
function insertMatch(
  stage: Stage,
  fields: Pick<Match, 'round' | 'slot' | 'participantAId' | 'participantBId' | 'status'> &
    Partial<Pick<Match, 'groupId' | 'nextMatchId' | 'nextSlot'>>,
  id: string = nanoid(),
): void {
  db.insert(matches)
    .values({
      id,
      tournamentId: stage.tournamentId,
      stageId: stage.id,
      groupId: fields.groupId ?? null,
      round: fields.round,
      slot: fields.slot,
      participantAId: fields.participantAId ?? null,
      participantBId: fields.participantBId ?? null,
      bestOf: stage.bestOf,
      startScore: stage.startScore,
      outMode: stage.outMode,
      floorId: null,
      status: fields.status,
      legsA: 0,
      legsB: 0,
      winnerId: null,
      nextMatchId: fields.nextMatchId ?? null,
      nextSlot: fields.nextSlot ?? null,
    })
    .run()
}
