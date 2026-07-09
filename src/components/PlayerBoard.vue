<script setup lang="ts">
import { computed } from 'vue'
import { THROWS_PER_TURN, type DartThrow, type Player } from '../game/useDartGame'

const props = defineProps<{
  players: Player[]
  currentPlayerIndex: number
  currentThrows: DartThrow[]
  finishOrder: number[]
  gameOver: boolean
  startScore: number
}>()

// One accent colour per player, keyed by index.
const ACCENTS = ['#22d3ee', '#a78bfa', '#f472b6', '#4ade80', '#fbbf24', '#fb7185']
const PLACE_LABELS = ['1st', '2nd', '3rd', '4th']

const slots = Array.from({ length: THROWS_PER_TURN }, (_, i) => i)

function accent(index: number): string {
  return ACCENTS[index % ACCENTS.length]!
}

function placeOf(index: number): number {
  return props.finishOrder.indexOf(index) // -1 if not finished
}

function isActive(index: number): boolean {
  return index === props.currentPlayerIndex && placeOf(index) === -1 && !props.gameOver
}

function throwLabel(t: DartThrow): string {
  const prefix = t.multiplier === 2 ? 'D' : t.multiplier === 3 ? 'T' : ''
  return `${prefix}${t.base}`
}

// A card shows a "live" turn only while the active player is mid-throw.
function isLive(index: number): boolean {
  return isActive(index) && props.currentThrows.length > 0
}

// Darts to show on a card: the live turn while throwing, otherwise the
// player's most recently completed turn (persists until they throw again).
function throwsFor(index: number): DartThrow[] {
  return isLive(index) ? props.currentThrows : (props.players[index]?.lastThrows ?? [])
}

function sumOf(throws: DartThrow[]): number {
  return throws.reduce((total, t) => total + t.points, 0)
}

// Adapt the grid to the roster size: stack when 2 players, 2 columns otherwise.
const gridStyle = computed(() => ({
  gridTemplateColumns: props.players.length <= 2 ? '1fr' : '1fr 1fr',
}))
</script>

<template>
  <div class="board" :style="gridStyle">
    <div
      v-for="(player, index) in props.players"
      :key="player.name"
      class="card"
      :class="{ active: isActive(index), finished: placeOf(index) !== -1 }"
      :style="{ '--accent': accent(index) }"
    >
      <div class="top">
        <span class="name">{{ player.name }}</span>
        <span v-if="placeOf(index) !== -1" class="place">{{ PLACE_LABELS[placeOf(index)] }}</span>
        <span v-else-if="isActive(index)" class="turn-tag">throwing</span>
      </div>

      <div class="score" :class="{ done: player.score === 0 }">{{ player.score }}</div>

      <div class="progress">
        <div
          class="progress-fill"
          :style="{ width: (100 * (props.startScore - player.score)) / props.startScore + '%' }"
        ></div>
      </div>

      <div class="throws" :class="{ dim: !isLive(index) }">
        <span
          v-for="slot in slots"
          :key="slot"
          class="pip"
          :class="{ filled: throwsFor(index)[slot], empty: !throwsFor(index)[slot] }"
        >
          {{ throwsFor(index)[slot] ? throwLabel(throwsFor(index)[slot]!) : '' }}
        </span>
        <span v-if="throwsFor(index).length" class="turn-total">= {{ sumOf(throwsFor(index)) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board {
  display: grid;
  grid-auto-rows: 1fr;
  gap: 14px;
  height: 100%;
}

.card {
  --accent: #22d3ee;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  border-radius: 20px;
  background: linear-gradient(160deg, #172033, #0e1524);
  border: 2px solid rgba(148, 163, 184, 0.12);
  padding: 14px 18px;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

/* accent stripe down the left edge */
.card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  background: var(--accent);
  opacity: 0.5;
}

.card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent), 0 0 30px -6px var(--accent);
  transform: translateY(-2px);
}

.card.active::before {
  opacity: 1;
}

.card.finished {
  opacity: 0.7;
  background: linear-gradient(160deg, #1a1430, #12101f);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.name {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: #f1f5f9;
}

.turn-tag {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  padding: 3px 10px;
  border-radius: 999px;
}

.place {
  font-size: 15px;
  font-weight: 800;
  color: #0b1220;
  background: #facc15;
  padding: 3px 12px;
  border-radius: 999px;
}

.score {
  font-size: 60px;
  font-weight: 900;
  line-height: 1;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.score.done {
  color: #4ade80;
}

.progress {
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.15);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.25s ease;
}

.throws {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pip {
  min-width: 44px;
  height: 36px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(2, 6, 23, 0.55);
  border: 2px dashed rgba(148, 163, 184, 0.3);
  font-size: 18px;
  font-weight: 800;
  color: #64748b;
}

.pip.filled {
  border-style: solid;
  border-color: var(--accent);
  color: #f1f5f9;
}

/* On inactive cards, don't draw placeholder slots — only real darts. */
.throws.dim .pip.empty {
  border-color: transparent;
  background: transparent;
}

.throws.dim .pip.filled {
  border-color: rgba(148, 163, 184, 0.4);
  color: #cbd5e1;
}

.turn-total {
  margin-left: auto;
  font-size: 18px;
  font-weight: 800;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
</style>
