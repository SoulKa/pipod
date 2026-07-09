<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEFAULT_OPTIONS, PLAYERS, START_SCORES, type OutMode } from '../game/useDartGame'
import VirtualKeyboard from './VirtualKeyboard.vue'

const emit = defineEmits<{
  start: [config: { names: string[]; startScore: number; outMode: OutMode }]
}>()

// Game options, opened via the gear button.
const startScore = ref<number>(DEFAULT_OPTIONS.startScore)
const outMode = ref<OutMode>(DEFAULT_OPTIONS.outMode)
const showOptions = ref(false)

const outModeLabel = computed(() => (outMode.value === 'double' ? 'Double out' : 'Single out'))

const ACCENTS = ['#22d3ee', '#a78bfa', '#f472b6', '#4ade80', '#fbbf24', '#fb7185']
const PLACE_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th']

interface RosterPlayer {
  id: number
  name: string
  selected: boolean
}

let uid = 0
// Seed with the previous defaults; the roster is now fully editable.
const roster = ref<RosterPlayer[]>(PLAYERS.map((name) => ({ id: uid++, name, selected: true })))
// Starting order ("bull out"), stored by id so renaming keeps the order intact.
const order = ref<number[]>([])

// Which player's name is being typed on the on-screen keyboard (no HW keyboard on the Pi).
const editingId = ref<number | null>(null)
const editingPlayer = computed(() => roster.value.find((p) => p.id === editingId.value) ?? null)

function editName(p: RosterPlayer) {
  editingId.value = p.id
}

function setEditingName(value: string) {
  if (editingPlayer.value) {
    editingPlayer.value.name = value
    onName(editingPlayer.value)
  }
}

function closeKeyboard() {
  editingId.value = null
}

const selectedPlayers = computed(() => roster.value.filter((p) => p.selected))
// Selected players that also have a non-empty name.
const validPlayers = computed(() => selectedPlayers.value.filter((p) => p.name.trim() !== ''))
const remaining = computed(() => validPlayers.value.filter((p) => !order.value.includes(p.id)))

const canStart = computed(
  () =>
    validPlayers.value.length >= 2 &&
    validPlayers.value.length === selectedPlayers.value.length &&
    order.value.length === validPlayers.value.length,
)

const startLabel = computed(() => {
  if (validPlayers.value.length !== selectedPlayers.value.length) return 'Name every player'
  if (validPlayers.value.length < 2) return 'Add at least 2 players'
  if (order.value.length < validPlayers.value.length) return 'Finish the order to start'
  return 'Start Game'
})

function accent(id: number): string {
  const i = roster.value.findIndex((p) => p.id === id)
  return ACCENTS[i % ACCENTS.length]!
}

function placeLabel(i: number): string {
  return PLACE_LABELS[i] ?? `${i + 1}th`
}

function nameOf(id: number): string {
  return roster.value.find((p) => p.id === id)?.name ?? ''
}

function addPlayer() {
  const id = uid++
  roster.value.push({ id, name: '', selected: true })
  editingId.value = id // open the keyboard to type the new name straight away
}

function removePlayer(id: number) {
  roster.value = roster.value.filter((p) => p.id !== id)
  order.value = order.value.filter((n) => n !== id)
  if (editingId.value === id) editingId.value = null
}

function toggle(p: RosterPlayer) {
  p.selected = !p.selected
  if (!p.selected) order.value = order.value.filter((n) => n !== p.id)
}

// Drop a player from the order if they become invalid while typing.
function onName(p: RosterPlayer) {
  if (p.name.trim() === '') order.value = order.value.filter((n) => n !== p.id)
}

function addToOrder(id: number) {
  if (!order.value.includes(id)) order.value.push(id)
}

function removeFromOrder(id: number) {
  order.value = order.value.filter((n) => n !== id)
}

function useListedOrder() {
  order.value = validPlayers.value.map((p) => p.id)
}

function start() {
  if (canStart.value) {
    emit('start', {
      names: order.value.map(nameOf),
      startScore: startScore.value,
      outMode: outMode.value,
    })
  }
}
</script>

