import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { fetchWeatherApi } from 'openmeteo'
import { useWeather } from './useWeather'

vi.mock('openmeteo', () => ({ fetchWeatherApi: vi.fn() }))
vi.mock('@/composables/useSettings', () => ({
  useSettings: () => ({
    settings: {
      theme: 'auto',
      location: { latitude: 1.0, longitude: 2.0, name: 'Test City' },
      station: { id: 123, name: 'Test Station' },
    },
  }),
}))

type MountReturn = ReturnType<typeof mount>

function withSetup<T>(composable: () => T): [T, MountReturn] {
  let result!: T
  const wrapper = mount(
    defineComponent({
      setup() {
        result = composable()
        return () => null
      },
    }),
  )
  return [result, wrapper]
}

const VARIABLE_VALUES = [20.5, 18.0, 3, 15.0, 0.2]

const DAILY_VALUES: number[][] = [
  [3, 61], // weather_code:                  today=3,    tomorrow=61
  [25.0, 18.0], // temperature_2m_max:             today=25,   tomorrow=18
  [15.0, 10.0], // temperature_2m_min:             today=15,   tomorrow=10
  [0.0, 8.5], // precipitation_sum:              today=0,    tomorrow=8.5
  [5, 80], // precipitation_probability_max:  today=5,    tomorrow=80
  [1705384800, 1705384800], // sunrise: 2024-01-16T06:00:00Z
  [1705427400, 1705427400], // sunset:  2024-01-16T17:30:00Z
]

// Hourly data anchored at 2024-01-16T00:00:00Z (24 entries, 1-hour interval).
// Slots at index 8 (08:00), 13 (13:00), 19 (19:00) carry test values.
// With real Date.now() (~2026) these produce no slots; set system time to
// 2024-01-15T20:00:00Z in the slots test to make "tomorrow" = 2024-01-16.
const HOURLY_START_S = 1705363200 // 2024-01-16T00:00:00Z
const HOURLY_TEMPS = new Float32Array(24)
HOURLY_TEMPS[8] = 22
HOURLY_TEMPS[13] = 28
HOURLY_TEMPS[19] = 19
const HOURLY_CODES = new Float32Array(24)
HOURLY_CODES[8] = 3
HOURLY_CODES[13] = 80
HOURLY_CODES[19] = 61

const MOCK_RESPONSE = [
  {
    utcOffsetSeconds: () => 0,
    current: () => ({
      time: () => 1000,
      variables: (i: number) => ({ value: () => VARIABLE_VALUES[i] ?? 0 }),
    }),
    daily: () => ({
      variables: (i: number) => ({
        valuesArray: () => (i < 5 ? DAILY_VALUES[i] : null),
        valuesInt64: (day: number) => (i >= 5 ? BigInt(DAILY_VALUES[i]![day]!) : null),
      }),
    }),
    hourly: () => ({
      time: () => BigInt(HOURLY_START_S),
      timeEnd: () => BigInt(HOURLY_START_S + 24 * 3600),
      variables: (i: number) => ({
        valuesArray: () =>
          i === 0
            ? HOURLY_TEMPS
            : i === 1
              ? HOURLY_CODES
              : (() => {
                  const a = new Float32Array(24)
                  a[8] = 10
                  a[13] = 5
                  a[19] = 60
                  return a
                })(),
      }),
    }),
  },
]

