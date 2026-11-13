<script setup lang="ts">
import type { Standing } from '@pipod/shared'
import PlayerTag from './PlayerTag.vue'

defineProps<{ standings: Standing[] }>()
</script>

<template>
  <div class="standings-table-wrap">
    <table>
      <thead>
        <tr>
          <th>Spieler</th>
          <th>Sp</th>
          <th>S</th>
          <th>+/-</th>
          <th>Pkt</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in standings" :key="s.participantId">
          <td><PlayerTag :id="s.participantId" /></td>
          <td>{{ s.played }}</td>
          <td>{{ s.wins }}</td>
          <td>{{ s.legDiff }}</td>
          <td class="points">{{ s.points }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.standings-table-wrap {
  overflow-x: auto;
}

.points {
  color: var(--pd-accent);
  font-weight: 800;
}
</style>
