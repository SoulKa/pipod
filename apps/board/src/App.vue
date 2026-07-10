<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NumberPad from './components/NumberPad.vue'
import PlayerBoard from './components/PlayerBoard.vue'
import SetupScreen from './components/SetupScreen.vue'
import TournamentBar from './components/TournamentBar.vue'
import { useDartGame, type Multiplier } from './game/useDartGame'
import { useTournamentClient } from './game/tournamentClient'

const {
  phase,
  options,
  players,
  currentPlayerIndex,
  currentThrows,
  finishOrder,
  bannerIndex,
  checkoutRoutes,
  isGameOver,
  canUndo,
  showBanner,
  standings,
  throwDart,
  continuePlaying: continuePlayingLocal,
  undo: undoLocal,
  startGame,
  backToSetup,
  exportSnapshot,
  restoreSnapshot,
} = useDartGame()

// --- Tournament mode (additive; offline play is unaffected when inactive) ---
const tour = useTournamentClient()
const tournamentMode = ref(false)
const legIndex = ref(0)
// Server participant ids for the two seats, indexed like `players`.
const matchIds = ref<[string, string] | null>(null)
const legsWon = ref<[number, number]>([0, 0])

function legsToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1
}

// Start one leg of the current assigned match using the shared game engine.
function startLeg() {
  const a = tour.assignment.value
  if (!a) return
  const m = a.match
  const nameById = new Map(a.participants.map((p) => [p.id, p.name]))
  startGame({
    names: [
      nameById.get(m.participantAId ?? '') ?? 'Player A',
      nameById.get(m.participantBId ?? '') ?? 'Player B',
    ],
    startScore: m.startScore,
    outMode: m.outMode,
  })
  syncTournamentState()
}

function syncTournamentState() {
  const a = tour.assignment.value
  const ids = matchIds.value
  if (!a || !ids) return
  tour.saveSnapshot(
    exportSnapshot({
      activeMatchId: a.match.id,
      participantIds: ids,
      legIndex: legIndex.value,
      legsA: legsWon.value[0],
      legsB: legsWon.value[1],
    }),
  )
}

// When the server assigns a match, enter tournament mode and start the first leg.
watch(
  () => tour.assignment.value,
  (a) => {
    if (!a || !a.match.participantAId || !a.match.participantBId) return
    matchIds.value = [a.match.participantAId, a.match.participantBId]
    legsWon.value = [a.match.legsA, a.match.legsB]
    legIndex.value = a.match.legsA + a.match.legsB
    tournamentMode.value = true
    const restored = tour.session.value.snapshot
    if (restored?.tournament?.activeMatchId === a.match.id) {
      restoreSnapshot(restored)
    } else {
      startLeg()
    }
  },
)

const awaitingTournamentMatch = computed(() => !!tour.floorId.value && !tournamentMode.value)

// Record each dart, then mirror it to the server so overview screens update live.
function handleThrow(base: number, multiplier: Multiplier) {
  const ids = matchIds.value
  const throwerId = tournamentMode.value && ids ? ids[currentPlayerIndex.value] : null
  throwDart(base, multiplier)
  if (throwerId) tour.reportThrow(throwerId, base, multiplier)
  if (tournamentMode.value) syncTournamentState()
}

function undo() {
  undoLocal()
  if (tournamentMode.value) syncTournamentState()
}

function continuePlaying() {
  continuePlayingLocal()
  if (tournamentMode.value) syncTournamentState()
}

watch(
  () => tour.session.value.snapshot,
  (snapshot) => {
    if (snapshot) restoreSnapshot(snapshot)
  },
)

// On a finished leg, report the winner; advance to the next leg or end the match.
function reportLegAndContinue() {
  const ids = matchIds.value
  const winnerSeat = finishOrder.value[0]
  const bestOf = tour.assignment.value?.match.bestOf ?? 1
  if (!ids || (winnerSeat !== 0 && winnerSeat !== 1)) return

  tour.reportLegResult(legIndex.value, ids[winnerSeat])
  const tally: [number, number] = [...legsWon.value]
  tally[winnerSeat] += 1
  legsWon.value = tally

  const need = legsToWin(bestOf)
  if (tally[0] >= need || tally[1] >= need) {
    tournamentMode.value = false
    matchIds.value = null
    tour.clearAssignment()
    backToSetup()
  } else {
    legIndex.value += 1
    startLeg()
  }
}

const PLACE_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th']

function placeLabel(i: number): string {
  return PLACE_LABELS[i] ?? `${i + 1}th`
}

// Guard the reset: skip the prompt once the game is over (nothing left to lose).
const confirmingNewGame = ref(false)

function requestNewGame() {
  if (isGameOver.value) {
    backToSetup()
  } else {
    confirmingNewGame.value = true
  }
}

function confirmNewGame() {
  backToSetup()
  confirmingNewGame.value = false
}

const outModeLabel = computed(() =>
  options.value.outMode === 'double' ? 'double out' : 'single out',
)

const justFinishedName = computed(() =>
  bannerIndex.value === null ? '' : (players.value[bannerIndex.value]?.name ?? ''),
)
const justFinishedPlace = computed(() =>
  bannerIndex.value === null ? '' : placeLabel(finishOrder.value.indexOf(bannerIndex.value)),
)
</script>

