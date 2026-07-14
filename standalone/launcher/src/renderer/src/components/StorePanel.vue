<script setup lang="ts">
import { computed } from 'vue'
import type { CatalogEntry, UpdateProgress } from '../../../shared/types'
import ModalOverlay from './ModalOverlay.vue'

const props = defineProps<{
  catalog: CatalogEntry[]
  progress: Record<string, UpdateProgress>
}>()
defineEmits<{ install: [id: string]; refresh: []; close: [] }>()

function busy(id: string): boolean {
  const p = props.progress[id]
  return !!p && p.phase !== 'done' && p.phase !== 'error'
}

function status(entry: CatalogEntry): string {
  const p = props.progress[entry.id]
  if (p && busy(entry.id)) {
    if (p.phase === 'download' && p.total) {
      return `Downloading ${Math.round((100 * (p.received ?? 0)) / p.total)}%`
    }
    return `${p.phase}…`
  }
  if (entry.updateAvailable) return `v${entry.installedVersion} → v${entry.availableVersion}`
  if (entry.installed) return `Installed v${entry.installedVersion}`
  if (entry.availableVersion) return `Available v${entry.availableVersion}`
  return 'Unavailable'
}

const actionLabel = (entry: CatalogEntry): string =>
  entry.updateAvailable ? 'Update' : entry.installed ? 'Installed' : 'Install'

const canAct = (entry: CatalogEntry): boolean =>
  !busy(entry.id) && (entry.updateAvailable || (!entry.installed && !!entry.availableVersion))

const sorted = computed(() => [...props.catalog].sort((a, b) => a.name.localeCompare(b.name)))
</script>

<template>
  <ModalOverlay title="App Store" :width="680" @close="$emit('close')">
    <template #head-tools>
      <button @click="$emit('refresh')">Check for updates</button>
    </template>

    <ul class="list">
      <li v-for="entry in sorted" :key="entry.id" class="row">
        <div class="info">
          <div class="name">{{ entry.name }}</div>
          <div class="desc">{{ entry.description }}</div>
          <div class="status">{{ status(entry) }}</div>
        </div>
        <button
          class="primary"
          :disabled="!canAct(entry)"
          @click="$emit('install', entry.id)"
        >
          {{ actionLabel(entry) }}
        </button>
      </li>
      <li v-if="!sorted.length" class="empty">No apps found in the latest release.</li>
    </ul>
  </ModalOverlay>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
}

.row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--border);
}

.row:last-child {
  border-bottom: none;
}

.info {
  flex: 1;
}

.name {
  font-size: 17px;
  font-weight: 600;
}

.desc {
  color: var(--muted);
  font-size: 14px;
}

.status {
  color: var(--accent);
  font-size: 13px;
  margin-top: 4px;
}

.empty {
  color: var(--muted);
  padding: 16px;
}
</style>
