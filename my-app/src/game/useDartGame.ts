import { computed, ref } from 'vue'

export const PLAYERS = ['Marco', 'Amir', 'Louis', 'Korni'] as const
export const START_SCORE = 301
export const THROWS_PER_TURN = 3

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
  const players = ref<Player[]>([])
  const currentPlayerIndex = ref(0)
  const currentThrows = ref<DartThrow[]>([])
  // Player indices in the order they reached exactly 0 (1st, 2nd, ...).
  const finishOrder = ref<number[]>([])
  // Index of the player whose finish is currently being announced (drives the overlay).
  const bannerIndex = ref<number | null>(null)

  // Snapshot stack powering undo. Each entry is the full state *before* a throw.
  const history = ref<Snapshot[]>([])

  const currentPlayer = computed(() => players.value[currentPlayerIndex.value])
  // Game is fully over once only a single player has not yet finished.
  const isGameOver = computed(() => finishOrder.value.length >= players.value.length - 1)
  const canUndo = computed(() => history.value.length > 0)
  const showBanner = computed(() => bannerIndex.value !== null)

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

  function throwDart(base: number, multiplier: Multiplier) {
    // Ignore input while the result overlay is up or the game is finished.
    if (isGameOver.value || showBanner.value) return

    const player = players.value[currentPlayerIndex.value]
    if (!player) return

    history.value.push(snapshot())

    const points = base * multiplier
    const newScore = player.score - points

    currentThrows.value.push({ base, multiplier, points })

    if (newScore === 0) {
      player.score = 0
      player.lastThrows = [...currentThrows.value] // keep the winning darts on the card
      finishOrder.value.push(currentPlayerIndex.value)
      bannerIndex.value = currentPlayerIndex.value // pause for the overlay
      return
    }

    if (newScore < 0) {
      // Bust: cancel the whole turn, revert to the start-of-turn score.
      const turnPoints = currentThrows.value.reduce((sum, t) => sum + t.points, 0)
      player.score += turnPoints - points
      advanceTurn()
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

  // Start a game with the given players, in the given play order.
  function startGame(names: string[]) {
    players.value = names.map((name) => ({ name, score: START_SCORE, lastThrows: [] }))
    currentPlayerIndex.value = 0
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

  return {
    phase,
    players,
    currentPlayerIndex,
    currentThrows,
    finishOrder,
    bannerIndex,
    currentPlayer,
    isGameOver,
    canUndo,
    showBanner,
    standings,
    placeOf,
    throwDart,
    continuePlaying,
    undo,
    startGame,
    backToSetup,
  }
}
