import { ref, shallowRef } from 'vue'
import { io, type Socket } from 'socket.io-client'
import type {
  BoardGameSnapshot,
  BoardSession,
  ClientToServerEvents,
  Floor,
  MatchAssignment,
  Multiplier,
  ServerToClientEvents,
  Tournament,
} from '@pi-darts/shared'

type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const socket = shallowRef<BoardSocket | null>(null)
const connected = ref(false)
const serverUrl = ref('')
const boardId = ref<string>(crypto.randomUUID())
const tournaments = ref<Tournament[]>([])
const tournamentId = ref('')
const floors = ref<Floor[]>([])
const floorId = ref('')
const assignment = ref<MatchAssignment | null>(null)
const session = ref<BoardSession>({ snapshot: null, revision: 0 })
const errorMsg = ref('')

function normalizeServerUrl(host: string): string {
  const value = host.trim().replace(/\/+$/, '')
  if (!value) return ''
  const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`)
  if (!url.port) url.port = '3000'
  return url.toString().replace(/\/$/, '')
}

async function loadTournaments(): Promise<void> {
  const response = await fetch(`${serverUrl.value}/api/tournaments`)
  if (!response.ok) throw new Error('could not load tournaments from this host')
  tournaments.value = (await response.json()) as Tournament[]
}

async function selectTournament(id: string): Promise<void> {
  tournamentId.value = id
  floorId.value = ''
  floors.value = []
  if (!id) return
  const response = await fetch(`${serverUrl.value}/api/tournaments/${id}`)
  if (!response.ok) throw new Error('could not load tournament floors')
  floors.value = ((await response.json()) as { floors: Floor[] }).floors
}

function setBoardId(id: string): void {
  if (id) boardId.value = id
}

function selectFloor(id: string): void {
  floorId.value = id
  if (!socket.value || !tournamentId.value || !id) return
  socket.value.emit('board:register', {
    boardId: boardId.value,
    tournamentId: tournamentId.value,
    floorId: id,
  })
}

function connect(host: string): void {
  try {
    serverUrl.value = normalizeServerUrl(host)
  } catch {
    errorMsg.value = 'Enter a valid host IP.'
    return
  }
  if (!serverUrl.value) {
    errorMsg.value = 'Enter a host IP.'
    return
  }
  socket.value?.disconnect()
  const next: BoardSocket = io(serverUrl.value, { transports: ['websocket', 'polling'] })
  socket.value = next
  next.on('connect', () => {
    connected.value = true
    errorMsg.value = ''
    void loadTournaments().catch((err: unknown) => {
      errorMsg.value = err instanceof Error ? err.message : 'could not load tournaments'
    })
  })
  next.on('disconnect', () => (connected.value = false))
  next.on('match:assigned', (value) => (assignment.value = value))
  next.on('board:session', (value) => (session.value = value))
  next.on('error:message', (message) => (errorMsg.value = message))
}

function saveSnapshot(snapshot: BoardGameSnapshot): void {
  socket.value?.emit(
    'board:snapshot',
    { snapshot, expectedRevision: session.value.revision },
    (reply) => {
      if (reply.ok) session.value = reply.session
      else {
        errorMsg.value = reply.message
        if (reply.session) session.value = reply.session
      }
    },
  )
}

function reportLegResult(legIndex: number, winnerId: string): void {
  const matchId = assignment.value?.match.id
  if (matchId) socket.value?.emit('match:legResult', { matchId, legIndex, winnerId })
}

function reportThrow(_participantId: string, _base: number, _multiplier: Multiplier): void {
  // Full snapshots replace the legacy per-dart protocol.
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
    session,
    errorMsg,
    connect,
    setBoardId,
    selectTournament,
    selectFloor,
    saveSnapshot,
    reportThrow,
    reportLegResult,
    clearAssignment,
  }
}
