import { DEFAULT_OPTIONS, START_SCORES, type OutMode } from './useDartGame'

// Bumped if the stored shape ever changes incompatibly.
const KEY = 'pi-darts.setup.v1'

export interface StoredRosterEntry {
  name: string
  selected: boolean
}

export interface StoredSetup {
  roster: StoredRosterEntry[]
  startScore: number
  outMode: OutMode
}

// Load the last-used setup, or null when absent / corrupt / storage unavailable.
export function loadSetup(): StoredSetup | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.roster)) return null

    const roster: StoredRosterEntry[] = data.roster
      .filter((e: unknown): e is { name: string; selected?: unknown } =>
        typeof (e as { name?: unknown })?.name === 'string',
      )
      .map((e: { name: string; selected?: unknown }) => ({
        name: e.name,
        selected: e.selected !== false,
      }))

    const startScore = (START_SCORES as readonly number[]).includes(data.startScore)
      ? (data.startScore as number)
      : DEFAULT_OPTIONS.startScore
    const outMode: OutMode = data.outMode === 'double' ? 'double' : 'single'

    return { roster, startScore, outMode }
  } catch {
    return null
  }
}

// Persist the setup; silently ignores quota / unavailable-storage errors.
export function saveSetup(setup: StoredSetup): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup))
  } catch {
    // storage unavailable or full — nothing we can do, drop the write.
  }
}
