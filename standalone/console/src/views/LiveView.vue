<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import type { Tournament } from '@pipod/shared'
import { createSocket, type ConsoleSocket } from '../socket'
import IdleBoard from '../components/IdleBoard.vue'
import OverviewView from './OverviewView.vue'

const tournaments = ref<Tournament[]>([])
/** Set once the server answered, or failed to — until then there is nothing to say. */
const settled = ref(false)
const connected = ref(false)
const socket = shallowRef<ConsoleSocket | null>(null)

/** The newest active tournament, else the newest one at all (so results stay up). */
const current = computed(() => {
  const newestFirst = [...tournaments.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return newestFirst.find((t) => t.status === 'active') ?? newestFirst[0] ?? null
})

onMounted(() => {
  // The server pushes the list whenever a tournament appears, goes away or changes status,
  // so the screen switches the moment one starts. A reconnect re-subscribes, and the
  // fresh list it gets covers whatever changed while the connection was down.
  const s = createSocket()
  socket.value = s
  s.on('connect', () => {
    connected.value = true
    s.emit('tournaments:subscribe')
  })
  s.on('disconnect', () => (connected.value = false))
  s.on('connect_error', () => (settled.value = true))
  s.on('tournaments:list', (list) => {
    tournaments.value = list
    settled.value = true
  })
})

onUnmounted(() => {
  socket.value?.disconnect()
  socket.value = null
})
</script>

<template>
  <!-- Keyed so switching tournaments re-opens the feed for the new one. -->
  <OverviewView v-if="current" :key="current.id" :id="current.id" qr-path="/" />
  <div v-else-if="settled" class="pd-panel live-waiting">
    <IdleBoard
      :connected="connected"
      title="Noch kein Turnier angelegt — diese Seite wechselt automatisch."
    />
  </div>
</template>
