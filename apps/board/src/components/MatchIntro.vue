<script setup lang="ts">
import { computed } from 'vue'
import type { Match } from '@pipod/shared'

const props = defineProps<{
  names: [string, string]
  match: Pick<Match, 'bestOf' | 'startScore' | 'outMode'>
}>()

const emit = defineEmits<{ confirm: [] }>()

const details = computed(() => {
  const { bestOf, startScore, outMode } = props.match
  const legs = bestOf === 1 ? '1 Leg' : `Best of ${bestOf} Legs`
  const out = outMode === 'double' ? 'Double-Out' : 'Single-Out'
  return `${legs} · ${startScore} · ${out}`
})
</script>

<template>
  <section class="intro">
    <header>
      <p class="kicker">Nächstes Match</p>
      <p class="details">{{ details }}</p>
    </header>

    <div class="matchup">
      <div class="plate plate-a">{{ names[0] }}</div>
      <div class="vs">
        <span class="ring" />
        <span class="vs-text">VS</span>
      </div>
      <div class="plate plate-b">{{ names[1] }}</div>
    </div>

    <button class="game-on" @click="emit('confirm')">Game on!</button>
  </section>
</template>

<style scoped>
.intro {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 48px 32px 40px;
  overflow: hidden;
}

header {
  text-align: center;
}

.kicker {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: #22d3ee;
}

.details {
  margin-top: 10px;
  font-size: 22px;
  font-weight: 700;
  color: #94a3b8;
}

.matchup {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 28px;
}

.plate {
  --accent: #22d3ee;
  padding: 36px 28px;
  border-radius: 24px;
  border: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, #0b1220);
  color: #f8fafc;
  font-size: 52px;
  font-weight: 900;
  text-align: center;
  overflow-wrap: anywhere;
  box-shadow: 0 0 40px -12px var(--accent);
}

/* The two players walk on from opposite sides, then the VS lands between them. */
.plate-a {
  animation: walk-on-left 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.plate-b {
  --accent: #a78bfa;
  animation: walk-on-right 520ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms both;
}

.vs {
  position: relative;
  align-self: center;
  width: 128px;
  height: 128px;
  display: grid;
  place-items: center;
}

.vs-text {
  font-size: 56px;
  font-weight: 900;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #22d3ee, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: vs-land 420ms cubic-bezier(0.3, 1.6, 0.5, 1) 380ms both;
}

/* Dartboard-style rings pulsing out from behind the VS. */
.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid rgba(34, 211, 238, 0.5);
  box-shadow: inset 0 0 0 14px rgba(167, 139, 250, 0.12);
  animation: ring-pulse 1800ms ease-out 600ms infinite both;
}

/* Held back while the screen's tap guard is up, so it never looks tappable before it is. */
.game-on {
  min-height: 112px;
  border: none;
  border-radius: 24px;
  background: linear-gradient(180deg, #22d3ee, #0891b2);
  color: #04283b;
  font-size: 44px;
  font-weight: 900;
  letter-spacing: 1px;
  cursor: pointer;
  transition:
    opacity 300ms ease-out,
    transform 300ms ease-out;
}

[data-tap-guard] .game-on {
  opacity: 0;
  transform: translateY(32px);
}

.game-on:active {
  transform: scale(0.98);
}

@keyframes walk-on-left {
  from {
    opacity: 0;
    transform: translateX(-110%);
  }
}

@keyframes walk-on-right {
  from {
    opacity: 0;
    transform: translateX(110%);
  }
}

@keyframes vs-land {
  from {
    opacity: 0;
    transform: scale(2.4);
  }
}

@keyframes ring-pulse {
  from {
    opacity: 0.9;
    transform: scale(0.7);
  }
  to {
    opacity: 0;
    transform: scale(1.8);
  }
}
</style>