describe('useWeather', () => {
  beforeEach(() => {
    vi.mocked(fetchWeatherApi).mockResolvedValue(MOCK_RESPONSE as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('starts loading and fires an initial fetch on mount', async () => {
    const [result, wrapper] = withSetup(() => useWeather())
    expect(result.loading.value).toBe(true)
    await flushPromises()
    expect(result.loading.value).toBe(false)
    expect(vi.mocked(fetchWeatherApi)).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('calls fetchWeatherApi with the configured lat/lon', async () => {
    const [, wrapper] = withSetup(() => useWeather())
    await flushPromises()
    expect(vi.mocked(fetchWeatherApi)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ latitude: 1.0, longitude: 2.0 }),
    )
    wrapper.unmount()
  })

  it('populates weather with correctly mapped fields', async () => {
    const [result, wrapper] = withSetup(() => useWeather())
    await flushPromises()

    expect(result.weather.value).not.toBeNull()
    const w = result.weather.value!
    expect(w.temperature).toBe(20.5)
    expect(w.apparentTemperature).toBe(18.0)
    expect(w.weatherCode).toBe(3)
    expect(w.windSpeed).toBe(15.0)
    expect(w.precipitation).toBe(0.2)
    expect(w.time).toEqual(new Date(1000 * 1000))
    expect(w.sunrise).toBeInstanceOf(Date)
    expect(w.sunset).toBeInstanceOf(Date)
    expect(w.sunrise.getTime()).toBe(1705384800 * 1000)
    expect(w.sunset.getTime()).toBe(1705427400 * 1000)
    wrapper.unmount()
  })

  it('populates today forecast from daily data', async () => {
    const [result, wrapper] = withSetup(() => useWeather())
    await flushPromises()

    const t = result.weather.value!.today
    expect(t.weatherCode).toBe(3)
    expect(t.high).toBe(25)
    expect(t.low).toBe(15)
    expect(t.precipitationMm).toBe(0)
    expect(t.precipitationProbability).toBe(5)
    wrapper.unmount()
  })

  it('populates tomorrow forecast from daily data', async () => {
    const [result, wrapper] = withSetup(() => useWeather())
    await flushPromises()

    const t = result.weather.value!.tomorrow
    expect(t.weatherCode).toBe(61)
    expect(t.high).toBe(18)
    expect(t.low).toBe(10)
    expect(t.precipitationMm).toBe(8.5)
    expect(t.precipitationProbability).toBe(80)
    wrapper.unmount()
  })

  it('sets error and keeps weather null when the fetch rejects', async () => {
    vi.mocked(fetchWeatherApi).mockRejectedValue(new Error('network error'))
    const [result, wrapper] = withSetup(() => useWeather())
    await flushPromises()

    expect(result.error.value).toBeInstanceOf(Error)
    expect(result.weather.value).toBeNull()
    wrapper.unmount()
  })

  it('re-fetches after 30 minutes', async () => {
    vi.useFakeTimers()
    const [, wrapper] = withSetup(() => useWeather())
    await flushPromises()
    expect(vi.mocked(fetchWeatherApi)).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)

    expect(vi.mocked(fetchWeatherApi)).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('stops polling after unmount', async () => {
    vi.useFakeTimers()
    const [, wrapper] = withSetup(() => useWeather())
    await flushPromises()

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)

    expect(vi.mocked(fetchWeatherApi)).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('populates tomorrow.slots with 3 hourly entries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T20:00:00Z'))

    const [result, wrapper] = withSetup(() => useWeather())
    await flushPromises()

    const slots = result.weather.value!.tomorrow.slots
    expect(slots).toHaveLength(3)
    expect(slots[0]).toEqual({
      hour: 8,
      temperature: 22,
      weatherCode: 3,
      precipitationProbability: 10,
    })
    expect(slots[1]).toEqual({
      hour: 13,
      temperature: 28,
      weatherCode: 80,
      precipitationProbability: 5,
    })
    expect(slots[2]).toEqual({
      hour: 19,
      temperature: 19,
      weatherCode: 61,
      precipitationProbability: 60,
    })

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('populates today.slots with 3 hourly entries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-16T10:00:00Z'))

    const [result, wrapper] = withSetup(() => useWeather())
    await flushPromises()

    const slots = result.weather.value!.today.slots
    expect(slots).toHaveLength(3)
    expect(slots[0]).toEqual({
      hour: 8,
      temperature: 22,
      weatherCode: 3,
      precipitationProbability: 10,
    })
    expect(slots[1]).toEqual({
      hour: 13,
      temperature: 28,
      weatherCode: 80,
      precipitationProbability: 5,
    })
    expect(slots[2]).toEqual({
      hour: 19,
      temperature: 19,
      weatherCode: 61,
      precipitationProbability: 60,
    })

    wrapper.unmount()
    vi.useRealTimers()
  })
})
