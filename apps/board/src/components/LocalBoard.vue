<script setup lang="ts">
import { vTapGuard } from '@pipod/ui'
import GameScreen from './GameScreen.vue'
import SetupScreen from './SetupScreen.vue'
import { useDartGame } from '../game/useDartGame'

const {
  phase,
  options,
  players,
  currentPlayerIndex,
  currentThrows,
  finishOrder,
  bannerIndex,
  lemonTurns,
  bigDarts,
  checkoutRoutes,
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
</script>

<template>
  <!-- Keyed per phase and tap-guarded each time it mounts: a bounce of the tap that brought a
       screen up ("Start", "Neues Spiel", the launcher tile) must not land on it. -->
  <div :key="phase" v-tap-guard class="screen">
    <SetupScreen v-if="phase === 'setup'" @start="startGame" />

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
      :lemon-turns="lemonTurns"
      :big-darts="bigDarts"
      @throw="throwDart"
      @undo="undo"
      @continue="continuePlaying"
      @new-game="backToSetup"
    />
  </div>
</template>

<style scoped>
.screen {
  height: 100%;
}
</style>
