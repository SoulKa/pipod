<script setup lang="ts">
import ThemeRadioGroup from '@/components/ThemeRadioGroup.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { useSettings } from '@/composables/useSettings'
import { searchCities, searchStations } from '@/composables/useSearch'
import type { CityResult, StationResult } from '@/composables/useSearch'

const emit = defineEmits<{ close: [] }>()
const { settings } = useSettings()

function selectCity(city: CityResult) {
  settings.location = { latitude: city.latitude, longitude: city.longitude, name: city.label }
}

function selectStation(station: StationResult) {
  settings.station = { id: station.id, name: station.name }
}
</script>

<template>
  <div
    class="fixed inset-0 z-10 overflow-y-auto bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white transition-colors duration-700"
  >
    <div class="mx-auto max-w-2xl px-6 py-8">
      <header class="flex items-center justify-between mb-8">
        <h1 class="text-2xl font-bold">Settings</h1>
        <button
          class="w-12 h-12 rounded-full bg-neutral-200/60 dark:bg-neutral-800/60 flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-xl hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white active:scale-95 transition-all"
          aria-label="Close settings"
          @click="emit('close')"
        >
          ✕
        </button>
      </header>

      <section class="mb-10">
        <h2
          class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
        >
          Theme
        </h2>
        <ThemeRadioGroup v-model="settings.theme" />
      </section>

      <section class="mb-10">
        <h2
          class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
        >
          Weather location
        </h2>
        <SearchSelect
          :current="
            settings.location.name ||
            `${settings.location.latitude}, ${settings.location.longitude}`
          "
          placeholder="Search for a city…"
          :search="searchCities"
          :option-label="(c: CityResult) => c.label"
          @select="selectCity"
        />
      </section>

      <section>
        <h2
          class="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
        >
          Train station
        </h2>
        <SearchSelect
          :current="settings.station.name || String(settings.station.id)"
          placeholder="Search for a station…"
          :search="searchStations"
          :option-label="(s: StationResult) => s.name"
          @select="selectStation"
        />
      </section>
    </div>
  </div>
</template>
