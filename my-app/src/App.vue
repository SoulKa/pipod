<script setup lang="ts">
import { computed } from 'vue'
import NumberPad from './components/NumberPad.vue'
import PlayerBoard from './components/PlayerBoard.vue'
import { useDartGame } from './game/useDartGame'

const {
  players,
  currentPlayerIndex,
  currentThrows,
  winnerIndex,
  isGameOver,
  canUndo,
  throwDart,
  undo,
  reset,
} = useDartGame()

const winnerName = computed(() =>
  winnerIndex.value === null ? '' : (players.value[winnerIndex.value]?.name ?? ''),
)
</script>

<template>
  <div class="game">
    <header class="topbar">
      <h1>301</h1>
      <button class="new-game" @click="reset">New Game</button>
    </header>

    <section class="board-area">
      <PlayerBoard
        :players="players"
        :current-player-index="currentPlayerIndex"
        :current-throws="currentThrows"
        :winner-index="winnerIndex"
      />
    </section>

    <section class="pad-area">
      <NumberPad :disabled="isGameOver" :can-undo="canUndo" @throw="throwDart" @undo="undo" />
    </section>

    <div v-if="isGameOver" class="banner">
      <div class="banner-inner">
        <div class="banner-title">🏆 {{ winnerName }} wins!</div>
        <button class="new-game big" @click="reset">New Game</button>
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
  padding: 16px;
  gap: 14px;
  position: relative;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h1 {
  font-size: 40px;
  font-weight: 900;
  letter-spacing: 4px;
  color: #22d3ee;
}

.new-game {
  border: none;
  border-radius: 12px;
  background: #334155;
  color: #e2e8f0;
  font-size: 20px;
  font-weight: 700;
  padding: 10px 18px;
  cursor: pointer;
}

.board-area {
  flex: 0 0 44%;
  min-height: 0;
}

.pad-area {
  flex: 1;
  min-height: 0;
}

.banner {
  position: absolute;
  inset: 0;
  background: rgba(2, 6, 23, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
}

.banner-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}

.banner-title {
  font-size: 52px;
  font-weight: 900;
  color: #facc15;
  text-align: center;
}

.new-game.big {
  background: #22d3ee;
  color: #04283b;
  font-size: 30px;
  padding: 18px 40px;
  border-radius: 16px;
}
</style>
