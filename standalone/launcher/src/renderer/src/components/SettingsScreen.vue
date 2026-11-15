<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { canStartLauncherUpdate } from '@shared/launcherUpdate'
import { MIN_BRIGHTNESS_PERCENT } from '@shared/constants'
import type { BacklightState, LauncherSettings, LauncherUpdate } from '@shared/types'

const props = defineProps<{ launcherUpdate: LauncherUpdate }>()
defineEmits<{ home: [] }>()

const updateStatus = computed(() => {
  const u = props.launcherUpdate
  switch (u.status) {
    case 'unsupported':
      return 'Updates itself only when installed as an AppImage'
    case 'idle':
      return 'Up to date'
    case 'available':
      return `v${u.version} available`
    case 'downloading':
      return `Downloading v${u.version} — ${Math.round(u.percent)}%, then restarting`
    case 'error':
      return `Update failed: ${u.message}`
  }
  // Unreachable while the switch is exhaustive; satisfies vue/return-in-computed-property.
  return u satisfies never
})

function updateLauncher(): void {
  void window.launcher.downloadLauncherUpdate()
}

const settings = ref<LauncherSettings>({ autoUpdateOnLaunch: true })
const saved = ref(false)

// Brightness bypasses Save: the change is visible immediately, so it's applied while dragging
// and persisted on release — leaving Settings never strands an unsaved level on the panel.
const backlight = ref<BacklightState>({ available: false, writable: false, percent: 100 })
const brightness = ref(100)

onMounted(async () => {
  const [loaded, light] = await Promise.all([
    window.launcher.getSettings(),
    window.launcher.getBacklight()
  ])
  settings.value = loaded
  backlight.value = light
  brightness.value = light.percent
})

function previewBrightness(): void {
  void window.launcher.previewBrightness(brightness.value)
}

async function commitBrightness(): Promise<void> {
  settings.value = await window.launcher.setSettings({ brightness: brightness.value })
}

async function save(): Promise<void> {
  settings.value = await window.launcher.setSettings({
    autoUpdateOnLaunch: settings.value.autoUpdateOnLaunch
  })
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}
</script>

<template>
  <div class="screen">
    <header class="head">
      <button class="back" @click="$emit('home')">‹ Home</button>
      <h2>Settings</h2>
    </header>

    <div class="body">
      <section class="launcher">
        <div class="info">
          <div class="name">piPod launcher v{{ launcherUpdate.current }}</div>
          <div class="status">{{ updateStatus }}</div>
        </div>
        <button
          v-if="canStartLauncherUpdate(launcherUpdate)"
          class="primary"
          @click="updateLauncher"
        >
          {{ launcherUpdate.status === 'error' ? 'Retry' : 'Update' }}
        </button>
      </section>
      <progress
        v-if="launcherUpdate.status === 'downloading'"
        class="progress"
        max="100"
        :value="launcherUpdate.percent"
      />

      <section v-if="backlight.available" class="brightness">
        <div class="row">
          <span>Screen brightness</span>
          <span class="value">{{ brightness }}%</span>
        </div>
        <input
          v-model.number="brightness"
          type="range"
          :min="MIN_BRIGHTNESS_PERCENT"
          max="100"
          step="1"
          :disabled="!backlight.writable"
          aria-label="Screen brightness"
          @input="previewBrightness"
          @change="commitBrightness"
        />
        <p v-if="!backlight.writable" class="hint">
          No permission to change the backlight — see “Running on the Raspberry Pi” in the README.
        </p>
      </section>

      <label class="toggle">
        <input v-model="settings.autoUpdateOnLaunch" type="checkbox" />
        <span>Auto-update apps on launch</span>
      </label>

      <div class="actions">
        <button class="primary" @click="save">Save</button>
        <span v-if="saved" class="saved">Saved ✓</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.head h2 {
  margin: 0;
  font-size: 20px;
}

.body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.launcher {
  display: flex;
  align-items: center;
  gap: 16px;
}

.launcher .info {
  flex: 1;
}

.launcher .name {
  font-size: 17px;
  font-weight: 600;
}

.launcher .status {
  color: var(--accent);
  font-size: 13px;
  margin-top: 4px;
}

.progress {
  width: 100%;
  height: 10px;
  accent-color: var(--accent);
}

.brightness .row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.brightness .value {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

/* Custom track/thumb: the native thumb is too small to drag with a finger. The input itself is
   48px tall so the whole strip around the track is a tap target. */
.brightness input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 48px;
  margin: 0;
  background: transparent;
}

.brightness input::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 4px;
  background: var(--panel-2);
}

.brightness input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 36px;
  height: 36px;
  margin-top: -14px; /* centre on the 8px track */
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}

.brightness input:disabled {
  opacity: 0.4;
}

.brightness .hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted);
}

.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toggle input {
  width: 22px;
  height: 22px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.saved {
  color: var(--accent);
}
</style>
