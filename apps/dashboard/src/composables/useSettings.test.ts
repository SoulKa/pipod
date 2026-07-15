import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// Deterministic defaults so tests don't depend on the bundled config file.
vi.mock('@/config', () => ({
  default: {
    location: { latitude: 48.0, longitude: 9.0, name: 'Default City' },
    station: { id: 5006118, name: 'Default Station' },
  },
}))

const KEY = 'dashboard.settings'

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    // The store is a module-level singleton created on import — reset so each test loads fresh.
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('falls back to config defaults when nothing is stored', async () => {
    const { useSettings } = await import('./useSettings')
    const { settings } = useSettings()
    expect(settings.theme).toBe('auto')
    expect(settings.location).toEqual({ latitude: 48.0, longitude: 9.0, name: 'Default City' })
    expect(settings.station).toEqual({ id: 5006118, name: 'Default Station' })
  })

  it('loads persisted values, overriding defaults', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        theme: 'dark',
        location: { latitude: 1, longitude: 2, name: 'Saved City' },
        station: { id: 42, name: 'Saved Station' },
      }),
    )
    const { useSettings } = await import('./useSettings')
    const { settings } = useSettings()
    expect(settings.theme).toBe('dark')
    expect(settings.location.name).toBe('Saved City')
    expect(settings.station.id).toBe(42)
  })

  it('falls back to defaults on corrupt JSON', async () => {
    localStorage.setItem(KEY, '{not valid json')
    const { useSettings } = await import('./useSettings')
    const { settings } = useSettings()
    expect(settings.theme).toBe('auto')
    expect(settings.station.id).toBe(5006118)
  })

  it('ignores an invalid theme value and keeps the default', async () => {
    localStorage.setItem(KEY, JSON.stringify({ theme: 'neon' }))
    const { useSettings } = await import('./useSettings')
    const { settings } = useSettings()
    expect(settings.theme).toBe('auto')
  })

  it('persists changes back to localStorage', async () => {
    const { useSettings } = await import('./useSettings')
    const { settings } = useSettings()
    settings.theme = 'light'
    settings.station = { id: 999, name: 'New Station' }
    await nextTick()

    const saved = JSON.parse(localStorage.getItem(KEY)!)
    expect(saved.theme).toBe('light')
    expect(saved.station).toEqual({ id: 999, name: 'New Station' })
  })
})
