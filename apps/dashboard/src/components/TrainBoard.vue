<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { visibleDepartures } from '@/composables/useTrains'
import type { Departure } from '@/composables/useTrains'

const props = defineProps<{
  departures: Departure[]
  loading: boolean
  error: Error | null
  lastUpdated: Date | null
}>()

const now = ref(new Date())

// Re-derived every second against `now` so cancelled/departed trains drop off within a second
// rather than lingering until the next 60s poll.
const rows = computed(() => visibleDepartures(props.departures, now.value))

let clockTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})
onUnmounted(() => {
  if (clockTimer !== null) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})

const lastUpdatedStr = computed(() => {
  if (!props.lastUpdated) return null
  const secs = Math.round((now.value.getTime() - props.lastUpdated.getTime()) / 1000)
  if (secs < 10) return 'gerade eben'
  if (secs < 60) return `vor ${secs}s`
  return `vor ${Math.round(secs / 60)} min`
})

function countdownLabel(dep: Departure): string {
  const ms = (dep.realtimeTime ?? dep.scheduledTime).getTime() - now.value.getTime()
  if (ms <= 0) return 'jetzt'
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}'`
}
</script>

<template>
  <div class="flex flex-col min-h-0 border-t border-neutral-200 dark:border-neutral-800">
    <div
      class="flex items-center justify-between px-10 py-5 border-b border-neutral-200 dark:border-neutral-800 shrink-0"
    >
      <span class="text-2xl font-semibold text-neutral-600 dark:text-neutral-300">Abfahrten</span>
      <span v-if="loading" class="text-lg text-neutral-500">Lädt…</span>
      <span v-else-if="error && rows.length > 0" class="text-lg text-red-400">Fehler</span>
      <span v-else-if="lastUpdatedStr" class="text-lg text-neutral-500">{{ lastUpdatedStr }}</span>
    </div>

    <TransitionGroup tag="div" name="train" class="flex-1 flex flex-col">
      <div
        v-for="(dep, i) in rows"
        :key="`${dep.line}-${dep.scheduledTime.getTime()}`"
        class="flex-1 flex items-center gap-5 px-10 border-b border-neutral-200/70 dark:border-neutral-800/50"
        :class="{ 'bg-neutral-100/60 dark:bg-neutral-900/40': i % 2 === 1 }"
      >
        <span
          class="w-16 h-9 rounded text-base font-bold text-white flex items-center justify-center shrink-0"
          :class="{
            'bg-green-600': /^S\d/.test(dep.line),
            'bg-blue-600': /^U\d/.test(dep.line),
            'bg-slate-500': !/^[SU]\d/.test(dep.line),
          }"
        >
          {{ dep.line }}
        </span>

        <span class="flex-1 text-xl truncate">{{ dep.direction }}</span>

        <span
          v-if="dep.delayMinutes > 0"
          class="text-base font-mono shrink-0"
          :class="{
            'text-red-400': dep.delayMinutes >= 5,
            'text-amber-400': dep.delayMinutes < 5,
          }"
        >
          +{{ dep.delayMinutes }}'
        </span>

        <span class="text-3xl font-bold tabular-nums w-20 text-right shrink-0">
          {{ countdownLabel(dep) }}
        </span>
      </div>

      <div
        v-if="rows.length === 0"
        key="empty"
        class="flex-1 flex items-center justify-center text-xl"
        :class="error ? 'text-red-400' : 'text-neutral-500'"
      >
        {{ error ? 'Abfahrten nicht verfügbar' : loading ? '' : 'Keine Abfahrten' }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.train-move {
  transition: transform 0.35s ease;
}
.train-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.train-leave-active {
  transition: opacity 0.25s ease;
}
.train-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.train-leave-to {
  opacity: 0;
}
</style>
