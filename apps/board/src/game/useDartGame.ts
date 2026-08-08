import { computed, ref } from 'vue'
import type { BoardGameSnapshot, BoardTournamentState } from '@pipod/shared'
import { suggestCheckouts, type CheckoutRoute } from './checkout'
import { isLemonTurn } from './lemon'

export const THROWS_PER_TURN = 3

// Selectable starting scores and finishing rules.
export const START_SCORES = [301, 501] as const
export type OutMode = 'single' | 'double'

export interface GameOptions {
  startScore: number
  outMode: OutMode
}

export const DEFAULT_OPTIONS: GameOptions = { startScore: 301, outMode: 'single' }

export type Multiplier = 1 | 2 | 3

export interface DartThrow {
  base: number
  multiplier: Multiplier
  points: number
}

export interface Player {
  name: string
  score: number
  // The darts thrown on this player's most recently completed turn.
  lastThrows: DartThrow[]
}

interface Snapshot {
  players: Player[]
  currentPlayerIndex: number
  currentThrows: DartThrow[]
  finishOrder: number[]
  bannerIndex: number | null
}

export function useDartGame() {
  // 'setup' = choosing players & order; 'playing' = a game is in progress.
  const phase = ref<'setup' | 'playing'>('setup')
  // Options for the game currently in progress (set by startGame).
  const options = ref<GameOptions>({ ...DEFAULT_OPTIONS })
  const players = ref<Player[]>([])
  const currentPlayerIndex = ref(0)
  const currentThrows = ref<DartThrow[]>([])
  // Player indices in the order they reached exactly 0 (1st, 2nd, ...).
  const finishOrder = ref<number[]>([])
  // Index of the player whose finish is currently being announced (drives the overlay).
  const bannerIndex = ref<number | null>(null)
  // Monotonic tally of "lemon" turns (5+1+20 singles). The UI watches it for increments
  // to fire the gag, so it is deliberately never reset — a reset would look like an event.
  const lemonTurns = ref(0)
  // Same idea for the crowd-pleasing darts: monotonic, watched for increments by the UI.
  const bigDarts = ref(0)

  // Snapshot stack powering undo. Each entry is the full state *before* a throw.
  const history = ref<Snapshot[]>([])

  const currentPlayer = computed(() => players.value[currentPlayerIndex.value])
  // Game is fully over once only a single player has not yet finished.
  const isGameOver = computed(() => finishOrder.value.length >= players.value.length - 1)
  const canUndo = computed(() => history.value.length > 0)
  const showBanner = computed(() => bannerIndex.value !== null)

  // Ways for the active player to finish this turn (empty when none / not applicable).
  const checkoutRoutes = computed<CheckoutRoute[]>(() => {
    if (phase.value !== 'playing' || isGameOver.value || showBanner.value) return []
    const player = currentPlayer.value
    if (!player) return []
    const dartsLeft = THROWS_PER_TURN - currentThrows.value.length
    return suggestCheckouts(player.score, dartsLeft, options.value.outMode)
  })

  // Final standings: finishers in order, then the remaining player(s) last.
  const standings = computed<Player[]>(() => {
    const finished = finishOrder.value.map((i) => players.value[i]!)
    const rest = players.value.filter((_, i) => !finishOrder.value.includes(i))
    return [...finished, ...rest]
  })

  function placeOf(index: number): number {
    const pos = finishOrder.value.indexOf(index)
    return pos === -1 ? 0 : pos + 1
  }

  function snapshot(): Snapshot {
    return {
      players: players.value.map((p) => ({ ...p, lastThrows: [...p.lastThrows] })),
      currentPlayerIndex: currentPlayerIndex.value,
      currentThrows: currentThrows.value.map((t) => ({ ...t })),
      finishOrder: [...finishOrder.value],
      bannerIndex: bannerIndex.value,
    }
  }

  function nextActiveIndex(from: number): number {
    let i = from
    for (let n = 0; n < players.value.length; n++) {
      i = (i + 1) % players.value.length
      if (!finishOrder.value.includes(i)) return i
    }
    return from
  }

  function advanceTurn() {
    // Remember this player's darts so their card keeps showing them.
    const finishing = players.value[currentPlayerIndex.value]
    if (finishing) finishing.lastThrows = [...currentThrows.value]
    currentThrows.value = []
    currentPlayerIndex.value = nextActiveIndex(currentPlayerIndex.value)
  }

  // Bust: cancel the whole turn and revert to the start-of-turn score.
  // Assumes the current dart's points have NOT yet been subtracted from player.score.
  function bust(player: Player, currentPoints: number) {
    const turnPoints = currentThrows.value.reduce((sum, t) => sum + t.points, 0)
    player.score += turnPoints - currentPoints
    advanceTurn()
  }

  function throwDart(base: number, multiplier: Multiplier) {
    // Ignore input while the result overlay is up or the game is finished.
    if (isGameOver.value || showBanner.value) return

    const player = players.value[currentPlayerIndex.value]
    if (!player) return

    history.value.push(snapshot())

    const points = base * multiplier
    const newScore = player.score - points
    // A "double" for checkout purposes: any double, incl. double-bull (25×2=50).
    const isDouble = multiplier === 2
    const doubleOut = options.value.outMode === 'double'

    currentThrows.value.push({ base, multiplier, points })

    // Checked before the bust/finish branches: the darts were thrown either way, so a
    // turn that busts on the third dart still earns its lemons.
    if (isLemonTurn(currentThrows.value)) lemonTurns.value += 1
    // The two darts worth a cheer: the maximum (T20, 60) and the bull (50).
    if ((base === 20 && multiplier === 3) || (base === 25 && multiplier === 2)) {
      bigDarts.value += 1
    }

    // Below zero always busts. In double-out, leaving exactly 1 also busts
    // (you can't check out from 1), as does reaching 0 on a non-double.
    if (newScore < 0 || (doubleOut && newScore === 1)) {
      bust(player, points)
      return
    }

    if (newScore === 0) {
      if (doubleOut && !isDouble) {
        bust(player, points)
        return
      }
      player.score = 0
      player.lastThrows = [...currentThrows.value] // keep the winning darts on the card
      finishOrder.value.push(currentPlayerIndex.value)
      bannerIndex.value = currentPlayerIndex.value // pause for the overlay
      return
    }

    player.score = newScore

    if (currentThrows.value.length >= THROWS_PER_TURN) {
      advanceTurn()
    }
  }

  // Dismiss the result overlay and let the remaining players continue.
  function continuePlaying() {
    if (!showBanner.value) return
    bannerIndex.value = null
    if (!isGameOver.value) advanceTurn()
  }

  function undo() {
    const prev = history.value.pop()
    if (!prev) return
    players.value = prev.players
    currentPlayerIndex.value = prev.currentPlayerIndex
    currentThrows.value = prev.currentThrows
    finishOrder.value = prev.finishOrder
    bannerIndex.value = prev.bannerIndex
  }

  // Start a game with the given players (in play order) and options. `startIndex` lets a
  // caller hand the first throw to someone other than the first seat without reordering
  // the roster — tournament seats stay aligned with the server's participant ids.
  function startGame(config: { names: string[]; startIndex?: number } & GameOptions) {
    options.value = { startScore: config.startScore, outMode: config.outMode }
    players.value = config.names.map((name) => ({
      name,
      score: config.startScore,
      lastThrows: [],
    }))
    const startIndex = config.startIndex ?? 0
    currentPlayerIndex.value = startIndex < players.value.length ? startIndex : 0
    currentThrows.value = []
    finishOrder.value = []
    bannerIndex.value = null
    history.value = []
    phase.value = 'playing'
  }

  // Return to the setup screen to change roster / order.
  function backToSetup() {
    phase.value = 'setup'
    players.value = []
    currentThrows.value = []
    finishOrder.value = []
    bannerIndex.value = null
    history.value = []
  }

  function exportSnapshot(tournament: BoardTournamentState | null): BoardGameSnapshot {
    return {
      phase: phase.value,
      options: {
        startScore: options.value.startScore === 501 ? 501 : 301,
        outMode: options.value.outMode,
      },
      players: players.value.map((player) => ({ ...player, lastThrows: [...player.lastThrows] })),
      currentPlayerIndex: currentPlayerIndex.value,
      currentThrows: currentThrows.value.map((dart) => ({ ...dart })),
      finishOrder: [...finishOrder.value],
      bannerIndex: bannerIndex.value,
      history: history.value.map((entry) => ({
        players: entry.players.map((player) => ({ ...player, lastThrows: [...player.lastThrows] })),
        currentPlayerIndex: entry.currentPlayerIndex,
        currentThrows: entry.currentThrows.map((dart) => ({ ...dart })),
        finishOrder: [...entry.finishOrder],
        bannerIndex: entry.bannerIndex,
      })),
      tournament,
    }
  }

  function restoreSnapshot(snapshot: BoardGameSnapshot): void {
    phase.value = snapshot.phase
    options.value = { ...snapshot.options }
    players.value = snapshot.players.map((player) => ({
      ...player,
      lastThrows: [...player.lastThrows],
    }))
    currentPlayerIndex.value = snapshot.currentPlayerIndex
    currentThrows.value = snapshot.currentThrows.map((dart) => ({ ...dart }))
    finishOrder.value = [...snapshot.finishOrder]
    bannerIndex.value = snapshot.bannerIndex
    history.value = snapshot.history.map((entry) => ({
      players: entry.players.map((player) => ({ ...player, lastThrows: [...player.lastThrows] })),
      currentPlayerIndex: entry.currentPlayerIndex,
      currentThrows: entry.currentThrows.map((dart) => ({ ...dart })),
      finishOrder: [...entry.finishOrder],
      bannerIndex: entry.bannerIndex,
    }))
  }

  return {
    phase,
    options,
    players,
    currentPlayerIndex,
    currentThrows,
    finishOrder,
    bannerIndex,
    lemonTurns,
    bigDarts,
    currentPlayer,
    isGameOver,
    canUndo,
    showBanner,
    checkoutRoutes,
    standings,
    placeOf,
    throwDart,
    continuePlaying,
    undo,
    startGame,
    backToSetup,
    exportSnapshot,
    restoreSnapshot,
  }
}
