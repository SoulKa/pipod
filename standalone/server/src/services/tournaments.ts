// Tournament orchestration: CRUD for tournaments/participants/phases and the
// schedule/bracket generation that turns a phase into concrete matches.
import { nanoid } from 'nanoid'
import { eq, inArray, or } from 'drizzle-orm'
import type {
  ConfigurePhasesInput,
  Floor,
  GroupStage,
  Match,
  Participant,
  Stage,
  Tournament,
} from '@pipod/shared'
import { isOpenTournament, PHASE_SETUP_ERRORS } from '@pipod/shared'
import { db } from '../db/client'
import {
  floorSessions,
  floors,
  groupMembers,
  groups,
  legs,
  matches,
  participantPhotos,
  participants,
  stages,
  throws,
  tournaments,
} from '../db/schema'
import { repo } from '../repo'
import { computeStandings, generateRoundRobin, generateSingleElimination } from '../engine'
import { log } from '../logger'
import { resolveByes } from './matches'
import { deriveTournamentStatus, syncTournamentStatus } from './tournamentStatus'

export function createTournament(name: string): Tournament {
  const row: Tournament = {
    id: nanoid(),
    name,
    status: 'setup',
    autoAssign: false,
    createdAt: new Date().toISOString(),
  }
  db.insert(tournaments).values(row).run()
  log.info({ tournament: row.id, name }, 'tournament created')
  return row
}

/** Halt a tournament without losing its data; boards stop receiving new matches. */
export function cancelTournament(id: string): Tournament {
  const tournament = repo.getTournament(id)
  if (!tournament) throw new Error('tournament not found')
  if (!isOpenTournament(tournament.status)) throw new Error('tournament is already over')
  db.update(tournaments).set({ status: 'cancelled' }).where(eq(tournaments.id, id)).run()
  log.warn({ tournament: id, name: tournament.name }, 'tournament cancelled')
  return { ...tournament, status: 'cancelled' }
}

/** Undo a cancellation. The pre-cancel status isn't stored, so derive it from the data. */
export function reactivateTournament(id: string): Tournament {
  const tournament = repo.getTournament(id)
  if (!tournament) throw new Error('tournament not found')
  if (tournament.status !== 'cancelled') throw new Error('tournament is not cancelled')
  const status = deriveTournamentStatus(id)
  db.update(tournaments).set({ status }).where(eq(tournaments.id, id)).run()
  log.info({ tournament: id, name: tournament.name, status }, 'tournament reactivated')
  return { ...tournament, status }
}

/** Permanently delete a tournament and every row that hangs off it (no FK cascades). */
export function deleteTournament(id: string): void {
  const tournament = repo.getTournament(id)
  if (!tournament) throw new Error('tournament not found')

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
  const tournamentParticipants = db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.tournamentId, id))
  db.delete(participantPhotos)
    .where(inArray(participantPhotos.participantId, tournamentParticipants))
    .run()
  db.delete(participants).where(eq(participants.tournamentId, id)).run()
  db.delete(tournaments).where(eq(tournaments.id, id)).run()
  // Unrecoverable, so it is worth a warn: this is the line that explains a tournament
  // that "disappeared" from the console.
  log.warn(
    { tournament: id, name: tournament.name, matches: matchIds.length },
    'tournament deleted with all of its data',
  )
}

export function createFloor(tournamentId: string, name: string): Floor {
  const row: Floor = { id: nanoid(), tournamentId, name }
  db.insert(floors).values(row).run()
  log.info({ tournament: tournamentId, floor: name }, 'floor added')
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
  log.info({ tournament: floor.tournamentId, floor: floor.name }, 'floor removed')
}

export function addParticipant(
  tournamentId: string,
  name: string,
  seed: number | null,
): Participant {
  const row: Participant = { id: nanoid(), tournamentId, name, seed, avatar: null }
  db.insert(participants).values(row).run()
  log.debug({ tournament: tournamentId, participant: name, seed }, 'participant added')
  return row
}

/** Undefined for an unknown participant. */
export function updateParticipant(
  id: string,
  patch: Partial<Pick<Participant, 'name' | 'seed'>>,
): Participant | undefined {
  db.update(participants).set(patch).where(eq(participants.id, id)).run()
  log.debug({ participant: id, ...patch }, 'participant updated')
  return repo.getParticipant(id)
}

/**
 * Only before the schedule references them: a match is handed to a board with both of its
 * players, so a player may never vanish from a drawn match.
 */
export function deleteParticipant(id: string): void {
  const inMatch = db
    .select({ id: matches.id })
    .from(matches)
    .where(or(eq(matches.participantAId, id), eq(matches.participantBId, id)))
    .get()
  if (inMatch) throw new Error('cannot remove a participant who is in a match')
  db.transaction((tx) => {
    tx.delete(participantPhotos).where(eq(participantPhotos.participantId, id)).run()
    tx.delete(participants).where(eq(participants.id, id)).run()
  })
  log.debug({ participant: id }, 'participant removed')
}

/**
 * Replace a tournament's phase setup. Only possible before the schedule exists — the
 * stage rows are what generated matches hang off.
 */
