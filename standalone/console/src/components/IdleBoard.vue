<script setup lang="ts">
// "Nothing to show yet" for the spectator screens: a dart keeps landing on a board so a
// wall display visibly stays alive. Losing the live feed stops the throw and greys the
// board, so a dropped connection never looks like a quiet moment between matches.
defineProps<{
  connected: boolean
  /** What the screen is waiting for. */
  title: string
}>()

const SEGMENTS = 20
const STEP = (2 * Math.PI) / SEGMENTS

/** Ring bands as on a real board, by radius (outer double = 100). */
const BANDS = [
  { inner: 16, outer: 52, kind: 'single' },
  { inner: 52, outer: 60, kind: 'ring' },
  { inner: 60, outer: 90, kind: 'single' },
  { inner: 90, outer: 100, kind: 'ring' },
] as const

function point(radius: number, angle: number): string {
  return `${(radius * Math.sin(angle)).toFixed(2)} ${(-radius * Math.cos(angle)).toFixed(2)}`
}

function sector(inner: number, outer: number, from: number, to: number): string {
  return [
    `M ${point(inner, from)}`,
    `L ${point(outer, from)}`,
    `A ${outer} ${outer} 0 0 1 ${point(outer, to)}`,
    `L ${point(inner, to)}`,
    `A ${inner} ${inner} 0 0 0 ${point(inner, from)}`,
    'Z',
  ].join(' ')
}

// Static geometry, so it is built once per module rather than per render.
const segments = BANDS.flatMap((band) =>
  Array.from({ length: SEGMENTS }, (_, i) => {
    const from = i * STEP - STEP / 2
    return {
      d: sector(band.inner, band.outer, from, from + STEP),
      tone: `${band.kind}-${i % 2}`,
    }
  }),
)
</script>

<template>
  <div :class="connected ? 'idle' : 'idle idle--offline'">
    <svg class="idle-art" viewBox="-120 -120 240 240" aria-hidden="true">
      <circle class="rim" r="112" />
      <path v-for="(segment, i) in segments" :key="i" :d="segment.d" :class="segment.tone" />
      <circle class="ring-0" r="16" />
      <circle class="ring-1" r="6.5" />
      <circle class="impact" r="8" />
      <g class="dart">
        <g class="dart-body">
          <line class="dart-tip" x1="0" y1="0" x2="16" y2="-10" />
          <line class="dart-barrel" x1="14" y1="-9" x2="44" y2="-28" />
          <line class="dart-shaft" x1="44" y1="-28" x2="62" y2="-39" />
          <path class="dart-flight" d="M 58 -37 L 84 -66 L 80 -40 L 92 -30 L 62 -39 Z" />
        </g>
      </g>
    </svg>
    <div class="idle-text" role="status">
      <p class="idle-title">{{ title }}</p>
      <p class="idle-connection">
        <span class="idle-dot"></span>
        {{
          connected
            ? 'Verbunden — die Anzeige aktualisiert sich von selbst'
            : 'Verbindung getrennt — verbinde neu…'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.idle {
  display: grid;
  justify-items: center;
  gap: var(--pd-space-4);
  padding: var(--pd-space-5) var(--pd-space-4);
  text-align: center;
}

.idle-art {
  width: min(13rem, 55vw);
  height: auto;
  overflow: visible;
  transition:
    filter 0.4s ease,
    opacity 0.4s ease;
}

.rim {
  fill: var(--pd-surface-sunken);
  stroke: var(--pd-border-strong);
  stroke-width: 2;
}

.single-0 {
  fill: var(--pd-surface-raised);
}

.single-1 {
  fill: var(--pd-bg-subtle);
}

.ring-0 {
  fill: var(--pd-accent);
}

.ring-1 {
  fill: var(--pd-danger);
}

.single-0,
.single-1,
.ring-0,
.ring-1 {
  stroke: var(--pd-surface-sunken);
  stroke-width: 0.6;
}

.impact {
  fill: none;
  stroke: var(--pd-accent);
  stroke-width: 2;
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: impact 2.8s ease-out infinite;
}

.dart {
  animation: throw 2.8s cubic-bezier(0.3, 0.7, 0.4, 1) infinite;
}

/* Wobbles around the tip, the way a dart settles after it sticks. */
.dart-body {
  transform-origin: 0 0;
  animation: settle 2.8s ease-out infinite;
}

.dart-tip {
  stroke: var(--pd-text-soft);
  stroke-width: 2;
  stroke-linecap: round;
}

.dart-barrel {
  stroke: var(--pd-text);
  stroke-width: 6;
  stroke-linecap: round;
}

.dart-shaft {
  stroke: var(--pd-text-muted);
  stroke-width: 3;
}

.dart-flight {
  fill: var(--pd-accent);
  stroke: var(--pd-accent-strong);
  stroke-width: 1;
  stroke-linejoin: round;
}

@keyframes throw {
  0% {
    opacity: 0;
    transform: translate(150px, -120px) scale(1.3);
  }
  10% {
    opacity: 1;
  }
  28%,
  78% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  92%,
  100% {
    opacity: 0;
    transform: translate(0, 0) scale(1);
  }
}

@keyframes settle {
  0%,
  28% {
    transform: rotate(0deg);
  }
  33% {
    transform: rotate(-6deg);
  }
  38% {
    transform: rotate(4deg);
  }
  43% {
    transform: rotate(-2deg);
  }
  48%,
  100% {
    transform: rotate(0deg);
  }
}

@keyframes impact {
  0%,
  27% {
    opacity: 0;
    transform: scale(0.6);
  }
  30% {
    opacity: 0.9;
  }
  55%,
  100% {
    opacity: 0;
    transform: scale(4.5);
  }
}

.idle-text {
  display: grid;
  gap: var(--pd-space-2);
}

.idle-title {
  margin: 0;
  color: var(--pd-text-soft);
  font-size: 1.15rem;
  font-weight: 750;
}

.idle-connection {
  display: inline-flex;
  margin: 0;
  align-items: center;
  justify-content: center;
  gap: var(--pd-space-2);
  color: var(--pd-text-muted);
  font-size: 0.85rem;
}

.idle-dot {
  width: var(--pd-space-2);
  height: var(--pd-space-2);
  border-radius: var(--pd-radius-lg);
  background: var(--pd-success);
}

/* Offline: the throw freezes mid-flight and the board fades, unlike a calm wait. */
.idle--offline .idle-art {
  filter: grayscale(1);
  opacity: 0.45;
}

.idle--offline .dart,
.idle--offline .dart-body,
.idle--offline .impact {
  animation-play-state: paused;
}

.idle--offline .idle-connection {
  color: var(--pd-danger);
}

.idle--offline .idle-dot {
  background: var(--pd-danger);
  animation: blink 1.2s steps(2, start) infinite;
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}

/* Without motion the dart simply sits in the bull; the connection line still tells. */
@media (prefers-reduced-motion: reduce) {
  .dart,
  .dart-body,
  .impact,
  .idle--offline .idle-dot {
    animation: none;
  }
}
</style>