<template>
  <div class="setup">
    <header class="head">
      <div class="head-row">
        <h1>🎯 {{ startScore }}</h1>
        <button class="gear" aria-label="Game options" @click="showOptions = true">⚙️</button>
      </div>
      <p class="tag">Set up the match · {{ startScore }} · {{ outModeLabel }}</p>
    </header>

    <section class="panel">
      <h2>Players</h2>

      <div class="players">
        <div
          v-for="p in roster"
          :key="p.id"
          class="player"
          :class="{ on: p.selected, editing: editingId === p.id }"
          :style="{ '--accent': accent(p.id) }"
        >
          <button class="box" :class="{ ticked: p.selected }" @click="toggle(p)"></button>
          <button class="name-field" :class="{ empty: !p.name }" @click="editName(p)">
            {{ p.name || 'Tap to name…' }}
          </button>
          <button class="del" :disabled="roster.length <= 1" @click="removePlayer(p.id)">✕</button>
        </div>
      </div>

      <button class="add-btn" @click="addPlayer">＋ Add player</button>
    </section>

    <section class="panel grow">
      <div class="panel-head">
        <h2>Bull out — order of play</h2>
        <button class="link" @click="useListedOrder">use listed order</button>
      </div>
      <p class="help">Bull at the board, then tap players in the order they'll throw.</p>

      <div class="order-list">
        <button
          v-for="(id, i) in order"
          :key="id"
          class="ordered"
          :style="{ '--accent': accent(id) }"
          @click="removeFromOrder(id)"
        >
          <span class="rank">{{ placeLabel(i) }}</span>
          <span class="oname">{{ nameOf(id) }}</span>
          <span class="remove">✕</span>
        </button>
        <p v-if="order.length === 0" class="empty">Tap a player below to make them go first…</p>
      </div>

      <div v-if="remaining.length" class="pool">
        <button
          v-for="p in remaining"
          :key="p.id"
          class="chip"
          :style="{ '--accent': accent(p.id) }"
          @click="addToOrder(p.id)"
        >
          {{ p.name }}
        </button>
      </div>

    </section>

    <button class="start" :disabled="!canStart" @click="start">{{ startLabel }}</button>
  </div>

  <Teleport to="#app">
    <VirtualKeyboard
      v-if="editingPlayer"
      :model-value="editingPlayer.name"
      :maxlength="12"
      label="Player name"
      @update:model-value="setEditingName"
      @close="closeKeyboard"
    />

    <div v-if="showOptions" class="options-overlay" @click.self="showOptions = false">
      <div class="options-modal">
        <div class="options-title">Game options</div>

        <div class="option">
          <span class="option-label">Start score</span>
          <div class="segmented">
            <button
              v-for="s in START_SCORES"
              :key="s"
              class="seg"
              :class="{ active: startScore === s }"
              @click="startScore = s"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <div class="option">
          <span class="option-label">Out mode</span>
          <div class="segmented">
            <button class="seg" :class="{ active: outMode === 'single' }" @click="outMode = 'single'">
              Single out
            </button>
            <button class="seg" :class="{ active: outMode === 'double' }" @click="outMode = 'double'">
              Double out
            </button>
          </div>
        </div>

        <button class="options-done" @click="showOptions = false">Done</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.setup {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 28px 24px;
  gap: 18px;
  overflow-y: auto;
}

.head-row {
  display: flex;
  align-items: center;
  gap: 14px;
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

.gear {
  margin-left: auto;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(2, 6, 23, 0.5);
  font-size: 28px;
  cursor: pointer;
  line-height: 1;
}

.gear:active {
  transform: scale(0.96);
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

/* Editable player rows */
.players {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.player {
  --accent: #22d3ee;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 16px;
  background: rgba(2, 6, 23, 0.5);
  border: 2px solid rgba(148, 163, 184, 0.15);
}

.player.on {
  border-color: var(--accent);
}

.player.editing {
  box-shadow: 0 0 0 2px var(--accent);
}

.box {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 2px solid rgba(148, 163, 184, 0.5);
  background: transparent;
  flex: none;
  cursor: pointer;
  position: relative;
}

.box.ticked {
  background: var(--accent);
  border-color: var(--accent);
}

.box.ticked::after {
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

.name-field {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 2px solid rgba(148, 163, 184, 0.25);
  color: #f1f5f9;
  font-size: 26px;
  font-weight: 700;
  padding: 6px 2px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player.editing .name-field {
  border-bottom-color: var(--accent);
}

.name-field.empty {
  color: #475569;
  font-weight: 600;
}

.del {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: rgba(148, 163, 184, 0.12);
  color: #fb7185;
  font-size: 20px;
  font-weight: 800;
  cursor: pointer;
}

.del:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.add-btn {
  width: 100%;
  padding: 20px;
  border-radius: 16px;
  border: 2px dashed rgba(56, 189, 248, 0.6);
  background: rgba(56, 189, 248, 0.08);
  color: #38bdf8;
  font-size: 24px;
  font-weight: 800;
  cursor: pointer;
}

.add-btn:active {
  transform: scale(0.99);
  background: rgba(56, 189, 248, 0.16);
}

/* Order builder */
.order-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 60px;
  overflow-y: auto;
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
  flex: none;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
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

/* Game-options overlay */
.options-overlay {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.85);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  z-index: 20;
}

.options-modal {
  width: 100%;
  background: linear-gradient(160deg, #1e293b, #0f172a);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 24px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.8);
}

.options-title {
  font-size: 32px;
  font-weight: 900;
  color: #f8fafc;
  text-align: center;
}

.option {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-label {
  font-size: 20px;
  font-weight: 700;
  color: #94a3b8;
}

.segmented {
  display: flex;
  gap: 10px;
}

.seg {
  flex: 1;
  padding: 18px;
  border-radius: 16px;
  border: 2px solid rgba(148, 163, 184, 0.25);
  background: rgba(2, 6, 23, 0.5);
  color: #cbd5e1;
  font-size: 24px;
  font-weight: 800;
  cursor: pointer;
}

.seg.active {
  border-color: #22d3ee;
  background: color-mix(in srgb, #22d3ee 16%, #0b1220);
  color: #f1f5f9;
}

.seg:active {
  transform: scale(0.98);
}

.options-done {
  border: none;
  border-radius: 16px;
  padding: 20px;
  font-size: 24px;
  font-weight: 900;
  cursor: pointer;
  background: linear-gradient(180deg, #22d3ee, #0891b2);
  color: #04283b;
}

.options-done:active {
  transform: scale(0.99);
}
</style>
