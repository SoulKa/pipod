<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useViewerQr } from '../viewerQr'
import ViewerQrModal from './ViewerQrModal.vue'

// The always-visible code in the corner of a big screen, so anyone in the room can scan
// it without someone at the laptop opening a dialog. Clicking enlarges it.
const props = defineProps<{ path: string }>()

const open = ref(false)
const { url, svg, load } = useViewerQr(() => props.path)

onMounted(load)
</script>

<template>
  <button
    type="button"
    class="qr-tile"
    title="QR-Code vergrößern"
    aria-label="QR-Code zur Live-Übersicht vergrößern"
    @click="open = true"
  >
    <!-- Generated locally by the qrcode library from our own URL, so v-html is safe. -->
    <span v-if="svg" class="qr-tile-code" v-html="svg"></span>
  </button>
  <ViewerQrModal v-if="open" :url="url" :svg="svg" @close="open = false" />
</template>

<style scoped>
.qr-tile {
  display: grid;
  flex: 0 0 auto;
  padding: var(--pd-space-1);
  border-color: var(--pd-border-strong);
  background: var(--pd-surface-sunken);
}

.qr-tile-code {
  width: 5rem;
  height: 5rem;
  border-radius: var(--pd-radius-sm);
  /* The code needs a light quiet zone to scan reliably on the dark theme. */
  background: #fff;
}

.qr-tile-code :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
</style>
