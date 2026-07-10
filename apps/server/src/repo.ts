// Thin typed query helpers over Drizzle. Keeps SQL-ish detail out of the services.
import { asc, eq } from 'drizzle-orm'
import type { Floor, Match, Participant, Stage, Tournament } from '@pi-darts/shared'
import { db } from './db/client'
import {
  floors,
  groupMembers,
  groups,
  matches,
  participants,
  stages,
  tournaments,
} from './db/schema'

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

  listStages(tournamentId: string): Stage[] {
    return db
      .select()
      .from(stages)
      .where(eq(stages.tournamentId, tournamentId))
      .orderBy(asc(stages.order))
      .all()
  },

  getStage(id: string): Stage | undefined {
    return db.select().from(stages).where(eq(stages.id, id)).get()
  },

  listMatches(tournamentId: string): Match[] {
    return db
      .select()
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId))
      .orderBy(asc(matches.round), asc(matches.slot))
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
