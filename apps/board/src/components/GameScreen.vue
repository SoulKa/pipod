<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { pickClip } from '../effects/celebrationClips'
import FireworksCanvas from './FireworksCanvas.vue'
import LemonBurst from './LemonBurst.vue'
import NumberPad from './NumberPad.vue'
import PlayerBoard from './PlayerBoard.vue'
import WowPopup from './WowPopup.vue'
import type { DartThrow, GameOptions, Multiplier, Player } from '../game/useDartGame'
import type { CheckoutRoute } from '../game/checkout'

const props = withDefaults(
  defineProps<{
    options: GameOptions
    players: Player[]
    currentPlayerIndex: number
    currentThrows: DartThrow[]
    finishOrder: number[]
    isGameOver: boolean
    showBanner: boolean
    canUndo: boolean
    checkoutRoutes: CheckoutRoute[]
    standings: Player[]
    bannerIndex: number | null
    // Running tally of 5+1+20 turns; each increment fires the lemon gag.
    lemonTurns?: number
    // Running tally of T20s and bulls; each increment plays a celebration clip.
    bigDarts?: number
    allowNewGame?: boolean
  }>(),
  { allowNewGame: true, lemonTurns: 0, bigDarts: 0 },
)

const emit = defineEmits<{
  throw: [base: number, multiplier: Multiplier]
  undo: []
  continue: []
  'new-game': []
}>()

const PLACE_LABELS = ['1.', '2.', '3.', '4.', '5.', '6.']

function placeLabel(i: number): string {
  return PLACE_LABELS[i] ?? `${i + 1}.`
}

const outModeLabel = computed(() =>
  props.options.outMode === 'double' ? 'Double-Out' : 'Single-Out',
)

const justFinishedName = computed(() =>
  props.bannerIndex === null ? '' : (props.players[props.bannerIndex]?.name ?? ''),
)
const justFinishedPlace = computed(() =>
  props.bannerIndex === null ? '' : placeLabel(props.finishOrder.indexOf(props.bannerIndex)),
)

// Guard the reset: skip the prompt once the game is over (nothing left to lose).
const confirmingNewGame = ref(false)

function requestNewGame() {
  if (props.isGameOver) {
    emit('new-game')
  } else {
    confirmingNewGame.value = true
  }
}

function confirmNewGame() {
  confirmingNewGame.value = false
  emit('new-game')
}

// The in-play celebrations are non-blocking: they play over the live board and clear
// themselves, so the turn carries on underneath rather than waiting for a tap like the
// win overlay does. `choose` runs per occurrence, so what is shown — and for how long —
// can differ each time.
function revealsOnTick<T>(tally: () => number, choose: () => { shown: T; durationMs: number }) {
  const current = shallowRef<T | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(tally, (count, previous) => {
    if (count <= previous) return
    const { shown, durationMs } = choose()
    current.value = shown
    clearTimeout(timer)
    timer = setTimeout(() => (current.value = null), durationMs)
  })

  onBeforeUnmount(() => clearTimeout(timer))
  return current
}

// Long enough for LemonBurst's 3s of launches plus the last rocket's climb and fade.
const showLemons = revealsOnTick(
  () => props.lemonTurns,
  () => ({ shown: true, durationMs: 5600 }),
)

// Each big dart draws a clip at random, and each clip sets its own time on screen.
const wowClip = revealsOnTick(
  () => props.bigDarts,
  () => {
    const clip = pickClip()
    return { shown: clip, durationMs: clip.durationMs }
  },
)
</script>

<template>
  <div class="game">
    <header class="topbar">
      <h1>🎯 {{ options.startScore }}</h1>
      <span class="subtitle">{{ options.startScore }} down · {{ outModeLabel }} · 3 Darts</span>
      <button v-if="allowNewGame" class="ghost-btn" @click="requestNewGame">Neues Spiel</button>
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
        @throw="(base, multiplier) => emit('throw', base, multiplier)"
        @undo="emit('undo')"
      />
    </section>

    <!-- Lemon gag. Keyed so a second 5+1+20 restarts it rather than joining the first
         burst mid-flight. Sits before the overlays in DOM order, so a lemon that also
         finishes the leg still renders under the result card. -->
    <LemonBurst v-if="showLemons" :key="lemonTurns" />

    <!-- Keyed so a second big dart replays from the first frame, even if it draws the
         same clip again. -->
    <WowPopup v-if="wowClip" :key="bigDarts" :clip="wowClip" />

    <!-- Result overlay: shown when a player finishes or the game ends. The celebration
         runs for as long as the overlay is up, i.e. until a button is pressed. -->
    <div v-if="showBanner" class="overlay">
      <FireworksCanvas class="fireworks" />
      <div class="modal">
        <template v-if="isGameOver">
          <div class="modal-title">🏆 Spiel vorbei</div>
          <ol class="standings">
            <li v-for="(p, i) in standings" :key="p.name" :class="{ champ: i === 0 }">
              <span class="rank">{{ placeLabel(i) }}</span>
              <span class="who">{{ p.name }}</span>
              <span v-if="p.score > 0" class="pts">{{ p.score }} übrig</span>
            </li>
          </ol>
        </template>

        <template v-else>
          <div class="badge">{{ justFinishedPlace }} Platz</div>
          <div class="modal-title">🎯 {{ justFinishedName }} ist draußen!</div>
          <p class="modal-sub">Die anderen werfen weiter um den nächsten Platz.</p>
        </template>

        <div class="modal-actions">
          <button v-if="!isGameOver" class="primary" @click="emit('continue')">
            Weiterspielen
          </button>
          <slot name="result-actions" />
          <button class="secondary" :disabled="!canUndo" @click="emit('undo')">
            ↺︎ Letzten Wurf rückgängig
          </button>
          <button v-if="allowNewGame" class="secondary" @click="requestNewGame">Neues Spiel</button>
        </div>
      </div>
    </div>

    <!-- Confirm before discarding an in-progress game -->
    <div v-if="confirmingNewGame" class="overlay confirm-overlay">
      <div class="modal">
        <div class="modal-title">Neues Spiel starten?</div>
        <p class="modal-sub">Das aktuelle Match geht verloren.</p>
        <div class="modal-actions">
          <button class="primary" @click="confirmNewGame">Neues Spiel</button>
          <button class="secondary" @click="confirmingNewGame = false">Abbrechen</button>
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

/* Above the dimmed backdrop so the bursts stay vivid, below the card so the
   standings and buttons stay readable. */
.fireworks {
  z-index: 0;
}

.modal {
  position: relative;
  z-index: 1;
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

/* Buttons injected via the result-actions slot render in the parent scope, so
   mirror the modal-action styling onto slotted content. */
.modal-actions :slotted(button) {
  border: none;
  border-radius: 16px;
  font-weight: 800;
  cursor: pointer;
  padding: 18px;
  font-size: 24px;
}

.modal-actions :slotted(button:active:not(:disabled)) {
  transform: scale(0.98);
}

.modal-actions :slotted(.primary) {
  background: linear-gradient(180deg, #22d3ee, #0891b2);
  color: #04283b;
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
