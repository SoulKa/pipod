<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { LauncherSettings } from '../../../shared/types'
import ModalOverlay from './ModalOverlay.vue'

defineEmits<{ close: [] }>()

const settings = ref<LauncherSettings>({ autoUpdateOnLaunch: true })
const saved = ref(false)

onMounted(async () => {
  settings.value = await window.launcher.getSettings()
})

async function save(): Promise<void> {
  settings.value = await window.launcher.setSettings({
    autoUpdateOnLaunch: settings.value.autoUpdateOnLaunch,
  })
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}
</script>

<template>
  <ModalOverlay title="Settings" @close="$emit('close')">
    <div class="body">
      <label class="toggle">
        <input v-model="settings.autoUpdateOnLaunch" type="checkbox" />
        <span>Auto-update apps on launch</span>
      </label>

      <div class="actions">
        <button class="primary" @click="save">Save</button>
        <span v-if="saved" class="saved">Saved ✓</span>
      </div>
    </div>
  </ModalOverlay>
</template>

<style scoped>
.body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
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
