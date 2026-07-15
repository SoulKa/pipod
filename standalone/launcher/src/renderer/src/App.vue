<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { CatalogEntry, InstalledApp, NetworkState, UpdateProgress } from '../../shared/types'
import StorePanel from './components/StorePanel.vue'
import SettingsScreen from './components/SettingsScreen.vue'
import StatusBarWifi from './components/StatusBarWifi.vue'

// This same renderer is loaded twice: as the launcher home, and (role=overlay) as the tiny
// always-on-top Home button floating over a running app.
const isOverlay = new URLSearchParams(window.location.search).get('role') === 'overlay'
if (isOverlay) {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}

const installed = ref<InstalledApp[]>([])
const catalog = ref<CatalogEntry[]>([])
// Live wall clock for the home top bar (HH:MM), ticked every 10s.
const clock = ref(formatClock())
// Real network state, polled from the Electron main process (OS network interfaces).
const networkState = ref<NetworkState>({ online: true, wifi: true })
// Settings and Store are each their own full-screen "app" screen (like launching an app).
const view = ref<'home' | 'settings' | 'store'>('home')
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

async function quit(): Promise<void> {
  await window.launcher.quit()
}

function formatClock(): string {
  // Status-bar style: no leading zero on the hour (e.g. "8:30").
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

async function refreshNetwork(): Promise<void> {
  networkState.value = await window.launcher.getNetworkState()
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
  const clockTimer = setInterval(() => (clock.value = formatClock()), 10_000)
  disposers.push(() => clearInterval(clockTimer))

  // Poll Wi-Fi state on the same cadence; the browser online/offline events give instant feedback.
  void refreshNetwork()
  const netTimer = setInterval(() => void refreshNetwork(), 10_000)
  const onNetChange = (): void => void refreshNetwork()
  window.addEventListener('online', onNetChange)
  window.addEventListener('offline', onNetChange)
  disposers.push(() => clearInterval(netTimer))
  disposers.push(() => window.removeEventListener('online', onNetChange))
  disposers.push(() => window.removeEventListener('offline', onNetChange))

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

  <!-- Full-screen Settings "app" — covers the home, like a launched app. -->
  <SettingsScreen v-else-if="view === 'settings'" @home="view = 'home'" />

  <!-- Full-screen Store "app" — covers the home, like a launched app. -->
  <StorePanel
    v-else-if="view === 'store'"
    :catalog="catalog"
    :progress="progress"
    @install="install"
    @refresh="refresh"
    @home="view = 'home'"
  />

  <!-- Launcher home screen -->
  <div v-else class="home">
    <!-- Status bar: Wi-Fi left, time centered, battery + close right. -->
    <header class="status-bar">
      <div class="sb-left">
        <StatusBarWifi :state="networkState" />
      </div>

      <span class="sb-clock">{{ clock }}</span>

      <div class="sb-right">
        <!-- Cable-powered: always full and charging, so a green battery with a charging bolt. -->
        <span class="sb-power" title="Charging (AC power)">
          <svg class="sb-bolt" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 2v11h3v9l7-12h-4l4-8z" />
          </svg>
          <svg class="sb-battery" viewBox="0 0 24 12" aria-hidden="true">
            <rect x="0.5" y="0.5" width="20" height="11" rx="2.5" fill="none" stroke="currentColor" />
            <rect x="2" y="2" width="17" height="8" rx="1" fill="#34c759" />
            <rect x="22" y="4" width="2" height="4" rx="1" fill="currentColor" />
          </svg>
        </span>
        <button class="sb-quit" title="Close launcher" @click="quit">⏻</button>
      </div>
    </header>

    <div class="brand">piPod Touch</div>

    <main class="grid">
      <button
        v-for="app in installed"
        :key="app.id"
        class="tile"
        @click="launch(app.id, app.query)"
      >
        <img class="tile-icon" :src="`piapp://${app.id}/${app.icon}`" alt="" />
        <span class="tile-name">{{ app.name ?? nameOf(app.id) }}</span>
      </button>

      <!-- Built-in Store/Settings tiles: no piapp icon, so a glyph stands in. Settings always last. -->
      <button class="tile" @click="view = 'store'">
        <span class="tile-icon tile-icon--glyph">🛍️</span>
        <span class="tile-name">Store</span>
      </button>

      <button class="tile" @click="view = 'settings'">
        <span class="tile-icon tile-icon--glyph">⚙️</span>
        <span class="tile-name">Settings</span>
      </button>

      <p v-if="!installed.length" class="empty">No apps installed yet — open the Store.</p>
    </main>

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
  /*
   * Wallpaper: "Der perfekte Begleiter für Ihren aktiven Lebensstil: Apple iPod Touch mit
   * Retina Display." von Wallpapers.com —
   * https://de.wallpapers.com/wallpapers/ipod-touch-1242-x-2208-0fd08k3al9e42tac.html
   */
  background-image: url('./assets/wallpaper.webp');
  background-size: cover;
  background-position: center;
}

/* Status bar: thin translucent strip, Wi-Fi left / time centered / battery right. */
.status-bar {
  display: grid;
  /* equal side columns keep the time optically centered regardless of glyph widths */
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 40px;
  /* span the full top edge, escaping the home's 20px padding */
  margin: -20px -20px 0;
  padding: 0 16px;
  color: #f8fafc;
  background: rgba(0, 0, 0, 0.25);
}

.sb-left {
  display: flex;
  align-items: center;
  justify-self: start;
}

.sb-right {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: end;
}

.sb-power {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sb-bolt {
  width: 9px;
  height: 13px;
}

.sb-battery {
  width: 26px;
  height: 13px;
}

.sb-clock {
  /* the bold, centered clock */
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.sb-quit {
  display: flex;
  align-items: center;
  justify-content: center;
  /* keep a comfortable tap target even though the icon reads as a slim status glyph */
  width: 44px;
  height: 44px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  color: inherit;
  background: none;
  border: none;
}

.brand {
  align-self: center;
  text-align: center;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.grid {
  flex: 1;
  display: grid;
  /* Springboard-style: icon-sized cells, evenly spaced, more per row. */
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  grid-auto-rows: min-content;
  gap: 28px 12px;
  justify-items: center;
  align-content: start;
  overflow-y: auto;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0;
  /* No card chrome — the icon itself is the affordance. */
  background: none;
  border: none;
}

.tile-icon {
  width: 104px;
  height: 104px;
  border-radius: 24px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
}

/* Built-in tiles have no image asset: render a glyph on the same rounded-square canvas. */
.tile-icon--glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 52px;
  line-height: 1;
  background: var(--panel-2);
}

.tile-name {
  font-size: 15px;
  font-weight: 500;
  text-align: center;
  color: var(--text);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
