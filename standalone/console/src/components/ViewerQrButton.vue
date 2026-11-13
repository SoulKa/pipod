<script setup lang="ts">
import { ref } from 'vue'
import { useViewerQr } from '../viewerQr'
import ViewerQrModal from './ViewerQrModal.vue'

/** Viewer route the code links to, e.g. `/` or `/view/<id>`. */
const props = defineProps<{ path: string }>()

const open = ref(false)
const { url, svg, load } = useViewerQr(() => props.path)

function show(): void {
  open.value = true
  void load()
}
</script>

<template>
  <button type="button" class="qr-button" title="QR-Code zur Live-Übersicht" @click="show">
    QR-Code
  </button>
  <ViewerQrModal v-if="open" :url="url" :svg="svg" @close="open = false" />
</template>

<style scoped>
.qr-button {
  min-height: 2.75rem;
}
</style>
