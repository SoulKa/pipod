<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createFireworks, stepFireworks } from '../effects/fireworks'

// Retina sharpness is not worth the fill cost on the Pi's GPU, so cap the backing store.
const MAX_DPR = 1.5

const canvas = ref<HTMLCanvasElement | null>(null)
const state = createFireworks()

let ctx: CanvasRenderingContext2D | null = null
let frame = 0
let lastTime = 0
let width = 0
let height = 0

function resize() {
  const el = canvas.value
  if (!el) return
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  width = el.clientWidth
  height = el.clientHeight
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** Rockets and sparks alike are drawn as short streaks from where they were to where they are. */
function drawTrail(
  context: CanvasRenderingContext2D,
  p: { px: number; py: number; x: number; y: number },
  alpha: number,
  lineWidth: number,
) {
  context.globalAlpha = alpha
  context.lineWidth = lineWidth
  context.beginPath()
  context.moveTo(p.px, p.py)
  context.lineTo(p.x, p.y)
  context.stroke()
}

function render(time: number) {
  const context = ctx
  if (!context) return
  const dt = lastTime ? time - lastTime : 16
  lastTime = time

  stepFireworks(state, dt, width, height)

  context.clearRect(0, 0, width, height)
  context.lineCap = 'round'

  for (const rocket of state.rockets) {
    context.strokeStyle = rocket.color
    drawTrail(context, rocket, 0.9, 3)
  }

  for (const spark of state.sparks) {
    context.strokeStyle = spark.color
    // Fade out over the tail of the life so bursts dissolve instead of blinking off.
    drawTrail(context, spark, Math.min(1, spark.life * 1.6), 2.5)
  }

  context.globalAlpha = 1
  frame = requestAnimationFrame(render)
}

onMounted(() => {
  // happy-dom (and any canvas-less environment) returns null here; render nothing rather
  // than starting a loop that can never paint.
  ctx = canvas.value?.getContext('2d') ?? null
  if (!ctx) return
  resize()
  window.addEventListener('resize', resize)
  frame = requestAnimationFrame(render)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', resize)
})
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
  pointer-events: none;
}
</style>
