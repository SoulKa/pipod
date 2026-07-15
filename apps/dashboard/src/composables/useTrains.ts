import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useSettings } from '@/composables/useSettings'

export interface Departure {
  line: string
  direction: string
  scheduledTime: Date
  realtimeTime: Date | null
  delayMinutes: number
  platform: string | null
}

interface VvsTransportation {
  number: string
  destination: { name: string }
}

interface VvsStopEvent {
  departureTimePlanned: string
  departureTimeEstimated?: string
  transportation: VvsTransportation
  location: { properties?: { platformName?: string } }
}

interface VvsResponse {
  stopEvents?: VvsStopEvent[]
}

const POLL_INTERVAL_MS = 60 * 1000

// Dev uses Vite's `/api/vvs` proxy (CORS). The packaged launcher serves the app over piapp://
// with no proxy, but app views run with webSecurity disabled, so we hit the VVS host directly.
// Exported so the station search (useSearch) hits the same base with the same dev/prod behaviour.
export const VVS_BASE = import.meta.env.DEV ? '/api/vvs' : 'https://www3.vvs.de/mngvvs'

export function useTrains(): {
  departures: Ref<Departure[]>
  loading: Ref<boolean>
  error: Ref<Error | null>
  lastUpdated: Ref<Date | null>
  refresh: () => Promise<void>
} {
  const { settings } = useSettings()
  const departures = ref<Departure[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const lastUpdated = ref<Date | null>(null)

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams({
        outputFormat: 'rapidJSON',
        type_dm: 'stopID',
        name_dm: settings.station.id.toString(),
        mode: 'direct',
        dmLineSelectionAll: '1',
        limit: '20',
        useRealtime: '1',
      })
      const response = await fetch(`${VVS_BASE}/XML_DM_REQUEST?${params}`)
      if (!response.ok) throw new Error(`VVS API error: ${response.status}`)
      const data = (await response.json()) as VvsResponse
      lastUpdated.value = new Date()
      departures.value = (data.stopEvents ?? [])
        .map((e) => {
          const scheduled = new Date(e.departureTimePlanned)
          const realtime = e.departureTimeEstimated ? new Date(e.departureTimeEstimated) : null
          const delayMinutes = realtime
            ? Math.round((realtime.getTime() - scheduled.getTime()) / 60_000)
            : 0
          return {
            line: e.transportation.number,
            direction: e.transportation.destination.name,
            scheduledTime: scheduled,
            realtimeTime: realtime,
            delayMinutes,
            platform: e.location.properties?.platformName ?? null,
          }
        })
        .sort(
          (a, b) =>
            (a.realtimeTime ?? a.scheduledTime).getTime() -
            (b.realtimeTime ?? b.scheduledTime).getTime(),
        )
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      loading.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null

  // Re-fetch immediately when the user picks a new station in settings.
  watch(
    () => settings.station.id,
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

  return { departures, loading, error, lastUpdated, refresh }
}