export function configurePhases(tournamentId: string, input: ConfigurePhasesInput): Stage[] {
  if (!repo.getTournament(tournamentId)) throw new Error('tournament not found')
  if (repo.listMatches(tournamentId).length) {
    throw new Error('phases cannot change once the tournament has started')
  }
  db.delete(stages).where(eq(stages.tournamentId, tournamentId)).run()

  const rows: Stage[] = []
  if (input.group) rows.push({ id: nanoid(), tournamentId, type: 'group', ...input.group })
  if (input.knockout) {
    rows.push({
      id: nanoid(),
      tournamentId,
      type: 'knockout',
      ...input.knockout,
      // Without a group phase everyone plays the bracket, so there is nothing to cut.
      qualifiersPerGroup: input.group ? input.knockout.qualifiersPerGroup : null,
    })
  }
  for (const row of rows) db.insert(stages).values(row).run()
  log.info(
    { tournament: tournamentId, phases: rows.map((r) => `${r.type} bo${r.bestOf}`).join(', ') },
    'phases configured',
  )
  return rows
}

/**
 * Save the phase setup and draw the first phase in one step — the tournament goes live
 * from here. All or nothing: a start that is refused leaves the previous setup in place.
 */
export function startTournament(tournamentId: string, input: ConfigurePhasesInput): Match[] {
  return db.transaction(() => {
    // Refuses an unknown or already started tournament on its own.
    const [first] = configurePhases(tournamentId, input)
    if (repo.getTournament(tournamentId)!.status === 'cancelled') {
      throw new Error('tournament is cancelled')
    }
    const players = repo.listParticipants(tournamentId).length
    if (players < 2) throw new Error('a tournament needs at least two participants')
    // The schema checks the requested group count; with few players fewer groups are drawn.
    const { group, knockout } = input
    if (
      group &&
      knockout &&
      drawnGroupCount(group.groupCount, players) * knockout.qualifiersPerGroup < 2
    ) {
      throw new Error(PHASE_SETUP_ERRORS.tooFewQualifiers)
    }
    return generateStage(first!)
  })
}

/**
 * How many groups a draw really makes: every group needs two players, or it has no
 * matches to play. Groups never come out smaller than two, so a group phase sends at
 * least two players on exactly when this times the qualifiers per group is two or more.
 */
function drawnGroupCount(requested: number, players: number): number {
  return Math.max(1, Math.min(requested, Math.floor(players / 2)))
}

/** Whether the group phase has been drawn and every one of its matches is played. */
function isGroupPhaseFinished(group: Stage): boolean {
  const groupMatches = repo.listStageMatches(group.id)
  return groupMatches.length > 0 && groupMatches.every((m) => m.status === 'completed')
}

/**
 * Open the knockout phase once the group phase is over. Called after every completed
 * match; does nothing until the last group match is in, and nothing once the bracket
 * exists. Returns the generated bracket (empty when nothing happened).
 *
 * This is the only way a bracket follows a group phase, which is what keeps phases
 * from overlapping: no knockout match exists while a group match is still open.
 */
export function advancePhases(tournamentId: string): Match[] {
  const group = repo.getGroupStage(tournamentId)
  const knockout = repo.getKnockoutStage(tournamentId)
  if (!group || !knockout) return []
  if (repo.listStageMatches(knockout.id).length || !isGroupPhaseFinished(group)) return []
  log.info({ tournament: tournamentId }, 'group phase finished, drawing the knockout bracket')
  return generateStage(knockout)
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
function qualifiersFromGroupStage(groupStage: GroupStage, perGroup: number): string[] {
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

/**
 * Generate all matches for a stage. Round-robin (group) stages split participants
 * into groups and schedule everyone-plays-everyone. Knockout stages seed from the
 * finished group phase's standings (if there is one) or by participant seed, then
 * build a single-elimination bracket and resolve byes.
 */
function generateStage(stage: Stage): Match[] {
  const stageId = stage.id
  db.update(tournaments)
    .set({ status: 'active' })
    .where(eq(tournaments.id, stage.tournamentId))
    .run()

  const roster = repo.listParticipants(stage.tournamentId).sort(bySeed)

  if (stage.type === 'group') {
    const groupCount = drawnGroupCount(stage.groupCount, roster.length)
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
  } else {
    // A cut exists exactly when a group phase came first; otherwise seed the whole roster.
    const seedIds =
      stage.qualifiersPerGroup === null
        ? roster.map((p) => p.id)
        : qualifiersFromGroupStage(
            repo.getGroupStage(stage.tournamentId)!,
            stage.qualifiersPerGroup,
          )

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
  }

  // The blanket 'active' above is a starting guess; correct it now that the matches
  // exist — a bracket settled entirely by byes is already done, and one that had
  // nothing to schedule never left setup.
  syncTournamentStatus(stage.tournamentId)
  const generated = repo.listStageMatches(stageId)
  log.info(
    {
      tournament: stage.tournamentId,
      phase: stage.type,
      players: roster.length,
      matches: generated.length,
    },
    'stage schedule generated',
  )
  return generated
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
