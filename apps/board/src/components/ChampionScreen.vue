<script setup lang="ts">
import type { SeatPlayer } from '@pipod/shared'
import { PlayerAvatar } from '@pipod/ui'
import FireworksCanvas from './FireworksCanvas.vue'

defineProps<{
  /** Null for a tournament without a knockout final, which has no single winner. */
  champion: SeatPlayer | null
  /** Server origin the champion's photo is fetched from. */
  serverUrl: string
}>()

const emit = defineEmits<{ done: [] }>()
</script>

<template>
  <section class="champion">
    <FireworksCanvas class="fireworks" />
    <div class="stage">
      <p class="kicker">Turnier beendet</p>
      <template v-if="champion">
        <div class="trophy">🏆</div>
        <PlayerAvatar
          class="champion-avatar"
          :participant="champion"
          :origin="serverUrl"
          :size="200"
        />
        <h1 class="name">{{ champion.name }}</h1>
        <p class="title">Turniersieger</p>
      </template>
      <template v-else>
        <div class="trophy">🎯</div>
        <h1 class="name">Danke fürs Mitspielen!</h1>
        <p class="title">Die Tabelle zeigt die Platzierungen.</p>
      </template>
    </div>
    <button class="done" @click="emit('done')">Zur Turnierauswahl</button>
  </section>
</template>

<style scoped>
.champion {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 48px 32px 40px;
  overflow: hidden;
}

.fireworks {
  z-index: 0;
}

.stage {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  text-align: center;
}

.kicker {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: #22d3ee;
}

.trophy {
  font-size: 96px;
  animation: drop-in 520ms cubic-bezier(0.3, 1.6, 0.5, 1) both;
}

.champion-avatar {
  border: 5px solid #facc15;
  box-shadow: 0 0 60px -10px #facc15;
  animation: drop-in 520ms cubic-bezier(0.3, 1.6, 0.5, 1) 160ms both;
}

.name {
  font-size: 60px;
  font-weight: 900;
  color: #f8fafc;
  overflow-wrap: anywhere;
}

.title {
  font-size: 26px;
  font-weight: 800;
  color: #facc15;
}

.done {
  position: relative;
  z-index: 1;
  min-height: 96px;
  border: none;
  border-radius: 24px;
  background: #334155;
  color: #f1f5f9;
  font-size: 32px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 300ms ease-out;
}

/* Held back while the screen's tap guard is up, so it never looks tappable before it is. */
[data-tap-guard] .done {
  opacity: 0;
}

@keyframes drop-in {
  from {
    opacity: 0;
    transform: scale(2.2);
  }
}
</style>
