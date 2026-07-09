<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { PLAYERS } from '../game/useDartGame'

const emit = defineEmits<{
  start: [names: string[]]
}>()

const ACCENTS = ['#22d3ee', '#a78bfa', '#f472b6', '#4ade80']
const PLACE_LABELS = ['1st', '2nd', '3rd', '4th']

// Who is opted in (all selected by default).
const selected = reactive<Record<string, boolean>>(
  Object.fromEntries(PLAYERS.map((name) => [name, true])),
)

// The starting order, built by tapping players ("bull out").
const order = ref<string[]>([])

const selectedNames = computed(() => PLAYERS.filter((n) => selected[n]))
// Selected players not yet placed in the order.
const remaining = computed(() => selectedNames.value.filter((n) => !order.value.includes(n)))

const canStart = computed(
  () => selectedNames.value.length >= 2 && order.value.length === selectedNames.value.length,
)

function accent(name: string): string {
  return ACCENTS[(PLAYERS as readonly string[]).indexOf(name) % ACCENTS.length]!
}

function toggle(name: string) {
  selected[name] = !selected[name]
  if (!selected[name]) {
    order.value = order.value.filter((n) => n !== name)
  }
}

function addToOrder(name: string) {
  if (!order.value.includes(name)) order.value.push(name)
}

function removeFromOrder(name: string) {
  order.value = order.value.filter((n) => n !== name)
}

function clearOrder() {
  order.value = []
}

// Convenience: fill the order using the listed order (skip bulling).
function useListedOrder() {
  order.value = [...selectedNames.value]
}

function start() {
  if (canStart.value) emit('start', [...order.value])
}
</script>

<template>
  <div class="setup">
    <header class="head">
      <h1>🎯 301</h1>
      <p class="tag">Set up the match</p>
    </header>

    <section class="panel">
      <h2>Who's playing?</h2>
      <div class="players">
        <label
          v-for="name in PLAYERS"
          :key="name"
          class="player"
          :class="{ on: selected[name] }"
          :style="{ '--accent': accent(name) }"
        >
          <input type="checkbox" :checked="selected[name]" @change="toggle(name)" />
          <span class="box"></span>
          <span class="pname">{{ name }}</span>
        </label>
      </div>
    </section>

    <section class="panel grow">
      <div class="panel-head">
        <h2>Bull out — order of play</h2>
        <button class="link" @click="useListedOrder">use listed order</button>
      </div>
      <p class="help">Bull at the board, then tap players in the order they'll throw.</p>

      <div class="order-list">
        <button
          v-for="(name, i) in order"
          :key="name"
          class="ordered"
          :style="{ '--accent': accent(name) }"
          @click="removeFromOrder(name)"
        >
          <span class="rank">{{ PLACE_LABELS[i] }}</span>
          <span class="oname">{{ name }}</span>
          <span class="remove">✕</span>
        </button>
        <p v-if="order.length === 0" class="empty">Tap a player below to make them go first…</p>
      </div>

      <div v-if="remaining.length" class="pool">
        <button
          v-for="name in remaining"
          :key="name"
          class="chip"
          :style="{ '--accent': accent(name) }"
          @click="addToOrder(name)"
        >
          {{ name }}
        </button>
      </div>

      <button v-if="order.length" class="link clear" @click="clearOrder">clear order</button>
    </section>

    <button class="start" :disabled="!canStart" @click="start">
      {{ selectedNames.length < 2 ? 'Select at least 2 players' : order.length < selectedNames.length ? 'Finish the order to start' : 'Start Game' }}
    </button>
  </div>
</template>

<style scoped>
.setup {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 28px 24px;
  gap: 20px;
}

.head h1 {
  font-size: 48px;
  font-weight: 900;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #22d3ee, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.tag {
  font-size: 20px;
  color: #64748b;
  font-weight: 600;
}

.panel {
  background: linear-gradient(160deg, #172033, #0e1524);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 20px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel.grow {
  flex: 1;
  min-height: 0;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

h2 {
  font-size: 24px;
  font-weight: 800;
  color: #f1f5f9;
}

.help {
  font-size: 17px;
  color: #94a3b8;
  margin-top: -6px;
}

/* Player checkboxes */
.players {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.player {
  --accent: #22d3ee;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 16px;
  background: rgba(2, 6, 23, 0.5);
  border: 2px solid rgba(148, 163, 184, 0.15);
  cursor: pointer;
  user-select: none;
}

.player.on {
  border-color: var(--accent);
}

.player input {
  display: none;
}

.box {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 2px solid rgba(148, 163, 184, 0.5);
  flex: none;
  position: relative;
}

.player.on .box {
  background: var(--accent);
  border-color: var(--accent);
}

.player.on .box::after {
  content: '✓';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #04283b;
  font-weight: 900;
  font-size: 20px;
}

.pname {
  font-size: 26px;
  font-weight: 700;
  color: #f1f5f9;
}

/* Order builder */
.order-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 60px;
}

.ordered {
  --accent: #22d3ee;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border-radius: 14px;
  border: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, #0b1220);
  color: #f1f5f9;
  font-size: 24px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

.ordered .rank {
  color: var(--accent);
  font-weight: 900;
  min-width: 52px;
}

.ordered .oname {
  flex: 1;
}

.ordered .remove {
  color: #94a3b8;
  font-size: 18px;
}

.empty {
  color: #64748b;
  font-size: 17px;
  font-style: italic;
  padding: 10px 4px;
}

.pool {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

.chip {
  --accent: #22d3ee;
  padding: 12px 22px;
  border-radius: 999px;
  border: 2px dashed var(--accent);
  background: transparent;
  color: #e2e8f0;
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
}

.chip:active {
  transform: scale(0.97);
}

.link {
  background: none;
  border: none;
  color: #38bdf8;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.link.clear {
  align-self: flex-start;
  color: #fb7185;
}

.start {
  border: none;
  border-radius: 18px;
  padding: 22px;
  font-size: 26px;
  font-weight: 900;
  cursor: pointer;
  background: linear-gradient(180deg, #22d3ee, #0891b2);
  color: #04283b;
}

.start:disabled {
  background: rgba(148, 163, 184, 0.15);
  color: #64748b;
  cursor: not-allowed;
}

.start:active:not(:disabled) {
  transform: scale(0.99);
}
</style>
