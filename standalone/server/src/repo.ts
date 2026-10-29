// Thin typed query helpers over Drizzle. Keeps SQL-ish detail out of the services.
import { and, asc, eq, inArray } from 'drizzle-orm'
import {
  STAGE_TYPES,
  type Floor,
  type GroupStage,
  type KnockoutStage,
  type Match,
  type Participant,
  type Stage,
  type Tournament,
} from '@pipod/shared'
import { db } from './db/client'
import {
  floors,
  groupMembers,
  groups,
  legs,
  matches,
  participantPhotos,
  participants,
  stages,
  tournaments,
} from './db/schema'

/**
 * Narrow a flat stage row to its phase. The setting columns are nullable because each
 * belongs to one phase only; a group row always has its count (configurePhases writes it,
 * the 0005 migration backfilled older rows), so the fallback never decides anything.
 */
function toStage(row: typeof stages.$inferSelect): Stage {
  const { groupCount, qualifiersPerGroup, ...base } = row
  return base.type === 'group'
    ? { ...base, type: 'group', groupCount: groupCount ?? 1 }
    : { ...base, type: 'knockout', qualifiersPerGroup }
}

export const repo = {
  getTournament(id: string): Tournament | undefined {
    return db.select().from(tournaments).where(eq(tournaments.id, id)).get()
  },

  listTournaments(): Tournament[] {
    return db.select().from(tournaments).orderBy(asc(tournaments.createdAt)).all()
  },

  listParticipants(tournamentId: string): Participant[] {
    return db.select().from(participants).where(eq(participants.tournamentId, tournamentId)).all()
  },

  getParticipant(id: string): Participant | undefined {
    return db.select().from(participants).where(eq(participants.id, id)).get()
  },

  getParticipantPhoto(participantId: string): Buffer | undefined {
    return db
      .select({ data: participantPhotos.data })
      .from(participantPhotos)
      .where(eq(participantPhotos.participantId, participantId))
      .get()?.data
  },

  getFloor(id: string): Floor | undefined {
    return db.select().from(floors).where(eq(floors.id, id)).get()
  },

  listFloors(tournamentId: string): Floor[] {
    return db
      .select()
      .from(floors)
      .where(eq(floors.tournamentId, tournamentId))
      .orderBy(asc(floors.name))
      .all()
  },

  /** A tournament's phases in play order. */
  listStages(tournamentId: string): Stage[] {
    return db
      .select()
      .from(stages)
      .where(eq(stages.tournamentId, tournamentId))
      .all()
      .map(toStage)
      .sort((a, b) => STAGE_TYPES.indexOf(a.type) - STAGE_TYPES.indexOf(b.type))
  },

  getGroupStage(tournamentId: string): GroupStage | undefined {
    return this.listStages(tournamentId).find((s): s is GroupStage => s.type === 'group')
  },

  getKnockoutStage(tournamentId: string): KnockoutStage | undefined {
    return this.listStages(tournamentId).find((s): s is KnockoutStage => s.type === 'knockout')
  },

  getStage(id: string): Stage | undefined {
    const row = db.select().from(stages).where(eq(stages.id, id)).get()
    return row && toStage(row)
  },

  listMatches(tournamentId: string): Match[] {
    return db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId))
      .orderBy(asc(matches.round), asc(matches.slot))
      .all()
  },

  /** A floor's still-relevant matches (ready + live) in play order. */
  listFloorQueue(floorId: string): Match[] {
    return db
      .select()
      .from(matches)
      .where(and(eq(matches.floorId, floorId), inArray(matches.status, ['ready', 'live'])))
      .orderBy(asc(matches.queueOrder), asc(matches.round), asc(matches.slot))
      .all()
  },

  listStageMatches(stageId: string): Match[] {
    return db
      .select()
      .from(matches)
      .where(eq(matches.stageId, stageId))
      .orderBy(asc(matches.round), asc(matches.slot))
      .all()
  },

  getMatch(id: string): Match | undefined {
    return db.select().from(matches).where(eq(matches.id, id)).get()
  },

  listLegs(matchId: string) {
    return db.select().from(legs).where(eq(legs.matchId, matchId)).orderBy(asc(legs.index)).all()
  },

  getLeg(matchId: string, index: number) {
    return db
      .select()
      .from(legs)
      .where(and(eq(legs.matchId, matchId), eq(legs.index, index)))
      .get()
  },

  listGroups(stageId: string) {
    return db.select().from(groups).where(eq(groups.stageId, stageId)).all()
  },

  listGroupMembers(groupId: string): string[] {
    return db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
      .all()
      .map((row) => row.participantId)
  },
}
