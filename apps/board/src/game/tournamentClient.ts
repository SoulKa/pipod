// Optional tournament mode for the board. A singleton socket.io client that a Pi
// uses to join a server-hosted tournament: register, subscribe, claim a match,
// stream throws, and report leg results. Offline play never touches this module.
import { ref, shallowRef } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  Floor,
  MatchAssignment,
  Multiplier,
  ServerToClientEvents,
  Tournament,
} from '@pi-darts/shared'

type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const STORAGE_KEY = 'pi-darts.tournament.v1'

interface Persisted {
  serverUrl: string
  boardId: string
  tournamentId: string
  floorId: string
}

function loadPersisted(): Persisted {
  const fallback: Persisted = {
    serverUrl: '',
    boardId: crypto.randomUUID(),
    tournamentId: '',
    floorId: '',
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : '',
      boardId:
        typeof parsed.boardId === 'string' && parsed.boardId ? parsed.boardId : fallback.boardId,
      tournamentId: typeof parsed.tournamentId === 'string' ? parsed.tournamentId : '',
      floorId: typeof parsed.floorId === 'string' ? parsed.floorId : '',
    }
  } catch {
    return fallback
  }
}

const initial = loadPersisted()

const socket = shallowRef<BoardSocket | null>(null)
const connected = ref(false)
const serverUrl = ref(initial.serverUrl)
const boardId = ref(initial.boardId)
const tournaments = ref<Tournament[]>([])
const tournamentId = ref(initial.tournamentId)
const floors = ref<Floor[]>([])
const floorId = ref(initial.floorId)
const assignment = ref<MatchAssignment | null>(null)
const errorMsg = ref('')

function persist(): void {
  const data: Persisted = {
    serverUrl: serverUrl.value,
    boardId: boardId.value,
    tournamentId: tournamentId.value,
    floorId: floorId.value,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore quota/availability errors — connection still works this session.
  }
}

function normalizeServerUrl(host: string): string {
  const value = host.trim().replace(/\/+$/, '')
  if (!value) return ''
  const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`)
  if (!url.port) url.port = '3000'
  return url.toString().replace(/\/$/, '')
}

async function loadTournaments(): Promise<void> {
  if (!serverUrl.value) return
  const response = await fetch(`${serverUrl.value}/api/tournaments`)
  if (!response.ok) throw new Error('could not load tournaments from this host')
  tournaments.value = (await response.json()) as Tournament[]
}

async function selectTournament(id: string, preserveFloor = false): Promise<void> {
  tournamentId.value = id
  if (!preserveFloor) floorId.value = ''
  floors.value = []
  assignment.value = null
  persist()
  if (!serverUrl.value || !id) return
  const response = await fetch(`${serverUrl.value}/api/tournaments/${id}`)
  if (!response.ok) {
    errorMsg.value = 'could not load tournament floors'
    throw new Error(errorMsg.value)
  }
  const detail = (await response.json()) as { floors: Floor[] }
  floors.value = detail.floors
}

function registerFloor(): void {
  if (!socket.value || !tournamentId.value || !floorId.value) return
  socket.value.emit('board:register', {
    boardId: boardId.value,
    tournamentId: tournamentId.value,
    floorId: floorId.value,
  })
  persist()
}

function selectFloor(id: string): void {
  floorId.value = id
  assignment.value = null
  registerFloor()
}

function connect(host: string): void {
  try {
    serverUrl.value = normalizeServerUrl(host)
  } catch {
    errorMsg.value = 'enter a valid host IP or server URL'
    return
  }
  if (!serverUrl.value) {
    errorMsg.value = 'enter a host IP or server URL'
    return
  }
  persist()
  socket.value?.disconnect()

  const s: BoardSocket = io(serverUrl.value, { transports: ['websocket', 'polling'] })
  socket.value = s

  s.on('connect', () => {
    connected.value = true
    errorMsg.value = ''
    void loadTournaments()
      .then(() => {
        if (tournamentId.value) return selectTournament(tournamentId.value, true)
      })
      .then(() => registerFloor())
      .catch((err: unknown) => {
        errorMsg.value = err instanceof Error ? err.message : 'could not load tournaments'
      })
  })
  s.on('disconnect', () => {
    connected.value = false
  })
  s.on('match:assigned', (a) => {
    assignment.value = a
  })
  s.on('error:message', (m) => {
    errorMsg.value = m
  })
}

function disconnect(): void {
  socket.value?.disconnect()
  socket.value = null
  connected.value = false
}

function reportThrow(participantId: string, base: number, multiplier: Multiplier): void {
  const matchId = assignment.value?.match.id
  if (!matchId) return
  socket.value?.emit('match:throw', { matchId, participantId, base, multiplier })
}

function reportLegResult(legIndex: number, winnerId: string): void {
  const matchId = assignment.value?.match.id
  if (!matchId) return
  socket.value?.emit('match:legResult', { matchId, legIndex, winnerId })
}

function clearAssignment(): void {
  assignment.value = null
}

export function useTournamentClient() {
  return {
    connected,
    serverUrl,
    boardId,
    tournaments,
    tournamentId,
    floors,
    floorId,
    assignment,
    errorMsg,
    connect,
    disconnect,
    loadTournaments,
    selectTournament,
    selectFloor,
    reportThrow,
    reportLegResult,
    clearAssignment,
    persist,
  }
}
