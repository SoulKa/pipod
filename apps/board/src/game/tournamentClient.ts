// Optional tournament mode for the board. A singleton socket.io client that a Pi
// uses to join a server-hosted tournament: register, subscribe, claim a match,
// stream throws, and report leg results. Offline play never touches this module.
import { ref, shallowRef } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  MatchAssignment,
  Multiplier,
  ServerToClientEvents,
  TournamentSnapshot,
} from '@pi-darts/shared'

type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const STORAGE_KEY = 'pi-darts.tournament.v1'

interface Persisted {
  serverUrl: string
  boardId: string
  boardName: string
}

function loadPersisted(): Persisted {
  const fallback: Persisted = { serverUrl: '', boardId: crypto.randomUUID(), boardName: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : '',
      boardId:
        typeof parsed.boardId === 'string' && parsed.boardId ? parsed.boardId : fallback.boardId,
      boardName: typeof parsed.boardName === 'string' ? parsed.boardName : '',
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
const boardName = ref(initial.boardName)
const snapshot = ref<TournamentSnapshot | null>(null)
const assignment = ref<MatchAssignment | null>(null)
const errorMsg = ref('')

function persist(): void {
  const data: Persisted = {
    serverUrl: serverUrl.value,
    boardId: boardId.value,
    boardName: boardName.value,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore quota/availability errors — connection still works this session.
  }
}

function connect(url: string): void {
  serverUrl.value = url.trim()
  persist()
  socket.value?.disconnect()

  const s: BoardSocket = io(serverUrl.value, { transports: ['websocket', 'polling'] })
  socket.value = s

  s.on('connect', () => {
    connected.value = true
    errorMsg.value = ''
    s.emit('board:register', { boardId: boardId.value, name: boardName.value || undefined })
  })
  s.on('disconnect', () => {
    connected.value = false
  })
  s.on('tournament:state', (snap) => {
    snapshot.value = snap
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

function subscribe(tournamentId: string): void {
  socket.value?.emit('tournament:subscribe', { tournamentId })
}

function claim(matchId: string): void {
  socket.value?.emit('match:claim', { matchId, boardId: boardId.value })
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
    boardName,
    snapshot,
    assignment,
    errorMsg,
    connect,
    disconnect,
    subscribe,
    claim,
    reportThrow,
    reportLegResult,
    clearAssignment,
    persist,
  }
}
