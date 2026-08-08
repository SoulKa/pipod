<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createFireworks, stepFireworks } from '../effects/fireworks'

const LEMON = '🍋'
/** How long rockets keep going up. After this the stragglers just fall and fade. */
const LAUNCH_WINDOW_MS = 3000
/** Glyphs cost far more to draw than the streaks of the win fireworks — stay modest. */
const LEMONS_PER_BURST = 12
const MAX_DPR = 1.5

const canvas = ref<HTMLCanvasElement | null>(null)
// Primed so the first lemon goes up the instant the third dart lands.
const state = createFireworks({ primed: true, sparksPerBurst: LEMONS_PER_BURST })

let ctx: CanvasRenderingContext2D | null = null
let frame = 0
let lastTime = 0
let elapsed = 0
let width = 0
let height = 0

function render(time: number) {
  const context = ctx
  if (!context) return
  const dt = lastTime ? time - lastTime : 16
  lastTime = time
  elapsed += dt

  // Passing a zero size once the window closes stops new launches while everything
  // already in the air carries on falling.
  const launching = elapsed < LAUNCH_WINDOW_MS
  stepFireworks(state, dt, launching ? width : 0, launching ? height : 0)

  context.clearRect(0, 0, width, height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.globalAlpha = 1

  // A lemon rides the rocket up, then bursts into a shower of them.
  context.font = '26px serif'
  for (const rocket of state.rockets) context.fillText(LEMON, rocket.x, rocket.y)

  for (const lemon of state.sparks) {
    context.globalAlpha = Math.min(1, lemon.life * 1.6)
    context.font = `${Math.round(22 + lemon.maxLife * 10)}px serif`
    context.fillText(LEMON, lemon.x, lemon.y)
  }
  context.globalAlpha = 1

  // Nothing left to draw and nothing more coming — let the loop die rather than burn
  // frames on an empty canvas.
  if (!launching && state.rockets.length === 0 && state.sparks.length === 0) return
  frame = requestAnimationFrame(render)
}

onMounted(() => {
  const el = canvas.value
  // happy-dom (and any canvas-less environment) returns null; render nothing.
  ctx = el?.getContext('2d') ?? null
  if (!el || !ctx) return

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  width = el.clientWidth
  height = el.clientHeight
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  frame = requestAnimationFrame(render)
})

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" />
</template>

<style scoped>
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* The turn carries on underneath — taps must reach the number pad. */
  pointer-events: none;
}
</style>
