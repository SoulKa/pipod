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
} from '@pipod/shared'

type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** How long a board waits for the server to confirm a reported leg. */
const REPORT_TIMEOUT_MS = 5000

export type LegReport = { ok: true } | { ok: false; message: string }

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
// Last floor registration, replayed on every (re)connect: the server keys a board's
// authorization off the socket, so a dropped transport silently unregisters the board.
const registration = ref<{ tournamentId: string; floorId: string } | null>(null)

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

function register(): void {
  const current = registration.value
  // Buffered emits are flushed before the 'connect' listener runs, so a queued
  // registration would arrive out of order — always register on a live socket.
  if (!socket.value?.connected || !current) return
  socket.value.emit('board:register', { boardId: boardId.value, ...current })
}

function selectFloor(id: string): void {
  floorId.value = id
  if (!tournamentId.value || !id) return
  registration.value = { tournamentId: tournamentId.value, floorId: id }
  register()
}

function connect(host: string): void {
  let url: string
  try {
    url = normalizeServerUrl(host)
  } catch {
    errorMsg.value = 'Enter a valid host IP.'
    return
  }
  if (!url) {
    errorMsg.value = 'Enter a host IP.'
    return
  }
  // The wizard re-runs `connect` whenever it remounts (e.g. after a match ends).
  // Replacing a healthy socket there drops in-flight emits — such as the leg result
  // that just triggered the remount — so reuse the existing connection.
  if (socket.value?.connected && url === serverUrl.value) return
  serverUrl.value = url
  socket.value?.disconnect()
  const next: BoardSocket = io(serverUrl.value, { transports: ['websocket', 'polling'] })
  socket.value = next
  next.on('connect', () => {
    connected.value = true
    errorMsg.value = ''
    register()
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

/**
 * Report a finished leg and wait for the server's acknowledgement. The board must not
 * advance its own tally on a rejected or unanswered report — that used to lose the leg
 * silently, leaving the server's match stuck on the previous score.
 *
 * The outcome is returned rather than pushed into `errorMsg`, which is the wizard's
 * connection state and outlives any single report.
 */
function reportLegResult(legIndex: number, winnerId: string): Promise<LegReport> {
  const matchId = assignment.value?.match.id
  const active = socket.value
  if (!matchId || !active) {
    return Promise.resolve({ ok: false, message: 'Keine Verbindung zum Turnier-Server.' })
  }
  return new Promise((resolve) => {
    active
      .timeout(REPORT_TIMEOUT_MS)
      .emit('match:legResult', { matchId, legIndex, winnerId }, (err, response) => {
        if (err) {
          resolve({ ok: false, message: 'Server hat das Ergebnis nicht bestätigt.' })
        } else {
          resolve(response.ok ? { ok: true } : { ok: false, message: response.message })
        }
      })
  })
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
