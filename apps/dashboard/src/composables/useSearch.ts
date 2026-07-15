import { VVS_BASE } from '@/composables/useTrains'

export interface CityResult {
  name: string
  latitude: number
  longitude: number
  // Display label combining the place with its region/country to disambiguate same-named cities.
  label: string
}

export interface StationResult {
  // The numeric VVS stopID that XML_DM_REQUEST expects (see useTrains).
  id: number
  name: string
}

interface GeocodingResponse {
  results?: Array<{
    name: string
    latitude: number
    longitude: number
    admin1?: string
    country?: string
  }>
}

interface StopFinderResponse {
  locations?: Array<{
    name: string
    type?: string
    properties?: { stopId?: string }
  }>
}

// Open-Meteo geocoding. Sends CORS headers like the forecast API, so it's called directly (no
// proxy) in both dev and the packaged launcher. Returns [] on empty query or any failure.
export async function searchCities(query: string): Promise<CityResult[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const params = new URLSearchParams({
      name: q,
      count: '8',
      language: 'de',
      format: 'json',
    })
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`)
    if (!response.ok) return []
    const data = (await response.json()) as GeocodingResponse
    return (data.results ?? []).map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    }))
  } catch {
    return []
  }
}

// VVS stop finder. Reuses VVS_BASE so dev goes through the `/api/vvs` proxy and prod hits the host
// directly. Keeps only stop-type results that carry the numeric stopId our departure query needs.
export async function searchStations(query: string): Promise<StationResult[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const params = new URLSearchParams({
      outputFormat: 'rapidJSON',
      type_sf: 'any',
      name_sf: q,
      useRealtime: '1',
    })
    const response = await fetch(`${VVS_BASE}/XML_STOPFINDER_REQUEST?${params}`)
    if (!response.ok) return []
    const data = (await response.json()) as StopFinderResponse
    return (data.locations ?? [])
      .filter((l) => l.type === 'stop' && l.properties?.stopId)
      .map((l) => ({ id: Number(l.properties!.stopId), name: l.name }))
      .filter((s) => Number.isFinite(s.id))
  } catch {
    return []
  }
}
