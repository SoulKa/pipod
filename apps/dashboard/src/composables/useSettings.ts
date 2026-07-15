import { reactive, watch } from 'vue'
import config from '@/config'

export type ThemePreference = 'auto' | 'light' | 'dark'

export interface DashboardSettings {
  theme: ThemePreference
  location: { latitude: number; longitude: number; name: string }
  station: { id: number; name: string }
}

const STORAGE_KEY = 'dashboard.settings'
const THEMES: ThemePreference[] = ['auto', 'light', 'dark']

// Defaults come from the bundled config file; the user's saved settings (if any) override them.
function defaults(): DashboardSettings {
  return {
    theme: 'auto',
    location: { ...config.location },
    station: { ...config.station },
  }
}

// Merge the persisted blob field-by-field so a partial or outdated payload can never leave a
// setting undefined — anything missing or malformed falls back to the default. Never throws.
function load(): DashboardSettings {
  const base = defaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<DashboardSettings>
    if (saved.theme && THEMES.includes(saved.theme)) base.theme = saved.theme
    const l = saved.location
    if (l && typeof l.latitude === 'number' && typeof l.longitude === 'number') {
      base.location = { latitude: l.latitude, longitude: l.longitude, name: l.name ?? '' }
    }
    const s = saved.station
    if (s && typeof s.id === 'number') {
      base.station = { id: s.id, name: s.name ?? '' }
    }
  } catch {
    // Corrupt JSON or unavailable storage — keep the defaults.
  }
  return base
}

// Module-level singleton so every useSettings() caller shares one reactive instance.
const settings = reactive<DashboardSettings>(load())

watch(
  settings,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // Storage full or unavailable — settings still apply for this session.
    }
  },
  { deep: true },
)

export function useSettings(): { settings: DashboardSettings } {
  return { settings }
}
