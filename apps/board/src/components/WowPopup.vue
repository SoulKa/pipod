<script setup lang="ts">
import type { CelebrationClip } from '../effects/celebrationClips'

defineProps<{ clip: CelebrationClip }>()
</script>

<template>
  <img class="wow" :src="clip.src" alt="" aria-hidden="true" />
</template>

<style scoped>
.wow {
  position: absolute;
  /* Sits in the band above the number pad, which starts around 47vh once the padding,
     topbar and 33%-tall board area are accounted for. Sized by height so both a wide
     clip and a near-square one stay inside that band. */
  top: 8vh;
  height: 32vh;
  width: auto;
  max-width: 60vw;
  left: 50%;
  /* Above the result overlay (auto) and the confirm dialog (10). */
  z-index: 20;
  border-radius: 20px;
  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.9);
  /* The turn carries on underneath — taps must reach the number pad. */
  pointer-events: none;
  animation: wow-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: translateX(-50%);
}

@keyframes wow-pop {
  from {
    transform: translateX(-50%) scale(0.4);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}
</style>
