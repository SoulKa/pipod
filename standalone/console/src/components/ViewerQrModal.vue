<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{ url: string; svg: string }>()
const emit = defineEmits<{ close: [] }>()

// Opened from a laptop driving a TV, Escape is the quickest way back to the overview.
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="pd-overlay" @click.self="emit('close')">
      <div class="pd-modal qr-modal" role="dialog" aria-modal="true">
        <h2>Live-Übersicht öffnen</h2>
        <p class="pd-muted">Scannen, um das Turnier auf dem Handy zu verfolgen.</p>
        <!-- Generated locally by the qrcode library from our own URL, so v-html is safe. -->
        <div v-if="svg" class="qr-code" v-html="svg"></div>
        <a v-if="url" class="qr-url" :href="url" target="_blank">{{ url }}</a>
        <div class="modal-actions">
          <button type="button" @click="emit('close')">Schließen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qr-modal {
  display: grid;
  justify-items: center;
  gap: var(--pd-space-3);
  text-align: center;
}

.qr-code {
  width: min(70vw, 55vh, 24rem);
  border-radius: var(--pd-radius-sm);
  /* The code needs a light quiet zone to scan reliably on the dark theme. */
  background: #fff;
}

.qr-code :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

.qr-url {
  color: var(--pd-accent);
  font-family: ui-monospace, monospace;
  word-break: break-all;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}
</style>
