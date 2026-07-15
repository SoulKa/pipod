import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { fetchWeatherApi } from 'openmeteo'
import { useSettings } from '@/composables/useSettings'

export interface HourlySlot {
  hour: number
  temperature: number
  weatherCode: number
  precipitationProbability: number
}

export interface TomorrowForecast {
  high: number
  low: number
  weatherCode: number
  precipitationMm: number
  precipitationProbability: number
  slots: HourlySlot[]
}

export interface WeatherData {
  time: Date
  temperature: number
  apparentTemperature: number
  weatherCode: number
  windSpeed: number
  precipitation: number
  sunrise: Date
  sunset: Date
  today: TomorrowForecast
  tomorrow: TomorrowForecast
}

const POLL_INTERVAL_MS = 30 * 60 * 1000

export function useWeather(): {
  weather: Ref<WeatherData | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
} {
  const { settings } = useSettings()
  const weather = ref<WeatherData | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', {
        latitude: settings.location.latitude,
        longitude: settings.location.longitude,
        current: [
          'temperature_2m',
          'apparent_temperature',
          'weathercode',
          'windspeed_10m',
          'precipitation',
        ],
        daily: [
          'weather_code',
          'temperature_2m_max',
          'temperature_2m_min',
          'precipitation_sum',
          'precipitation_probability_max',
          'sunrise',
          'sunset',
        ],
        hourly: ['temperature_2m', 'weather_code', 'precipitation_probability'],
        timezone: 'auto',
      })
      const location = responses[0]
      const utcOffsetSeconds = location.utcOffsetSeconds()
      const current = location.current()!
      const daily = location.daily()!
      const d = (i: number) => daily.variables(i)!.valuesArray()![1]!
      const d0 = (i: number) => daily.variables(i)!.valuesArray()![0]!
      const dts = (i: number, day: number) => Number(daily.variables(i)!.valuesInt64(day)!)

      const SLOT_HOURS = [8, 13, 19]
      const hourly = location.hourly()!
      const hourlyStart = Number(hourly.time())
      const hourlyTemps = hourly.variables(0)!.valuesArray()!
      const hourlyCodes = hourly.variables(1)!.valuesArray()!
      const hourlyPrecip = hourly.variables(2)!.valuesArray()!
      const hourlyInterval = (Number(hourly.timeEnd()) - hourlyStart) / hourlyTemps.length
      const nowLocal = new Date((Math.floor(Date.now() / 1000) + utcOffsetSeconds) * 1000)
      const tomorrowLocal = new Date(nowLocal)
      tomorrowLocal.setUTCDate(tomorrowLocal.getUTCDate() + 1)
      const ty = tomorrowLocal.getUTCFullYear()
      const tm = tomorrowLocal.getUTCMonth()
      const td = tomorrowLocal.getUTCDate()
      const slots: HourlySlot[] = []
      for (let i = 0; i < hourlyTemps.length; i++) {
        const hd = new Date((hourlyStart + i * hourlyInterval + utcOffsetSeconds) * 1000)
        if (
          hd.getUTCFullYear() === ty &&
          hd.getUTCMonth() === tm &&
          hd.getUTCDate() === td &&
          SLOT_HOURS.includes(hd.getUTCHours())
        ) {
          slots.push({
            hour: hd.getUTCHours(),
            temperature: Math.round(hourlyTemps[i]!),
            weatherCode: Math.round(hourlyCodes[i]!),
            precipitationProbability: Math.round(hourlyPrecip[i]!),
          })
        }
      }

      const ty2 = nowLocal.getUTCFullYear()
      const tm2 = nowLocal.getUTCMonth()
      const td2 = nowLocal.getUTCDate()
      const todaySlots: HourlySlot[] = []
      for (let i = 0; i < hourlyTemps.length; i++) {
        const hd = new Date((hourlyStart + i * hourlyInterval + utcOffsetSeconds) * 1000)
        if (
          hd.getUTCFullYear() === ty2 &&
          hd.getUTCMonth() === tm2 &&
          hd.getUTCDate() === td2 &&
          SLOT_HOURS.includes(hd.getUTCHours())
        ) {
          todaySlots.push({
            hour: hd.getUTCHours(),
            temperature: Math.round(hourlyTemps[i]!),
            weatherCode: Math.round(hourlyCodes[i]!),
            precipitationProbability: Math.round(hourlyPrecip[i]!),
          })
        }
      }

      weather.value = {
        time: new Date((Number(current.time()) + utcOffsetSeconds) * 1000),
        temperature: current.variables(0)!.value(),
        apparentTemperature: current.variables(1)!.value(),
        weatherCode: current.variables(2)!.value(),
        windSpeed: current.variables(3)!.value(),
        precipitation: current.variables(4)!.value(),
        sunrise: new Date(dts(5, 0) * 1000),
        sunset: new Date(dts(6, 0) * 1000),
        today: {
          weatherCode: Math.round(d0(0)),
          high: Math.round(d0(1)),
          low: Math.round(d0(2)),
          precipitationMm: Math.round(d0(3) * 10) / 10,
          precipitationProbability: Math.round(d0(4)),
          slots: todaySlots,
        },
        tomorrow: {
          weatherCode: Math.round(d(0)),
          high: Math.round(d(1)),
          low: Math.round(d(2)),
          precipitationMm: Math.round(d(3) * 10) / 10,
          precipitationProbability: Math.round(d(4)),
          slots,
        },
      }
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      loading.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null

  // Re-fetch immediately when the user picks a new location in settings.
  watch(
    () => [settings.location.latitude, settings.location.longitude],
    () => void refresh(),
  )

  onMounted(() => {
    void refresh()
    timer = setInterval(() => void refresh(), POLL_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  })

  return { weather, loading, error, refresh }
}
