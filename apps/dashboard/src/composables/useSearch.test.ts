import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchCities, searchStations } from './useSearch'

function mockFetch(body: unknown, ok = true): void {
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response)
}

describe('searchCities', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns [] without fetching on an empty query', async () => {
    expect(await searchCities('   ')).toEqual([])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('maps geocoding results and builds a disambiguating label', async () => {
    mockFetch({
      results: [
        {
          name: 'Stuttgart',
          latitude: 48.78,
          longitude: 9.18,
          admin1: 'Baden-Württemberg',
          country: 'Germany',
        },
      ],
    })
    const results = await searchCities('Stuttgart')
    expect(results).toEqual([
      {
        name: 'Stuttgart',
        latitude: 48.78,
        longitude: 9.18,
        label: 'Stuttgart, Baden-Württemberg, Germany',
      },
    ])
  })

  it('returns [] when the API has no results key', async () => {
    mockFetch({})
    expect(await searchCities('nowhere')).toEqual([])
  })

  it('returns [] on a non-OK response', async () => {
    mockFetch({}, false)
    expect(await searchCities('Stuttgart')).toEqual([])
  })

  it('returns [] on a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    expect(await searchCities('Stuttgart')).toEqual([])
  })
})

describe('searchStations', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns [] without fetching on an empty query', async () => {
    expect(await searchStations('')).toEqual([])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('hits the stop-finder endpoint via the VVS base', async () => {
    mockFetch({ locations: [] })
    await searchStations('Haupt')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/vvs/XML_STOPFINDER_REQUEST')
    expect(url).toContain('name_sf=Haupt')
  })

  it('keeps only stop-type locations that carry a numeric stopId', async () => {
    mockFetch({
      locations: [
        { name: 'Stuttgart Hbf', type: 'stop', properties: { stopId: '5006118' } },
        { name: 'Some Street', type: 'street' },
        { name: 'No Id Stop', type: 'stop' },
      ],
    })
    const results = await searchStations('Stuttgart')
    expect(results).toEqual([{ id: 5006118, name: 'Stuttgart Hbf' }])
  })

  it('returns [] on a non-OK response', async () => {
    mockFetch({}, false)
    expect(await searchStations('Haupt')).toEqual([])
  })

  it('returns [] on a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    expect(await searchStations('Haupt')).toEqual([])
  })
})
