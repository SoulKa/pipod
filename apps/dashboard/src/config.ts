import config from '@/../dashboard.config.json'

interface LocationConfig {
  latitude: number
  longitude: number
  name: string
}

interface StationConfig {
  id: number
  name: string
}

interface DashboardConfig {
  location: LocationConfig
  station: StationConfig
}

export default config as DashboardConfig
