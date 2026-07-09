<script setup lang="ts">
import { computed } from 'vue'
import NumberPad from './components/NumberPad.vue'
import PlayerBoard from './components/PlayerBoard.vue'
import SetupScreen from './components/SetupScreen.vue'
import { useDartGame } from './game/useDartGame'

const {
  phase,
  players,
  currentPlayerIndex,
  currentThrows,
  finishOrder,
  bannerIndex,
  isGameOver,
  canUndo,
  showBanner,
  standings,
  throwDart,
  continuePlaying,
  undo,
  startGame,
  backToSetup,
} = useDartGame()

const PLACE_LABELS = ['1st', '2nd', '3rd', '4th']

const justFinishedName = computed(() =>
  bannerIndex.value === null ? '' : (players.value[bannerIndex.value]?.name ?? ''),
)
const justFinishedPlace = computed(() =>
  bannerIndex.value === null ? '' : (PLACE_LABELS[finishOrder.value.indexOf(bannerIndex.value)] ?? ''),
)
</script>

<template>
  <SetupScreen v-if="phase === 'setup'" @start="startGame" />

  <div v-else class="game">
    <header class="topbar">
      <h1>🎯 301</h1>
      <span class="subtitle">301 down · 3 darts</span>
      <button class="ghost-btn" @click="backToSetup">New Game</button>
    </header>

    <section class="board-area">
      <PlayerBoard
        :players="players"
        :current-player-index="currentPlayerIndex"
        :current-throws="currentThrows"
        :finish-order="finishOrder"
        :game-over="isGameOver"
      />
    </section>

    <section class="pad-area">
      <NumberPad
        :disabled="isGameOver || showBanner"
        :can-undo="canUndo"
        @throw="throwDart"
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
              <span class="rank">{{ PLACE_LABELS[i] }}</span>
              <span class="who">{{ p.name }}</span>
              <span class="pts">{{ p.score }}</span>
            </li>
          </ol>
        </template>

        <template v-else>
          <div class="badge">{{ justFinishedPlace }} place</div>
          <div class="modal-title">🎯 {{ justFinishedName }} is out!</div>
          <p class="modal-sub">The others keep throwing for the next spot.</p>
        </template>

        <div class="modal-actions">
          <button v-if="!isGameOver" class="primary" @click="continuePlaying">Continue Playing</button>
          <button class="secondary" :disabled="!canUndo" @click="undo">↺ Undo last throw</button>
          <button class="secondary" @click="backToSetup">New Game</button>
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
  font-size: 17px;
  font-weight: 700;
  padding: 9px 16px;
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
