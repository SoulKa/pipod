<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { canStartLauncherUpdate } from '@shared/launcherUpdate'
import type { LauncherSettings, LauncherUpdate } from '@shared/types'

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

onMounted(async () => {
  settings.value = await window.launcher.getSettings()
})

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
