<script setup lang="ts">
import { ref } from 'vue'
import QRCode from 'qrcode'
import { api } from '../api'

/** Viewer route the code links to, e.g. `/` or `/view/<id>`. */
const props = defineProps<{ path: string }>()

const open = ref(false)
const url = ref('')
const svg = ref('')

/**
 * The console is often opened on `localhost`, which a phone can't reach — so prefer the
 * server's LAN address and only fall back to whatever origin this page was loaded from.
 */
async function show(): Promise<void> {
  open.value = true
  const info = await api.getInfo().catch(() => ({ publicOrigin: null }))
  url.value = `${info.publicOrigin ?? window.location.origin}${props.path}`
  svg.value = await QRCode.toString(url.value, { type: 'svg', margin: 2 })
}
</script>

<template>
  <button type="button" class="qr-button" title="QR-Code zur Live-Übersicht" @click="show">
    QR-Code
  </button>
  <Teleport to="body">
    <div v-if="open" class="pd-overlay" @click.self="open = false">
      <div class="pd-modal qr-modal" role="dialog" aria-modal="true">
        <h2>Live-Übersicht öffnen</h2>
        <p class="pd-muted">Scannen, um das Turnier auf dem Handy zu verfolgen.</p>
        <!-- Generated locally by the qrcode library from our own URL, so v-html is safe. -->
        <div v-if="svg" class="qr-code" v-html="svg"></div>
        <a v-if="url" class="qr-url" :href="url" target="_blank">{{ url }}</a>
        <div class="modal-actions">
          <button type="button" @click="open = false">Schließen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qr-button {
  min-height: 2.75rem;
}

.qr-modal {
  display: grid;
  justify-items: center;
  gap: var(--pd-space-3);
  text-align: center;
}

.qr-code {
  width: min(70vw, 20rem);
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
