<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Tournament } from '@pipod/shared'
import { api } from '../api'
import OverviewView from './OverviewView.vue'

/**
 * How often to look for a newer tournament. There is no list-level socket event, and a
 * spectator screen switching over a few seconds late is fine.
 */
const POLL_MS = 15_000

const tournaments = ref<Tournament[]>([])
const loaded = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

/** The newest active tournament, else the newest one at all (so results stay up). */
const current = computed(() => {
  const newestFirst = [...tournaments.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return newestFirst.find((t) => t.status === 'active') ?? newestFirst[0] ?? null
})

async function load(): Promise<void> {
  try {
    tournaments.value = await api.listTournaments()
  } catch {
    // Keep showing the last known tournament; the next poll retries.
  } finally {
    loaded.value = true
  }
}

onMounted(() => {
  void load()
  timer = setInterval(() => void load(), POLL_MS)
})

onUnmounted(() => clearInterval(timer))
</script>

<template>
  <!-- Keyed so switching tournaments re-opens the feed for the new one. -->
  <OverviewView v-if="current" :key="current.id" :id="current.id" qr-path="/" />
  <div v-else-if="loaded" class="pd-panel live-waiting">
    <p class="pd-muted">Noch kein Turnier angelegt — diese Seite wechselt automatisch.</p>
  </div>
</template>

<style scoped>
.live-waiting {
  text-align: center;
}
</style>
