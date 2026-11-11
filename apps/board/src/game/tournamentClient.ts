import { ref, shallowRef } from 'vue'
import { io, type Socket } from 'socket.io-client'
import {
  DEFAULT_SERVER_PORT,
  isOpenTournament,
  type BoardGameSnapshot,
  type BoardSession,
  type ClientToServerEvents,
  type Floor,
  type MatchAssignment,
  type MatchSeats,
  type SeatPlayer,
  type Multiplier,
  type ServerToClientEvents,
  type Tournament,
  type TournamentDetail,
  type TournamentOver,
} from '@pipod/shared'

type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** How long a board waits for the server to confirm a reported leg. */
const REPORT_TIMEOUT_MS = 5000
/** How long a board waits for the server to accept its floor. */
const REGISTER_TIMEOUT_MS = 5000

export type LegReport = { ok: true } | { ok: false; message: string }

const socket = shallowRef<BoardSocket | null>(null)
const connected = ref(false)
const serverUrl = ref('')
const boardId = ref<string>(crypto.randomUUID())
const tournaments = ref<Tournament[]>([])
const tournamentId = ref('')
const floors = ref<Floor[]>([])
// Floors another board already holds, as of the last floor list.
const occupiedFloorIds = ref<string[]>([])
// Only set once the server accepted the board on it; until then the picker stays up.
const floorId = ref('')
// What the server dispatched, never changed afterwards: a new value here means a new
// match, which the board restarts on.
const assignment = ref<MatchAssignment | null>(null)
// The assigned match's players as they are now — renames and new pictures land here.
const seats = ref<MatchSeats | null>(null)
const session = ref<BoardSession>({ snapshot: null, revision: 0 })
const errorMsg = ref('')
// Kept apart from `errorMsg`, which every (re)connect clears: on a resumed launch link
// the socket can connect after the tournament was already refused.
const selectError = ref('')
// Last floor registration, replayed on every (re)connect: the server keys a board's
// authorization off the socket, so a dropped transport silently unregisters the board.
const registration = ref<{ tournamentId: string; floorId: string } | null>(null)
// Settles the floor pick in flight once the server answers its registration.
let settlePick: ((ok: boolean) => void) | null = null
// Set when the joined tournament is completed, which puts its winner on screen.
const over = ref<TournamentOver | null>(null)

function normalizeServerUrl(host: string): string {
  const value = host.trim().replace(/\/+$/, '')
  if (!value) return ''
  const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`)
  if (!url.port) url.port = String(DEFAULT_SERVER_PORT)
  return url.toString().replace(/\/$/, '')
}

async function loadTournaments(): Promise<void> {
  const response = await fetch(`${serverUrl.value}/api/tournaments`)
  if (!response.ok) throw new Error('could not load tournaments from this host')
  // The server refuses boards on a closed tournament, so never offer one.
  const list = (await response.json()) as Tournament[]
  tournaments.value = list.filter((t) => isOpenTournament(t.status))
}

async function loadFloors(id: string): Promise<void> {
  const response = await fetch(`${serverUrl.value}/api/tournaments/${id}`)
  if (!response.ok) throw new Error('could not load tournament floors')
  const detail = (await response.json()) as TournamentDetail
  // The list hides closed tournaments; this catches a saved launch link to one.
  if (!isOpenTournament(detail.tournament.status)) throw new Error('this tournament is over')
  floors.value = detail.floors
  // Servers before floor occupancy leave it out.
  occupiedFloorIds.value = detail.occupiedFloorIds ?? []
}

/** Resolves false (with `selectError` set) when the tournament can't be joined. */
async function selectTournament(id: string): Promise<boolean> {
  tournamentId.value = id
  floorId.value = ''
  floors.value = []
  occupiedFloorIds.value = []
  selectError.value = ''
  try {
    await loadFloors(id)
    return true
  } catch (err) {
    tournamentId.value = ''
    selectError.value = err instanceof Error ? err.message : 'could not load tournament'
    return false
  }
}

function setBoardId(id: string): void {
  if (id) boardId.value = id
}

function register(): void {
  const current = registration.value
  // Buffered emits are flushed before the 'connect' listener runs, so a queued
  // registration would arrive out of order — always register on a live socket.
  if (!socket.value?.connected || !current) return
  socket.value
    .timeout(REGISTER_TIMEOUT_MS)
    .emit('board:register', { boardId: boardId.value, ...current }, (err, response) => {
      // A newer pick, or leaving the tournament, replaced this registration.
      if (registration.value !== current) return
      // Servers before the acknowledgement never answer; they refused a board only with
      // an error message.
      const ok = !!err || response.ok
      if (ok) {
        floorId.value = current.floorId
      } else {
        // Also on a re-registration after a reconnect: someone took the floor meanwhile.
        registration.value = null
        floorId.value = ''
        selectError.value = response.message
        void loadFloors(current.tournamentId).catch(() => {})
      }
      settlePick?.(ok)
      settlePick = null
    })
}

/** Resolves once the server answered: false (with `selectError` set) when refused. */
function selectFloor(id: string): Promise<boolean> {
  if (!tournamentId.value || !id) return Promise.resolve(false)
  settlePick?.(false)
  selectError.value = ''
  registration.value = { tournamentId: tournamentId.value, floorId: id }
  const picked = new Promise<boolean>((resolve) => (settlePick = resolve))
  register()
  return picked
}

/** Drop the tournament (e.g. once it is over) and refresh the list of open ones. */
function leaveTournament(): void {
  settlePick?.(false)
  settlePick = null
  registration.value = null
  tournamentId.value = ''
  floorId.value = ''
  floors.value = []
  occupiedFloorIds.value = []
  over.value = null
  clearAssignment()
  void loadTournaments().catch(() => {})
}

function connect(host: string): void {
  // A refusal belongs to the tournament list it came from, not to the next server's.
  selectError.value = ''
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
  next.on('match:assigned', (value) => {
    assignment.value = value
    seats.value = value.participants
  })
  next.on('match:withdrawn', ({ matchId }) => {
    if (assignment.value?.match.id === matchId) clearAssignment()
  })
  next.on('tournament:over', (value) => {
    if (value.tournamentId === tournamentId.value) over.value = value
  })
  next.on('participant:updated', ({ id, name, avatar }) => {
    if (!seats.value) return
    const swap = (seat: SeatPlayer) => (seat.id === id ? { id, name, avatar } : seat)
    seats.value = [swap(seats.value[0]), swap(seats.value[1])]
  })
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
  seats.value = null
}

export function useTournamentClient() {
  return {
    connected,
    serverUrl,
    boardId,
    tournaments,
    tournamentId,
    floors,
    occupiedFloorIds,
    floorId,
    over,
    assignment,
    seats,
    session,
    errorMsg,
    selectError,
    connect,
    setBoardId,
    selectTournament,
    selectFloor,
    leaveTournament,
    saveSnapshot,
    reportThrow,
    reportLegResult,
    clearAssignment,
  }
}
