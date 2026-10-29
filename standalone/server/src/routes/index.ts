// REST API. Bodies are validated with the shared zod schemas so the server and the
// console agree on shapes. Mutations rebroadcast the affected tournament snapshot.
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  addParticipantSchema,
  assignMatchFloorSchema,
  AVATAR_PHOTO_MAX_BYTES,
  autoAssignToggleSchema,
  configurePhasesSchema,
  createFloorSchema,
  createTournamentSchema,
  reorderQueueSchema,
  reportLegSchema,
  setAvatarEmojiSchema,
  updateParticipantSchema,
  type Participant,
  type ServerInfo,
  type TournamentDetail,
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
import { isJpeg, setAvatar } from '../services/avatars'
import {
  broadcastMatch,
  broadcastParticipant,
  broadcastSnapshot,
  broadcastTournamentList,
} from '../realtime/hub'
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
    } satisfies TournamentDetail
  })

  app.post('/api/tournaments/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!repo.getTournament(id)) return reply.code(404).send({ error: 'not found' })
    try {
      const tournament = cancelTournament(id)
      broadcastSnapshot(id)
      return tournament
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
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

  /** Every participant change reaches the room, so a board's intro shows it right away. */
  function participantChanged(reply: FastifyReply, participant: Participant | undefined) {
    if (!participant) return reply.code(404).send({ error: 'participant not found' })
    broadcastParticipant(participant)
    broadcastSnapshot(participant.tournamentId)
    return participant
  }

  app.patch('/api/participants/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const patch = updateParticipantSchema.parse(req.body)
    return participantChanged(
      reply,
      updateParticipant(id, { name: patch.name, seed: patch.seed ?? null }),
    )
  })

  app.delete('/api/participants/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      deleteParticipant(id)
      return { ok: true }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // Viewers upload the photo already cropped and scaled, as the raw JPEG body.
  app.addContentTypeParser(
    'image/jpeg',
    { parseAs: 'buffer', bodyLimit: AVATAR_PHOTO_MAX_BYTES },
    (_req, body, done) => done(null, body),
  )

  app.get('/api/participants/:id/avatar', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { v } = req.query as { v?: string }
    // Served as immutable, so only under the current photo's version: an outdated URL
    // must 404 rather than cache today's bytes under yesterday's name.
    const avatar = repo.getParticipant(id)?.avatar
    if (avatar?.kind !== 'photo' || avatar.version !== v) {
      return reply.code(404).send({ error: 'no photo' })
    }
    const photo = repo.getParticipantPhoto(id)
    if (!photo) return reply.code(404).send({ error: 'no photo' })
    return reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .type('image/jpeg')
      .send(photo)
  })

  app.put('/api/participants/:id/avatar/photo', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!Buffer.isBuffer(req.body) || !isJpeg(req.body)) {
      return reply.code(400).send({ error: 'expected a JPEG image' })
    }
    return participantChanged(reply, setAvatar(id, { photo: req.body }))
  })

  app.put('/api/participants/:id/avatar/emoji', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = setAvatarEmojiSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'expected a single emoji' })
    return participantChanged(reply, setAvatar(id, { emoji: parsed.data.emoji }))
  })

  app.delete('/api/participants/:id/avatar', async (req, reply) => {
    const { id } = req.params as { id: string }
    return participantChanged(reply, setAvatar(id, null))
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
