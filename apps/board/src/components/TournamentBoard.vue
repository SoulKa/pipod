<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import GameScreen from './GameScreen.vue'
import TournamentBar from './TournamentBar.vue'
import { useDartGame, type Multiplier } from '../game/useDartGame'
import { useTournamentClient } from '../game/tournamentClient'

const {
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

const tour = useTournamentClient()
const tournamentMode = ref(false)
const legIndex = ref(0)
// Server participant ids for the two seats, indexed like `players`.
const matchIds = ref<[string, string] | null>(null)
const legsWon = ref<[number, number]>([0, 0])
// True while a leg report is in flight, so the button can't be tapped twice.
const reporting = ref(false)
// Why the last report was refused. Scoped to the report so an older connection
// message can never masquerade as a failed result.
const reportError = ref('')

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
      nameById.get(m.participantAId ?? '') ?? 'Spieler A',
      nameById.get(m.participantBId ?? '') ?? 'Spieler B',
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
// The local tally only moves once the server has acknowledged the leg, so a rejected
// report leaves the board on the result screen and the button available for a retry.
async function reportLegAndContinue() {
  const ids = matchIds.value
  const winnerSeat = finishOrder.value[0]
  const match = tour.assignment.value?.match
  if (!ids || !match || (winnerSeat !== 0 && winnerSeat !== 1) || reporting.value) return

  const reportedLeg = legIndex.value
  const tally: [number, number] = [...legsWon.value]
  tally[winnerSeat] += 1

  reporting.value = true
  reportError.value = ''
  const result = await tour.reportLegResult(reportedLeg, ids[winnerSeat])
  reporting.value = false
  if (!result.ok) {
    reportError.value = `${result.message} Bitte erneut senden.`
    return
  }
  // Completing a match frees the floor, so the server can assign the next one while we
  // wait for the ack. From that point the assignment watcher owns the board state.
  if (tour.assignment.value?.match.id !== match.id) return

  legsWon.value = tally

  const need = legsToWin(match.bestOf)
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
</script>

<template>
  <template v-if="!tournamentMode">
    <TournamentBar />
    <section v-if="awaitingTournamentMatch" class="tournament-waiting">
      <div class="waiting-mark">🎯</div>
      <h1>Board verbunden</h1>
      <p>Dieses Board ist bereit für sein zugewiesenes Turniermatch.</p>
      <p class="waiting-sub">Match und Feld in der Turnier-Konsole auswählen.</p>
    </section>
  </template>

  <GameScreen
    v-else
    :options="options"
    :players="players"
    :current-player-index="currentPlayerIndex"
    :current-throws="currentThrows"
    :finish-order="finishOrder"
    :is-game-over="isGameOver"
    :show-banner="showBanner"
    :can-undo="canUndo"
    :checkout-routes="checkoutRoutes"
    :standings="standings"
    :banner-index="bannerIndex"
    :allow-new-game="false"
    @throw="handleThrow"
    @undo="undo"
    @continue="continuePlaying"
  >
    <template #result-actions>
      <button v-if="isGameOver" class="primary" :disabled="reporting" @click="reportLegAndContinue">
        {{ reporting ? 'Wird gesendet…' : 'Ergebnis an Server melden →︎' }}
      </button>
      <p v-if="isGameOver && reportError" class="report-error">{{ reportError }}</p>
    </template>
  </GameScreen>
</template>

<style scoped>
.report-error {
  max-width: 520px;
  color: #f87171;
  font-size: 20px;
  font-weight: 700;
  text-align: center;
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
</style>
