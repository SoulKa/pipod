// REST API. Bodies are validated with the shared zod schemas so the server and the
// console agree on shapes. Mutations rebroadcast the affected tournament snapshot.
import type { FastifyInstance } from 'fastify'
import {
  addParticipantSchema,
  assignMatchFloorSchema,
  autoAssignToggleSchema,
  configurePhasesSchema,
  createFloorSchema,
  createTournamentSchema,
  reorderQueueSchema,
  reportLegSchema,
  updateParticipantSchema,
  type ServerInfo,
} from '@pipod/shared'
import { env } from '../env'
import { publicOrigin } from '../network'
import { repo } from '../repo'
import {
  addParticipant,
  advancePhases,
  cancelTournament,
  configurePhases,
  createTournament,
  createFloor,
  deleteFloor,
  deleteParticipant,
  deleteTournament,
  reactivateTournament,
  startTournament,
  updateParticipant,
} from '../services/tournaments'
import { assignMatchFloor, claimMatch, reorderFloorQueue, reportLeg } from '../services/matches'
import { maybeAutoAssign, runAutoAssign, setAutoAssign } from '../services/scheduler'
import { broadcastMatch, broadcastSnapshot, broadcastTournamentList } from '../realtime/hub'
import { dispatchQueuedFloorMatch, dispatchReadyFloors } from '../realtime'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/info', async (): Promise<ServerInfo> => {
    // The bound port rather than env.port: tests (and PORT=0) let the OS pick it.
    const address = app.server.address()
    if (!address || typeof address === 'string') return { publicOrigin: env.publicUrl || null }
    return { publicOrigin: publicOrigin(address.port) }
  })

  app.get('/api/tournaments', async () => repo.listTournaments())

  app.post('/api/tournaments', async (req, reply) => {
    const { name } = createTournamentSchema.parse(req.body)
    const tournament = createTournament(name)
    broadcastTournamentList()
    return reply.code(201).send(tournament)
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
    maybeAutoAssign(id)
    dispatchReadyFloors(id)
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

  app.put('/api/tournaments/:id/phases', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!repo.getTournament(id)) return reply.code(404).send({ error: 'not found' })
    const input = configurePhasesSchema.parse(req.body)
    try {
      const stages = configurePhases(id, input)
      broadcastSnapshot(id)
      return stages
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.get('/api/stages/:id/groups', async (req) => {
    const { id } = req.params as { id: string }
    return repo.listGroups(id).map((g) => ({
      id: g.id,
      name: g.name,
      memberIds: repo.listGroupMembers(g.id),
    }))
  })

  app.post('/api/tournaments/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!repo.getTournament(id)) return reply.code(404).send({ error: 'not found' })
    const input = configurePhasesSchema.parse(req.body)
    try {
      const matches = startTournament(id, input)
      maybeAutoAssign(id)
      dispatchReadyFloors(id)
      broadcastSnapshot(id)
      return matches
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
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
    const { floorId, position } = assignMatchFloorSchema.parse(req.body)
    try {
      const assigned = assignMatchFloor(id, floorId, position)
      // An idle connected floor starts its front match; a busy floor just queues this one.
      if (floorId) dispatchQueuedFloorMatch(floorId)
      const match = repo.getMatch(id) ?? assigned
      broadcastMatch(match)
      broadcastSnapshot(match.tournamentId)
      return match
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/tournaments/:id/autoassign', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!repo.getTournament(id)) return reply.code(404).send({ error: 'not found' })
    runAutoAssign(id)
    dispatchReadyFloors(id)
    broadcastSnapshot(id)
    return { ok: true }
  })

  app.post('/api/tournaments/:id/auto-assign', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { enabled } = autoAssignToggleSchema.parse(req.body)
    try {
      const tournament = setAutoAssign(id, enabled)
      dispatchReadyFloors(id)
      broadcastSnapshot(id)
      return tournament
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message })
    }
  })

  app.post('/api/floors/:id/queue', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { matchIds } = reorderQueueSchema.parse(req.body)
    try {
      const tournamentId = repo.getFloor(id)?.tournamentId
      reorderFloorQueue(id, matchIds)
      if (tournamentId) broadcastSnapshot(tournamentId)
      return { ok: true }
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
      if (match.status === 'completed') {
        advancePhases(match.tournamentId)
        maybeAutoAssign(match.tournamentId)
        dispatchReadyFloors(match.tournamentId)
      }
      broadcastSnapshot(match.tournamentId)
      return match
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })
}
