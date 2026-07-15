import { watchEffect } from 'vue'
import type { Ref } from 'vue'
import type { WeatherData } from '@/composables/useWeather'
import { useSettings } from '@/composables/useSettings'

const OFFSET_MS = 60 * 60 * 1000

// Applies the theme preference (from settings) to the document. In `auto` mode it derives
// day/night from the weather's sunrise/sunset with a 1h offset. Keeps no local state — the
// preference lives in the shared settings store so the settings view can edit it.
export function useTheme(weather: Ref<WeatherData | null>, currentTime: Ref<Date>) {
  const { settings } = useSettings()

  watchEffect(() => {
    if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark')
      return
    }
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark')
      return
    }
    const w = weather.value
    const t = currentTime.value.getTime()
    const isDay =
      w !== null && t >= w.sunrise.getTime() + OFFSET_MS && t < w.sunset.getTime() - OFFSET_MS
    document.documentElement.classList.toggle('dark', !isDay)
  })
}
