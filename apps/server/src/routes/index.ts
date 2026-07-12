// REST API. Bodies are validated with the shared zod schemas so the server and the
// console agree on shapes. Mutations rebroadcast the affected tournament snapshot.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  addParticipantSchema,
  assignMatchFloorSchema,
  createFloorSchema,
  createStageSchema,
  createTournamentSchema,
  reportLegSchema,
  updateParticipantSchema,
} from '@pi-darts/shared'
import { repo } from '../repo'
import {
  addParticipant,
  cancelTournament,
  createStage,
  createTournament,
  createFloor,
  deleteFloor,
  deleteParticipant,
  deleteTournament,
  generateStage,
  reactivateTournament,
  updateParticipant,
} from '../services/tournaments'
import { assignMatchFloor, claimMatch, reportLeg } from '../services/matches'
import { broadcastMatch, broadcastSnapshot } from '../realtime/hub'
import { dispatchFloorMatch } from '../realtime'

/** Options accepted by the stage-generate endpoint. */
const generateOptsSchema = z.object({
  groupCount: z.number().int().min(1).max(16).optional(),
  qualifiersPerGroup: z.number().int().min(1).max(8).optional(),
})

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/tournaments', async () => repo.listTournaments())

  app.post('/api/tournaments', async (req, reply) => {
    const { name } = createTournamentSchema.parse(req.body)
    return reply.code(201).send(createTournament(name))
  })

  app.get('/api/tournaments/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const tournament = repo.getTournament(id)
    if (!tournament) return reply.code(404).send({ error: 'not found' })
    const stages = repo.listStages(id)
    return {
      tournament,
      floors: repo.listFloors(id),
      participants: repo.listParticipants(id),
      stages,
      matches: repo.listMatches(id),
      groups: stages.flatMap((s) =>
        repo.listGroups(s.id).map((g) => ({
          id: g.id,
          stageId: g.stageId,
          name: g.name,
          memberIds: repo.listGroupMembers(g.id),
        })),
      ),
    }
  })

  app.post('/api/tournaments/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const tournament = cancelTournament(id)
      broadcastSnapshot(id)
      return tournament
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message })
    }
  })

  app.post('/api/tournaments/:id/reactivate', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const tournament = reactivateTournament(id)
      broadcastSnapshot(id)
      return tournament
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/tournaments/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      deleteTournament(id)
      broadcastSnapshot(id)
      return { ok: true }
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message })
    }
  })

  app.post('/api/tournaments/:id/participants', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!repo.getTournament(id)) return reply.code(404).send({ error: 'not found' })
    const { name, seed } = addParticipantSchema.parse(req.body)
    const participant = addParticipant(id, name, seed ?? null)
    broadcastSnapshot(id)
    return reply.code(201).send(participant)
  })

  app.post('/api/tournaments/:id/floors', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!repo.getTournament(id)) return reply.code(404).send({ error: 'not found' })
    const { name } = createFloorSchema.parse(req.body)
    const floor = createFloor(id, name)
    broadcastSnapshot(id)
    return reply.code(201).send(floor)
  })

  app.delete('/api/floors/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const tournamentId = repo.getFloor(id)?.tournamentId
      deleteFloor(id)
      if (tournamentId) broadcastSnapshot(tournamentId)
      return { ok: true }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.patch('/api/participants/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = updateParticipantSchema.parse(req.body)
    updateParticipant(id, { name: patch.name, seed: patch.seed ?? null })
    return { ok: true }
  })

  app.delete('/api/participants/:id', async (req) => {
    const { id } = req.params as { id: string }
    deleteParticipant(id)
    return { ok: true }
  })

  app.post('/api/tournaments/:id/stages', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!repo.getTournament(id)) return reply.code(404).send({ error: 'not found' })
    const input = createStageSchema.parse(req.body)
    return reply.code(201).send(createStage(id, input))
  })

  app.get('/api/stages/:id/groups', async (req) => {
    const { id } = req.params as { id: string }
    return repo.listGroups(id).map((g) => ({
      id: g.id,
      name: g.name,
      memberIds: repo.listGroupMembers(g.id),
    }))
  })

  app.post('/api/stages/:id/generate', async (req, reply) => {
    const { id } = req.params as { id: string }
    const stage = repo.getStage(id)
    if (!stage) return reply.code(404).send({ error: 'not found' })
    const opts = generateOptsSchema.parse(req.body ?? {})
    const matches = generateStage(id, opts)
    broadcastSnapshot(stage.tournamentId)
    return matches
  })

  app.post('/api/matches/:id/claim', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const match = claimMatch(id)
      broadcastMatch(match)
      broadcastSnapshot(match.tournamentId)
      return match
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/matches/:id/floor', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { floorId } = assignMatchFloorSchema.parse(req.body)
    try {
      const assigned = assignMatchFloor(id, floorId)
      const match = dispatchFloorMatch(assigned) ?? assigned
      if (match === assigned) {
        broadcastMatch(match)
        broadcastSnapshot(match.tournamentId)
      }
      return match
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/matches/:id/legs', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { legIndex, winnerId } = reportLegSchema.parse(req.body)
    try {
      const { match, changed } = reportLeg(id, legIndex, winnerId)
      for (const m of changed) broadcastMatch(m)
      broadcastSnapshot(match.tournamentId)
      return match
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })
}
