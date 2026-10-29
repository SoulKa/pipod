<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  avatarHue,
  avatarInitials,
  avatarKey,
  avatarPhotoUrl,
  type SeatPlayer,
} from '@pipod/shared'

// A player's picture: their photo, their emoji, or their initials on a hue of their own.
// The one renderer every screen uses, so the fallback looks the same everywhere.
const props = withDefaults(
  defineProps<{
    participant: SeatPlayer
    /** Diameter in px. */
    size?: number
    /** Server origin photos load from; empty for a page served by the server itself. */
    origin?: string
  }>(),
  { size: 28, origin: '' },
)

// A photo that fails to load (deleted a moment ago, flaky Wi-Fi) falls back to initials
// until the picture itself changes — not on every refetch of the same one.
const broken = ref(false)
watch(
  () => avatarKey(props.participant.avatar),
  () => (broken.value = false),
)

const avatar = computed(() => props.participant.avatar)
const photoUrl = computed(() => {
  if (avatar.value?.kind !== 'photo' || broken.value) return null
  return avatarPhotoUrl(props.origin, props.participant.id, avatar.value.version)
})
const style = computed(() => ({
  '--size': `${props.size}px`,
  '--hue': avatarHue(props.participant.id),
}))
</script>

<template>
  <span class="avatar" :style="style" aria-hidden="true">
    <img v-if="photoUrl" :src="photoUrl" alt="" loading="lazy" @error="broken = true" />
    <span v-else-if="avatar?.kind === 'emoji'" class="emoji">{{ avatar.emoji }}</span>
    <span v-else class="initials">{{ avatarInitials(participant.name) }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: var(--size);
  height: var(--size);
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: hsl(var(--hue) 45% 22%);
  box-shadow: inset 0 0 0 1px hsl(var(--hue) 60% 55% / 0.45);
  user-select: none;
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.emoji {
  font-size: calc(var(--size) * 0.62);
  line-height: 1;
}

.initials {
  color: hsl(var(--hue) 80% 82%);
  font-size: calc(var(--size) * 0.4);
  font-weight: 800;
  letter-spacing: 0.02em;
}
</style>
