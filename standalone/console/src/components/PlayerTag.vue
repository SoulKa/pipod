<script setup lang="ts">
import { computed } from 'vue'
import { PlayerAvatar } from '@pipod/ui'
import { useParticipants } from '../participants'

// A player's avatar and name in the viewer. Tapping it opens their profile, where anyone
// can set the picture — that is how players find their way there.
const props = withDefaults(
  defineProps<{
    /** Null for a seat nobody holds yet. */
    id: string | null
    size?: number
  }>(),
  { size: 24 },
)

const { participant: lookup } = useParticipants()
const participant = computed(() => lookup(props.id))
</script>

<template>
  <RouterLink
    v-if="participant"
    class="tag"
    :to="{
      name: 'player',
      params: { id: participant.tournamentId, participantId: participant.id },
    }"
  >
    <PlayerAvatar :participant="participant" :size="size" />
    <span class="name">{{ participant.name }}</span>
  </RouterLink>
  <span v-else class="tag">—</span>
</template>

<style scoped>
.tag {
  display: inline-flex;
  max-width: 100%;
  min-width: 0;
  align-items: center;
  gap: var(--pd-space-2);
  color: inherit;
  text-decoration: none;
  vertical-align: middle;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
