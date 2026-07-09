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
}

interface Snapshot {
  players: Player[]
  currentPlayerIndex: number
  currentThrows: DartThrow[]
  winnerIndex: number | null
}

function initialPlayers(): Player[] {
  return PLAYERS.map((name) => ({ name, score: START_SCORE }))
}

export function useDartGame() {
  const players = ref<Player[]>(initialPlayers())
  const currentPlayerIndex = ref(0)
  const currentThrows = ref<DartThrow[]>([])
  const winnerIndex = ref<number | null>(null)

  // Snapshot stack powering undo. Each entry is the full state *before* a throw.
  const history = ref<Snapshot[]>([])

  const currentPlayer = computed(() => players.value[currentPlayerIndex.value])
  const isGameOver = computed(() => winnerIndex.value !== null)
  const canUndo = computed(() => history.value.length > 0)

  function snapshot(): Snapshot {
    return {
      players: players.value.map((p) => ({ ...p })),
      currentPlayerIndex: currentPlayerIndex.value,
      currentThrows: currentThrows.value.map((t) => ({ ...t })),
      winnerIndex: winnerIndex.value,
    }
  }

  function advanceTurn() {
    currentThrows.value = []
    currentPlayerIndex.value = (currentPlayerIndex.value + 1) % players.value.length
  }

  function throwDart(base: number, multiplier: Multiplier) {
    if (isGameOver.value) return

    const player = players.value[currentPlayerIndex.value]
    if (!player) return

    history.value.push(snapshot())

    const points = base * multiplier
    const newScore = player.score - points

    currentThrows.value.push({ base, multiplier, points })

    if (newScore === 0) {
      player.score = 0
      winnerIndex.value = currentPlayerIndex.value
      return
    }

    if (newScore < 0) {
      // Bust: cancel the whole turn, revert to the start-of-turn score.
      const turnPoints = currentThrows.value.reduce((sum, t) => sum + t.points, 0)
      player.score += turnPoints - points // undo prior throws this turn (points not yet applied)
      advanceTurn()
      return
    }

    player.score = newScore

    if (currentThrows.value.length >= THROWS_PER_TURN) {
      advanceTurn()
    }
  }

  function undo() {
    const prev = history.value.pop()
    if (!prev) return
    players.value = prev.players
    currentPlayerIndex.value = prev.currentPlayerIndex
    currentThrows.value = prev.currentThrows
    winnerIndex.value = prev.winnerIndex
  }

  function reset() {
    players.value = initialPlayers()
    currentPlayerIndex.value = 0
    currentThrows.value = []
    winnerIndex.value = null
    history.value = []
  }

  return {
    players,
    currentPlayerIndex,
    currentThrows,
    winnerIndex,
    currentPlayer,
    isGameOver,
    canUndo,
    throwDart,
    undo,
    reset,
  }
}
