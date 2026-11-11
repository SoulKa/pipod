<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { MAX_PHOTO_ZOOM, centeredCrop, drawCrop, panCrop, zoomCrop, type PhotoCrop } from '../photo'

const props = defineProps<{ photo: ImageBitmap }>()
const emit = defineEmits<{ confirm: [crop: PhotoCrop]; cancel: [] }>()

// Backing pixels of the preview: sharp on retina phones at its ~20rem CSS width.
const PREVIEW_SIZE = 640

const canvas = ref<HTMLCanvasElement | null>(null)
const crop = shallowRef<PhotoCrop>(centeredCrop(props.photo))

function draw(): void {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE)
  drawCrop(ctx, props.photo, crop.value, PREVIEW_SIZE)
}

onMounted(draw)
watch(crop, draw)

const zoom = computed({
  get: () => crop.value.zoom,
  set: (value: number) => (crop.value = zoomCrop(crop.value, props.photo, value)),
})

// Up to two fingers: one drags, two also pinch. Extra fingers are ignored.
const pointers = new Map<number, { x: number; y: number }>()
let pinch: { distance: number; zoom: number } | null = null

function fingerDistance(): number {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

function startPinch(): void {
  pinch = pointers.size === 2 ? { distance: fingerDistance(), zoom: crop.value.zoom } : null
}

function onPointerDown(event: PointerEvent): void {
  if (pointers.size >= 2) return
  canvas.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  startPinch()
}

function onPointerMove(event: PointerEvent): void {
  const last = pointers.get(event.pointerId)
  if (!last || !canvas.value) return
  const next = { x: event.clientX, y: event.clientY }
  pointers.set(event.pointerId, next)
  // With two fingers down the midpoint moves half as far as the finger that moved.
  const share = pointers.size === 2 ? 0.5 : 1
  const viewport = canvas.value.getBoundingClientRect().width
  let moved = panCrop(
    crop.value,
    props.photo,
    (next.x - last.x) * share,
    (next.y - last.y) * share,
    viewport,
  )
  if (pinch && pinch.distance > 0) {
    moved = zoomCrop(moved, props.photo, (pinch.zoom * fingerDistance()) / pinch.distance)
  }
  crop.value = moved
}

function onPointerUp(event: PointerEvent): void {
  if (!pointers.delete(event.pointerId)) return
  startPinch()
}

function onWheel(event: WheelEvent): void {
  zoom.value = crop.value.zoom * Math.exp(-event.deltaY * 0.002)
}
</script>

<template>
  <Teleport to="body">
    <div class="pd-overlay">
      <div class="pd-modal cropper" role="dialog" aria-modal="true" aria-label="Ausschnitt wählen">
        <h2>Ausschnitt wählen</h2>
        <div class="frame">
          <canvas
            ref="canvas"
            :width="PREVIEW_SIZE"
            :height="PREVIEW_SIZE"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @wheel.prevent="onWheel"
          ></canvas>
          <div class="mask" aria-hidden="true"></div>
        </div>
        <p class="pd-muted">Verschieben, mit zwei Fingern zoomen.</p>
        <input
          v-model.number="zoom"
          class="zoom"
          type="range"
          min="1"
          :max="MAX_PHOTO_ZOOM"
          step="0.01"
          aria-label="Zoom"
        />
        <div class="modal-actions">
          <button type="button" class="cancel" @click="emit('cancel')">Abbrechen</button>
          <button type="button" class="confirm" @click="emit('confirm', crop)">Übernehmen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cropper {
  display: grid;
  justify-items: center;
  gap: var(--pd-space-3);
  text-align: center;
}

.frame {
  position: relative;
  overflow: hidden;
  width: min(72vw, 20rem);
  aspect-ratio: 1;
  border-radius: var(--pd-radius);
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  /* The page must not scroll or zoom while the photo is dragged or pinched. */
  touch-action: none;
}

/* Dims the corners the round avatar cuts off. */
.mask {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 100vmax rgba(2, 6, 23, 0.6);
  outline: 2px solid var(--pd-accent);
  pointer-events: none;
}

.zoom {
  width: min(72vw, 20rem);
  min-height: 2.75rem;
  accent-color: var(--pd-accent);
}

.modal-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  gap: var(--pd-space-2);
}

.modal-actions button {
  min-height: 3rem;
}

.confirm {
  border-color: var(--pd-accent);
  background: var(--pd-accent);
  color: var(--pd-accent-contrast);
  font-weight: 750;
}
</style>
