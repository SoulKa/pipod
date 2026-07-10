// Typed REST client for the tournament server. Same-origin in production; the Vite
// dev proxy forwards /api to the server.
import type {
  AddParticipantInput,
  CreateStageInput,
  Floor,
  Match,
  Participant,
  Stage,
  Tournament,
} from '@pi-darts/shared'

export interface GroupView {
  id: string
  stageId: string
  name: string
  memberIds: string[]
}

export interface TournamentDetail {
  tournament: Tournament
  floors: Floor[]
  participants: Participant[]
  stages: Stage[]
  matches: Match[]
  groups: GroupView[]
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  return json<T>(
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

export const api = {
  async listTournaments(): Promise<Tournament[]> {
    return json(await fetch('/api/tournaments'))
  },
  async getTournament(id: string): Promise<TournamentDetail> {
    return json(await fetch(`/api/tournaments/${id}`))
  },
  createTournament(name: string): Promise<Tournament> {
    return post('/api/tournaments', { name })
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
    await fetch(`/api/participants/${id}`, { method: 'DELETE' })
  },
  createStage(tournamentId: string, input: CreateStageInput): Promise<Stage> {
    return post(`/api/tournaments/${tournamentId}/stages`, input)
  },
  generateStage(
    stageId: string,
    opts: { groupCount?: number; qualifiersPerGroup?: number },
  ): Promise<Match[]> {
    return post(`/api/stages/${stageId}/generate`, opts)
  },
  claimMatch(id: string): Promise<Match> {
    return post(`/api/matches/${id}/claim`)
  },
  assignMatchFloor(id: string, floorId: string): Promise<Match> {
    return post(`/api/matches/${id}/floor`, { floorId })
  },
  reportLeg(id: string, legIndex: number, winnerId: string): Promise<Match> {
    return post(`/api/matches/${id}/legs`, { legIndex, winnerId })
  },
}
