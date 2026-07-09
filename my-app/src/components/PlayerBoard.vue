<script setup lang="ts">
import { THROWS_PER_TURN, type DartThrow, type Player } from '../game/useDartGame'

const props = defineProps<{
  players: Player[]
  currentPlayerIndex: number
  currentThrows: DartThrow[]
  winnerIndex: number | null
}>()

const slots = Array.from({ length: THROWS_PER_TURN }, (_, i) => i)

function throwLabel(t: DartThrow): string {
  const prefix = t.multiplier === 2 ? 'D' : t.multiplier === 3 ? 'T' : ''
  return `${prefix}${t.base}`
}
</script>

<template>
  <div class="board">
    <div
      v-for="(player, index) in props.players"
      :key="player.name"
      class="card"
      :class="{
        active: index === props.currentPlayerIndex && props.winnerIndex === null,
        winner: index === props.winnerIndex,
      }"
    >
      <div class="name">{{ player.name }}</div>
      <div class="score">{{ player.score }}</div>

      <div v-if="index === props.currentPlayerIndex && props.winnerIndex === null" class="throws">
        <span
          v-for="slot in slots"
          :key="slot"
          class="slot"
          :class="{ filled: props.currentThrows[slot] }"
        >
          {{ props.currentThrows[slot] ? throwLabel(props.currentThrows[slot]) : '' }}
        </span>
      </div>

      <div v-else-if="index === props.winnerIndex" class="crown">🏆 Winner</div>
    </div>
  </div>
</template>

<style scoped>
.board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 12px;
  height: 100%;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 16px;
  background: #1e293b;
  border: 3px solid transparent;
  color: #e2e8f0;
  padding: 12px;
}

.card.active {
  border-color: #22d3ee;
  background: #0f2b33;
  box-shadow: 0 0 24px rgba(34, 211, 238, 0.35);
}

.card.winner {
  border-color: #facc15;
  background: #3b2f0a;
}

.name {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.score {
  font-size: 72px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.throws {
  display: flex;
  gap: 8px;
}

.slot {
  min-width: 46px;
  height: 40px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #0b1220;
  border: 2px dashed #334155;
  font-size: 20px;
  font-weight: 700;
  color: #94a3b8;
}

.slot.filled {
  border-style: solid;
  border-color: #22d3ee;
  color: #e2e8f0;
}

.crown {
  font-size: 24px;
  font-weight: 700;
  color: #facc15;
}
</style>
