<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import WeatherCard from '@/components/WeatherCard.vue'
import TrainBoard from '@/components/TrainBoard.vue'
import SettingsView from '@/views/SettingsView.vue'
import { useWeather } from '@/composables/useWeather'
import { useTrains } from '@/composables/useTrains'
import { useTheme } from '@/composables/useTheme'

const { weather, loading: weatherLoading, error: weatherError } = useWeather()
const {
  departures,
  loading: trainsLoading,
  error: trainsError,
  lastUpdated: trainsLastUpdated,
} = useTrains()

const currentTime = ref(new Date())
let clockTimer: ReturnType<typeof setInterval> | null = null
const showSettings = ref(false)

function closeApp() {
  // In the launcher this returns to the home grid; harmless (404, swallowed) when run standalone.
  void fetch('/.launcher/home', { method: 'POST' }).catch(() => {})
}

// Activates the theme effect (applies the `dark` class from the shared settings store).
useTheme(weather, currentTime)

onMounted(() => {
  clockTimer = setInterval(() => {
    currentTime.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (clockTimer !== null) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<template>
  <div
    class="w-screen h-screen overflow-hidden grid bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white transition-colors duration-700"
    style="grid-template-rows: auto 1fr"
  >
    <WeatherCard
      :weather="weather"
      :loading="weatherLoading"
      :error="weatherError"
      :time="currentTime"
    />
    <TrainBoard
      :departures="departures"
      :loading="trainsLoading"
      :error="trainsError"
      :last-updated="trainsLastUpdated"
    />
    <button
      class="fixed top-6 left-6 w-12 h-12 rounded-full bg-neutral-200/60 dark:bg-neutral-800/60 flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-xl hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white active:scale-95 transition-all"
      @click="closeApp"
    >
      ✕
    </button>
    <button
      class="fixed top-6 right-6 w-12 h-12 rounded-full bg-neutral-200/60 dark:bg-neutral-800/60 flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-xl hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white active:scale-95 transition-all"
      aria-label="Open settings"
      @click="showSettings = true"
    >
      ⚙
    </button>
    <SettingsView v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style>
html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: white;
  transition: background 0.7s ease;
}

html.dark,
html.dark body {
  background: #0a0a0a;
}

#app {
  width: 100%;
  height: 100%;
}
</style>
