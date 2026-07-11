<script setup lang="ts">
import LocalBoard from './components/LocalBoard.vue'
import TournamentBoard from './components/TournamentBoard.vue'
import { resolveMode } from './appMode'

// The query param is fixed per page load, so the mode is resolved once here.
const mode = resolveMode()

if (mode === 'tournament') document.title = 'Tournament Board'
</script>

<template>
  <TournamentBoard v-if="mode === 'tournament'" />
  <LocalBoard v-else />
</template>
