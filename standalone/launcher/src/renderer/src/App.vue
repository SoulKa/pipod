<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { CatalogEntry, InstalledApp, UpdateProgress } from '../../shared/types'
import StorePanel from './components/StorePanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'

// This same renderer is loaded twice: as the launcher home, and (role=overlay) as the tiny
// always-on-top Home button floating over a running app.
const isOverlay = new URLSearchParams(window.location.search).get('role') === 'overlay'
if (isOverlay) {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}

const installed = ref<InstalledApp[]>([])
const catalog = ref<CatalogEntry[]>([])
const overlay = ref<'none' | 'store' | 'settings'>('none')
const progress = ref<Record<string, UpdateProgress>>({})
const toasts = ref<{ id: number; text: string }[]>([])

let toastSeq = 0
const disposers: Array<() => void> = []

function nameOf(id: string): string {
  return catalog.value.find((c) => c.id === id)?.name ?? id
}

function toast(text: string): void {
  const id = ++toastSeq
  toasts.value.push({ id, text })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 4000)
}

async function refresh(): Promise<void> {
  installed.value = await window.launcher.listInstalled()
  catalog.value = await window.launcher.checkForUpdates()
}

async function launch(id: string, query?: string): Promise<void> {
  await window.launcher.launchApp(id, query)
}

async function goHome(): Promise<void> {
  await window.launcher.goHome()
}

async function install(id: string): Promise<void> {
  try {
    await window.launcher.installOrUpdate(id)
    toast(`${nameOf(id)} updated`)
  } catch (err) {
    toast(`Update failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await refresh()
  }
}

onMounted(async () => {
  if (isOverlay) return
  disposers.push(
    window.launcher.onProgress((p) => {
      progress.value = { ...progress.value, [p.id]: p }
      if (p.phase === 'done' || p.phase === 'error') void refresh()
    })
  )
  disposers.push(
    window.launcher.onAutoUpdated((ids) => {
      toast(`Updated ${ids.map(nameOf).join(', ')}`)
      void refresh()
    })
  )
  await refresh()
})

onUnmounted(() => disposers.forEach((d) => d()))
</script>

<template>
  <!-- Overlay role: a small Home notch tab hanging from the top edge, filling its overlay view. -->
  <button v-if="isOverlay" class="home-notch" title="Home" @click="goHome">⌂</button>

  <!-- Launcher home screen -->
  <div v-else class="home">
    <header class="home-header">
      <div class="brand">🎯 pi-darts</div>
      <div class="tools">
        <button @click="refresh">Refresh</button>
        <button @click="overlay = 'store'">Store</button>
        <button @click="overlay = 'settings'">Settings</button>
      </div>
    </header>

    <main class="grid">
      <button
        v-for="app in installed"
        :key="app.id"
        class="tile"
        @click="launch(app.id, app.query)"
      >
        <img class="tile-icon" :src="`piapp://${app.id}/${app.icon}`" alt="" />
        <span class="tile-name">{{ app.name ?? nameOf(app.id) }}</span>
        <span class="tile-version">v{{ app.version }}</span>
      </button>
      <p v-if="!installed.length" class="empty">No apps installed yet — open the Store.</p>
    </main>

    <StorePanel
      v-if="overlay === 'store'"
      :catalog="catalog"
      :progress="progress"
      @install="install"
      @refresh="refresh"
      @close="overlay = 'none'"
    />
    <SettingsPanel v-if="overlay === 'settings'" @close="overlay = 'none'" />

    <div class="toasts">
      <div v-for="t in toasts" :key="t.id" class="toast">{{ t.text }}</div>
    </div>
  </div>
</template>

<style scoped>
.home-notch {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  /* tab hanging from the top edge: only the bottom corners are rounded */
  border-radius: 0 0 16px 16px;
  font-size: 18px;
  line-height: 1;
  color: #062c33;
  background: var(--accent);
  border: none;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
  opacity: 0.85;
}

.home {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 20px;
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.tools {
  display: flex;
  gap: 10px;
}

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: 140px;
  gap: 16px;
  align-content: start;
  overflow-y: auto;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 6px;
  padding: 16px;
  background: linear-gradient(160deg, var(--panel-2), var(--panel));
  border: 1px solid var(--border);
  border-radius: 16px;
  text-align: left;
}

.tile-icon {
  width: 56px;
  height: 56px;
  object-fit: contain;
  /* Sit at the top of the tile; the name/version stay pinned to the bottom. */
  margin-bottom: auto;
}

.tile-name {
  font-size: 18px;
  font-weight: 600;
}

.tile-version {
  font-size: 13px;
  color: var(--muted);
}

.empty {
  color: var(--muted);
}

.toasts {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.toast {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 16px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
</style>