<template>
  <template v-if="phase === 'setup'">
    <TournamentBar />
    <section v-if="awaitingTournamentMatch" class="tournament-waiting">
      <div class="waiting-mark">🎯</div>
      <h1>Board connected</h1>
      <p>This board is ready for its assigned tournament match.</p>
      <p class="waiting-sub">Choose a match and floor in the tournament console.</p>
    </section>
    <SetupScreen v-else @start="startGame" />
  </template>

  <div v-else class="game">
    <header class="topbar">
      <h1>🎯 {{ options.startScore }}</h1>
      <span class="subtitle">{{ options.startScore }} down · {{ outModeLabel }} · 3 darts</span>
      <button class="ghost-btn" @click="requestNewGame">New Game</button>
    </header>

    <section class="board-area">
      <PlayerBoard
        :players="players"
        :current-player-index="currentPlayerIndex"
        :current-throws="currentThrows"
        :finish-order="finishOrder"
        :game-over="isGameOver"
        :start-score="options.startScore"
      />
    </section>

    <section class="pad-area">
      <NumberPad
        :disabled="isGameOver || showBanner"
        :can-undo="canUndo"
        :checkout-routes="checkoutRoutes"
        @throw="handleThrow"
        @undo="undo"
      />
    </section>

    <!-- Result overlay: shown when a player finishes or the game ends -->
    <div v-if="showBanner" class="overlay">
      <div class="modal">
        <template v-if="isGameOver">
          <div class="modal-title">🏆 Game Over</div>
          <ol class="standings">
            <li v-for="(p, i) in standings" :key="p.name" :class="{ champ: i === 0 }">
              <span class="rank">{{ placeLabel(i) }}</span>
              <span class="who">{{ p.name }}</span>
              <span v-if="p.score > 0" class="pts">{{ p.score }} left</span>
            </li>
          </ol>
        </template>

        <template v-else>
          <div class="badge">{{ justFinishedPlace }} place</div>
          <div class="modal-title">🎯 {{ justFinishedName }} is out!</div>
          <p class="modal-sub">The others keep throwing for the next spot.</p>
        </template>

        <div class="modal-actions">
          <button v-if="!isGameOver" class="primary" @click="continuePlaying">
            Continue Playing
          </button>
          <button v-if="isGameOver && tournamentMode" class="primary" @click="reportLegAndContinue">
            Report result to server →
          </button>
          <button class="secondary" :disabled="!canUndo" @click="undo">↺ Undo last throw</button>
          <button class="secondary" @click="requestNewGame">New Game</button>
        </div>
      </div>
    </div>

    <!-- Confirm before discarding an in-progress game -->
    <div v-if="confirmingNewGame" class="overlay confirm-overlay">
      <div class="modal">
        <div class="modal-title">Start a new game?</div>
        <p class="modal-sub">The current match will be lost.</p>
        <div class="modal-actions">
          <button class="primary" @click="confirmNewGame">New Game</button>
          <button class="secondary" @click="confirmingNewGame = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 16px;
  position: relative;
}

.tournament-waiting {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 48px;
  text-align: center;
}

.waiting-mark {
  font-size: 92px;
}

.tournament-waiting h1 {
  font-size: 42px;
  color: #f1f5f9;
}

.tournament-waiting p {
  font-size: 24px;
  font-weight: 700;
  color: #cbd5e1;
}

.tournament-waiting .waiting-sub {
  color: #94a3b8;
  font-size: 20px;
}

.topbar {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

h1 {
  font-size: 40px;
  font-weight: 900;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #22d3ee, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.subtitle {
  font-size: 16px;
  font-weight: 600;
  color: #64748b;
}

.ghost-btn {
  margin-left: auto;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  background: transparent;
  color: #cbd5e1;
  font-size: 18px;
  font-weight: 700;
  padding: 14px 22px;
  min-height: 48px;
  cursor: pointer;
}

.ghost-btn:active {
  transform: scale(0.97);
}

.board-area {
  flex: 0 0 33%;
  min-height: 0;
}

.pad-area {
  flex: 1;
  min-height: 0;
}

/* Overlay */
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

/* Confirm dialog stacks above the result overlay on a mid-game finish. */
.confirm-overlay {
  z-index: 10;
}

.modal {
  width: 100%;
  background: linear-gradient(160deg, #1e293b, #0f172a);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 24px;
  padding: 36px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.8);
}

.badge {
  font-size: 18px;
  font-weight: 800;
  color: #0b1220;
  background: #facc15;
  padding: 6px 18px;
  border-radius: 999px;
}

.modal-title {
  font-size: 44px;
  font-weight: 900;
  text-align: center;
  color: #f8fafc;
}

.modal-sub {
  font-size: 20px;
  color: #94a3b8;
  text-align: center;
}

.standings {
  list-style: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.standings li {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(2, 6, 23, 0.5);
  border-radius: 14px;
  padding: 14px 18px;
  font-size: 26px;
  font-weight: 700;
}

.standings li.champ {
  background: rgba(250, 204, 21, 0.15);
  border: 1px solid rgba(250, 204, 21, 0.5);
}

.standings .rank {
  color: #facc15;
  font-weight: 900;
  min-width: 56px;
}

.standings .who {
  color: #f1f5f9;
}

.standings .pts {
  margin-left: auto;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin-top: 8px;
}

.modal-actions button {
  border: none;
  border-radius: 16px;
  font-weight: 800;
  cursor: pointer;
  padding: 18px;
  font-size: 24px;
}

.modal-actions button:active:not(:disabled) {
  transform: scale(0.98);
}

.primary {
  background: linear-gradient(180deg, #22d3ee, #0891b2);
  color: #04283b;
}

.secondary {
  background: rgba(148, 163, 184, 0.15);
  color: #e2e8f0;
}

.secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
