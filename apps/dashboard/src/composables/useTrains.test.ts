import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useTrains, visibleDepartures } from './useTrains'
import type { Departure } from './useTrains'

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

function mockFetch(body: unknown, ok = true): void {
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response)
}

const NOW = new Date('2026-01-01T10:00:00Z')

const MOCK_EVENT = {
  departureTimePlanned: '2026-01-01T10:00:00Z',
  departureTimeEstimated: '2026-01-01T10:03:00Z',
  transportation: {
    number: 'S1',
    destination: { name: 'Plochingen' },
  },
  location: { properties: { platformName: '3' } },
}

describe('useTrains', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('starts with empty departures and no error', () => {
    mockFetch({ stopEvents: [] })
    const [result, wrapper] = withSetup(() => useTrains())
    expect(result.departures.value).toEqual([])
    expect(result.error.value).toBeNull()
    wrapper.unmount()
  })

  it('fetches the correct URL with station ID and required params', async () => {
    mockFetch({ stopEvents: [] })
    const [, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/vvs/XML_DM_REQUEST')
    expect(url).toContain('outputFormat=rapidJSON')
    expect(url).toContain('name_dm=123')
    expect(url).toContain('useRealtime=1')
    wrapper.unmount()
  })

  it('maps stopEvents to departures with correct fields, delay, and countdown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockFetch({ stopEvents: [MOCK_EVENT] })

    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.departures.value).toHaveLength(1)
    const d = result.departures.value[0]
    expect(d.line).toBe('S1')
    expect(d.direction).toBe('Plochingen')
    expect(d.scheduledTime).toEqual(new Date('2026-01-01T10:00:00Z'))
    expect(d.realtimeTime).toEqual(new Date('2026-01-01T10:03:00Z'))
    expect(d.delayMinutes).toBe(3)
    expect(d.platform).toBe('3')
    expect(result.lastUpdated.value).toBeInstanceOf(Date)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('marks a departure cancelled when realtimeStatus contains a cancellation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const event = { ...MOCK_EVENT, realtimeStatus: ['TRIP_CANCELLED'] }
    mockFetch({ stopEvents: [event] })

    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.departures.value[0]!.cancelled).toBe(true)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('marks a departure not cancelled for a normal realtimeStatus', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const event = { ...MOCK_EVENT, realtimeStatus: ['MONITORED'] }
    mockFetch({ stopEvents: [event] })

    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.departures.value[0]!.cancelled).toBe(false)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('treats a missing realtimeStatus as not cancelled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockFetch({ stopEvents: [MOCK_EVENT] })

    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.departures.value[0]!.cancelled).toBe(false)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('sets realtimeTime to null and delayMinutes to 0 when departureTimeEstimated is absent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const event = { ...MOCK_EVENT, departureTimeEstimated: undefined }
    mockFetch({ stopEvents: [event] })

    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    const d = result.departures.value[0]
    expect(d.realtimeTime).toBeNull()
    expect(d.delayMinutes).toBe(0)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('returns empty array when stopEvents is empty', async () => {
    mockFetch({ stopEvents: [] })
    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.departures.value).toEqual([])
    wrapper.unmount()
  })

  it('returns empty array when stopEvents key is missing', async () => {
    mockFetch({})
    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.departures.value).toEqual([])
    wrapper.unmount()
  })

  it('sorts departures by effective departure time (realtime takes precedence)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const early = {
      ...MOCK_EVENT,
      departureTimePlanned: '2026-01-01T10:10:00Z',
      departureTimeEstimated: '2026-01-01T10:05:00Z', // delayed but effective time is earlier
    }
    const late = {
      ...MOCK_EVENT,
      departureTimePlanned: '2026-01-01T10:08:00Z',
      departureTimeEstimated: undefined,
    }
    mockFetch({ stopEvents: [late, early] }) // API returns late first

    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.departures.value[0]!.scheduledTime).toEqual(new Date('2026-01-01T10:10:00Z'))
    expect(result.departures.value[1]!.scheduledTime).toEqual(new Date('2026-01-01T10:08:00Z'))

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('sets error on non-OK HTTP response', async () => {
    mockFetch({}, false)
    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.error.value).toBeInstanceOf(Error)
    expect(result.error.value!.message).toContain('500')
    wrapper.unmount()
  })

  it('sets error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))
    const [result, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    expect(result.error.value).toBeInstanceOf(Error)
    wrapper.unmount()
  })

  it('re-fetches after 60 seconds', async () => {
    vi.useFakeTimers()
    mockFetch({ stopEvents: [] })
    const [, wrapper] = withSetup(() => useTrains())
    await flushPromises()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60 * 1000)

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('stops polling after unmount', async () => {
    vi.useFakeTimers()
    mockFetch({ stopEvents: [] })
    const [, wrapper] = withSetup(() => useTrains())
    await flushPromises()

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(60 * 1000)

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('visibleDepartures', () => {
  const NOW = new Date('2026-01-01T10:00:00Z')

  function dep(overrides: Partial<Departure>): Departure {
    return {
      line: 'S1',
      direction: 'Plochingen',
      scheduledTime: new Date('2026-01-01T10:05:00Z'),
      realtimeTime: null,
      delayMinutes: 0,
      platform: '1',
      cancelled: false,
      ...overrides,
    }
  }

  it('drops cancelled departures', () => {
    const cancelled = dep({ direction: 'Cancelled', cancelled: true })
    const running = dep({ direction: 'Running' })
    expect(visibleDepartures([cancelled, running], NOW).map((d) => d.direction)).toEqual([
      'Running',
    ])
  })

  it('drops departures whose effective time is at or before now', () => {
    const past = dep({ direction: 'Past', scheduledTime: new Date('2026-01-01T09:59:00Z') })
    const exactlyNow = dep({ direction: 'Now', scheduledTime: NOW })
    const future = dep({ direction: 'Future' })
    expect(visibleDepartures([past, exactlyNow, future], NOW).map((d) => d.direction)).toEqual([
      'Future',
    ])
  })

  it('keeps a delayed departure whose realtime estimate is still in the future', () => {
    const delayed = dep({
      direction: 'Delayed',
      scheduledTime: new Date('2026-01-01T09:59:00Z'),
      realtimeTime: new Date('2026-01-01T10:03:00Z'),
      delayMinutes: 4,
    })
    expect(visibleDepartures([delayed], NOW).map((d) => d.direction)).toEqual(['Delayed'])
  })

  it('hides a departure once now advances past its effective time', () => {
    const soon = dep({ direction: 'Soon', scheduledTime: new Date('2026-01-01T10:00:30Z') })
    expect(visibleDepartures([soon], NOW)).toHaveLength(1)
    expect(visibleDepartures([soon], new Date('2026-01-01T10:00:31Z'))).toHaveLength(0)
  })

  it('caps the list to the requested limit', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      dep({ direction: `D${i}`, scheduledTime: new Date(`2026-01-01T10:${10 + i}:00Z`) }),
    )
    expect(visibleDepartures(many, NOW)).toHaveLength(6)
    expect(visibleDepartures(many, NOW, 3)).toHaveLength(3)
  })
})
