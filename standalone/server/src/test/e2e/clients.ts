// Fake floor board and overview client. Both speak the real socket.io wire protocol
// and are typed with the shared event maps, so a change to the contract that the board
// app relies on fails to compile here.
import { io as connect, type Socket } from 'socket.io-client'
import type {
  BoardGameSnapshot,
  BoardSession,
  BoardSnapshotResponse,
  ClientToServerEvents,
  DartThrow,
  LegResultResponse,
  LiveMatchState,
  LogLine,
  Match,
  MatchAssignment,
  ServerToClientEvents,
  TournamentSnapshot,
} from '@pipod/shared'
import { EventRecorder } from './events'

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const ACK_TIMEOUT_MS = 4000

function openSocket(url: string): Promise<ClientSocket> {
  const socket: ClientSocket = connect(url, { transports: ['websocket'], forceNew: true })
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', (err) => reject(err))
  })
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${label} ack`)),
        ACK_TIMEOUT_MS,
      )
      timer.unref?.()
    }),
  ])
}

function single(base: number): DartThrow {
  return { base, multiplier: 1, points: base }
}

/** A three-dart scoring turn, leaving enough for a double-out finish. */
function scoringTurn(snapshot: BoardGameSnapshot, playerIndex: number): BoardGameSnapshot {
  const turn = [single(20), single(20), single(20)]
  const scored = turn.reduce((sum, dart) => sum + dart.points, 0)
  return {
    ...snapshot,
    players: snapshot.players.map((player, index) =>
      index === playerIndex ? { ...player, score: Math.max(2, player.score - scored) } : player,
    ),
    currentPlayerIndex: playerIndex,
    currentThrows: turn,
  }
}

/** The state a board holds the instant a player checks out. */
function finishedLeg(snapshot: BoardGameSnapshot, winnerIndex: number): BoardGameSnapshot {
  return {
    ...snapshot,
    players: snapshot.players.map((player, index) =>
      index === winnerIndex
        ? { ...player, score: 0, lastThrows: [{ base: 20, multiplier: 2, points: 40 }] }
        : player,
    ),
    currentPlayerIndex: winnerIndex,
    currentThrows: [],
    finishOrder: [winnerIndex],
    bannerIndex: winnerIndex,
  }
}

export class BoardClient {
  readonly events = new EventRecorder()
  /** Latest session the server handed us — the board's optimistic-lock cursor. */
  session: BoardSession = { snapshot: null, revision: 0 }
  private stashed: MatchAssignment | null = null

  private constructor(
    private readonly socket: ClientSocket,
    readonly boardId: string,
  ) {
    socket.onAny((event: string, payload: unknown) => this.events.record(event, payload))
    socket.on('board:session', (session) => {
      this.session = session
    })
  }

  static async connect(url: string, boardId: string): Promise<BoardClient> {
    return new BoardClient(await openSocket(url), boardId)
  }

  /** Bind to a floor and wait for the session the server replies with. */
  async register(tournamentId: string, floorId: string): Promise<BoardSession> {
    this.sendRegister(tournamentId, floorId)
    return this.events.wait('board:session')
  }

  /** Register without awaiting a session — registration can be refused instead. */
  sendRegister(tournamentId: string, floorId: string): void {
    this.socket.emit('board:register', { boardId: this.boardId, tournamentId, floorId })
  }

  /** Next match dispatched to this floor, or null if none arrives in `timeoutMs`. */
  nextAssignment(timeoutMs = 4000): Promise<MatchAssignment | null> {
    if (this.stashed) {
      const assignment = this.stashed
      this.stashed = null
      return Promise.resolve(assignment)
    }
    return this.events.waitOptional('match:assigned', { timeoutMs })
  }

  /** Hand an assignment back so a later drain can play it. */
  stashAssignment(assignment: MatchAssignment): void {
    this.stashed = assignment
  }

  async uploadSnapshot(
    snapshot: BoardGameSnapshot,
    expectedRevision = this.session.revision,
  ): Promise<BoardSnapshotResponse> {
    const response = await withTimeout(
      this.socket.emitWithAck('board:snapshot', { snapshot, expectedRevision }),
      'board:snapshot',
    )
    if (response.ok) this.session = response.session
    return response
  }

  reportLeg(matchId: string, legIndex: number, winnerId: string): Promise<LegResultResponse> {
    return withTimeout(
      this.socket.emitWithAck('match:legResult', { matchId, legIndex, winnerId }),
      'match:legResult',
    )
  }

  /**
   * Play the assigned leg the way the board does: stream a scoring turn, upload the
   * checkout, then report the result and wait for the session the server issues in
   * response (the next leg, or a cleared floor once the match is over).
   */
  async playLeg(winnerId: string): Promise<LegResultResponse> {
    const snapshot = this.session.snapshot
    if (!snapshot?.tournament) throw new Error('board has no assigned match to play')
    const { activeMatchId, legIndex, participantIds } = snapshot.tournament
    const winnerIndex = participantIds.indexOf(winnerId)
    if (winnerIndex < 0) throw new Error(`${winnerId} is not in the assigned match`)

    const midLeg = await this.uploadSnapshot(scoringTurn(snapshot, winnerIndex))
    if (!midLeg.ok) throw new Error(`mid-leg snapshot rejected: ${midLeg.message}`)
    const checkout = await this.uploadSnapshot(
      finishedLeg(midLeg.session.snapshot ?? snapshot, winnerIndex),
    )
    if (!checkout.ok) throw new Error(`checkout snapshot rejected: ${checkout.message}`)

    const revisionBefore = this.session.revision
    const ack = await this.reportLeg(activeMatchId, legIndex, winnerId)
    // The server re-initializes (or clears) the floor session after a leg; wait for it
    // so the next playLeg starts from the revision the server expects.
    if (ack.ok) {
      await this.events.wait('board:session', {
        predicate: (session) => session.revision > revisionBefore,
      })
    }
    return ack
  }

  /** Play whole legs until the match is decided; returns the completed match. */
  async playMatch(
    pickWinner: (assignment: MatchAssignment) => string,
    assignment: MatchAssignment,
  ) {
    let match: Match = assignment.match
    while (match.status !== 'completed') {
      const ack = await this.playLeg(pickWinner(assignment))
      if (!ack.ok) throw new Error(`leg rejected: ${ack.message}`)
      match = ack.match
    }
    return match
  }

  errors(): string[] {
    return this.events.all('error:message')
  }

  close(): void {
    this.socket.close()
  }
}

/** Stands in for the console's overview screen: subscribes and records what it sees. */
export class SpectatorClient {
  readonly events = new EventRecorder()

  private constructor(private readonly socket: ClientSocket) {
    socket.onAny((event: string, payload: unknown) => this.events.record(event, payload))
  }

  static async connect(url: string): Promise<SpectatorClient> {
    return new SpectatorClient(await openSocket(url))
  }

  async subscribe(tournamentId: string): Promise<TournamentSnapshot> {
    this.socket.emit('tournament:subscribe', { tournamentId })
    return this.events.wait('tournament:state')
  }

  waitForState(
    predicate: (snapshot: TournamentSnapshot) => boolean,
    timeoutMs = 4000,
  ): Promise<TournamentSnapshot> {
    return this.events.wait('tournament:state', { predicate, timeoutMs })
  }

  states(): TournamentSnapshot[] {
    return this.events.all('tournament:state')
  }

  liveStates(): LiveMatchState[] {
    return this.events.all('match:live')
  }

  matchUpdates(): Match[] {
    return this.events.all('match:updated')
  }

  /** Open the log terminal's stream. Nothing is replayed, so subscribe before acting. */
  subscribeToLogs(): void {
    this.socket.emit('logs:subscribe')
  }

  unsubscribeFromLogs(): void {
    this.socket.emit('logs:unsubscribe')
  }

  waitForLog(predicate: (line: LogLine) => boolean, timeoutMs = 4000): Promise<LogLine> {
    return this.events.wait('log:line', { predicate, timeoutMs })
  }

  logs(): LogLine[] {
    return this.events.all('log:line')
  }

  close(): void {
    this.socket.close()
  }
}
