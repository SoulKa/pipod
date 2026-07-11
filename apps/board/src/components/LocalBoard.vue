<script setup lang="ts">
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
    @throw="throwDart"
    @undo="undo"
    @continue="continuePlaying"
    @new-game="backToSetup"
  />
</template>
