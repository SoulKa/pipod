// Typed REST client for the tournament server. Same-origin in production; the Vite
// dev proxy forwards /api to the server.
import type {
  AddParticipantInput,
  ConfigurePhasesInput,
  Floor,
  Match,
  Participant,
  ServerInfo,
  Stage,
  Tournament,
  TournamentDetail,
} from '@pipod/shared'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  // Only advertise a JSON body when there is one — otherwise Fastify rejects the
  // empty payload (FST_ERR_CTP_EMPTY_JSON_BODY) on bodyless POSTs like claim/cancel.
  return json<T>(
    await fetch(url, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

async function put<T>(url: string, body: unknown): Promise<T> {
  return json<T>(
    await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export const api = {
  async getInfo(): Promise<ServerInfo> {
    return json(await fetch('/api/info'))
  },
  async listTournaments(): Promise<Tournament[]> {
    return json(await fetch('/api/tournaments'))
  },
  async getTournament(id: string): Promise<TournamentDetail> {
    return json(await fetch(`/api/tournaments/${id}`))
  },
  createTournament(name: string): Promise<Tournament> {
    return post('/api/tournaments', { name })
  },
  cancelTournament(id: string): Promise<Tournament> {
    return post(`/api/tournaments/${id}/cancel`)
  },
  reactivateTournament(id: string): Promise<Tournament> {
    return post(`/api/tournaments/${id}/reactivate`)
  },
  async deleteTournament(id: string): Promise<void> {
    await json<{ ok: true }>(await fetch(`/api/tournaments/${id}`, { method: 'DELETE' }))
  },
  createFloor(tournamentId: string, name: string): Promise<Floor> {
    return post(`/api/tournaments/${tournamentId}/floors`, { name })
  },
  async deleteFloor(id: string): Promise<void> {
    await json<{ ok: true }>(await fetch(`/api/floors/${id}`, { method: 'DELETE' }))
  },
  addParticipant(tournamentId: string, input: AddParticipantInput): Promise<Participant> {
    return post(`/api/tournaments/${tournamentId}/participants`, input)
  },
  async deleteParticipant(id: string): Promise<void> {
    await json<{ ok: true }>(await fetch(`/api/participants/${id}`, { method: 'DELETE' }))
  },
  /** Upload an already cropped and scaled JPEG (see `toAvatarJpeg`). */
  async setAvatarPhoto(id: string, jpeg: Blob): Promise<Participant> {
    return json(
      await fetch(`/api/participants/${id}/avatar/photo`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        body: jpeg,
      }),
    )
  },
  setAvatarEmoji(id: string, emoji: string): Promise<Participant> {
    return put(`/api/participants/${id}/avatar/emoji`, { emoji })
  },
  async clearAvatar(id: string): Promise<Participant> {
    return json(await fetch(`/api/participants/${id}/avatar`, { method: 'DELETE' }))
  },
  configurePhases(tournamentId: string, input: ConfigurePhasesInput): Promise<Stage[]> {
    return put(`/api/tournaments/${tournamentId}/phases`, input)
  },
  /** Save the phase setup and draw the first phase, all or nothing. */
  startTournament(tournamentId: string, phases: ConfigurePhasesInput): Promise<Match[]> {
    return post(`/api/tournaments/${tournamentId}/start`, phases)
  },
  claimMatch(id: string): Promise<Match> {
    return post(`/api/matches/${id}/claim`)
  },
  assignMatchFloor(id: string, floorId: string | null, position?: number): Promise<Match> {
    return post(`/api/matches/${id}/floor`, { floorId, position })
  },
  autoAssign(tournamentId: string): Promise<{ ok: true }> {
    return post(`/api/tournaments/${tournamentId}/autoassign`)
  },
  setAutoFill(tournamentId: string, enabled: boolean): Promise<Tournament> {
    return post(`/api/tournaments/${tournamentId}/auto-assign`, { enabled })
  },
  reorderFloorQueue(floorId: string, matchIds: string[]): Promise<{ ok: true }> {
    return post(`/api/floors/${floorId}/queue`, { matchIds })
  },
  reportLeg(id: string, legIndex: number, winnerId: string): Promise<Match> {
    return post(`/api/matches/${id}/legs`, { legIndex, winnerId })
  },
}
