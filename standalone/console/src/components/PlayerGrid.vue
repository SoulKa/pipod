<script setup lang="ts">
import type { Participant } from '@pipod/shared'
import PlayerTag from './PlayerTag.vue'

defineProps<{ participants: Participant[] }>()
</script>

<template>
  <ul class="player-grid">
    <li v-for="p in participants" :key="p.id">
      <PlayerTag :id="p.id" :size="36" />
    </li>
  </ul>
</template>

<style scoped>
.player-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr));
  gap: var(--pd-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.player-grid li {
  display: flex;
  min-width: 0;
  min-height: 3rem;
  border: 1px solid var(--pd-border);
  border-radius: var(--pd-radius-sm);
  background: var(--pd-surface-sunken);
}

/* The whole tile is the tap target, not just the name. */
.player-grid .tag {
  flex: 1;
  padding: var(--pd-space-1) var(--pd-space-2);
}
</style>
