// Tabs of the single-screen viewer on a big display: one per phase plus the players (and
// the table, when no group phase already shows it).
// It follows the phase being played, and can rotate on its own, since the laptop driving
// the TV is rarely within reach.
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { Match, Stage } from '@pipod/shared'

export const PLAYERS_TAB = 'players'
export const TABLE_TAB = 'table'
export const ROTATE_MS = 20_000
const ROTATE_KEY = 'pipod.viewer.autoRotate'

/** The phase being played: the bracket once it is drawn, else the first phase. */
export function currentPhaseTab(stages: Stage[], matches: Match[]): string | null {
  const knockout = stages.find((s) => s.type === 'knockout')
  if (knockout && matches.some((m) => m.stageId === knockout.id)) return knockout.id
  return stages[0]?.id ?? null
}

// A per-display convenience: an unreadable storage just means rotation starts off.
function loadAutoRotate(): boolean {
  try {
    return localStorage.getItem(ROTATE_KEY) === '1'
  } catch {
    return false
  }
}

function saveAutoRotate(on: boolean): void {
  try {
    localStorage.setItem(ROTATE_KEY, on ? '1' : '0')
  } catch {
    // Not remembered across reloads, which is all this costs.
  }
}

export function useViewerTabs(opts: {
  tabs: () => string[]
  current: () => string | null
  /** Off while the tabs aren't on screen, so nothing rotates out of sight. */
  enabled: () => boolean
}) {
  const picked = ref<string | null>(null)

  const active = computed(() => {
    const tabs = opts.tabs()
    if (picked.value && tabs.includes(picked.value)) return picked.value
    const current = opts.current()
    return current && tabs.includes(current) ? current : (tabs[0] ?? null)
  })

  // A new phase starting is news, so it wins over a tab picked earlier.
  watch(opts.current, () => (picked.value = null))

  const autoRotate = ref(loadAutoRotate())
  /** Bumped whenever a rotation interval starts, so its progress bar restarts too. */
  const cycle = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule(): void {
    clearTimeout(timer)
    timer = undefined
    if (!autoRotate.value || !opts.enabled() || opts.tabs().length < 2) return
    cycle.value++
    timer = setTimeout(advance, ROTATE_MS)
  }

  function advance(): void {
    const tabs = opts.tabs()
    picked.value = tabs[(tabs.indexOf(active.value ?? '') + 1) % tabs.length] ?? null
    schedule()
  }

  /** A tab picked by hand stays up for a full interval before rotation moves on. */
  function select(tab: string): void {
    picked.value = tab
    schedule()
  }

  function toggleAutoRotate(): void {
    autoRotate.value = !autoRotate.value
    saveAutoRotate(autoRotate.value)
    schedule()
  }

  watch(() => opts.enabled() && opts.tabs().length >= 2, schedule, { immediate: true })
  onScopeDispose(() => clearTimeout(timer))

  return { active, select, autoRotate, toggleAutoRotate, cycle }
}
