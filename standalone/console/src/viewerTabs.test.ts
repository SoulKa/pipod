import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { Match, Stage } from '@pipod/shared'
import { currentPhaseTab, PLAYERS_TAB, ROTATE_MS, useViewerTabs } from './viewerTabs'

const rules = { tournamentId: 't1', bestOf: 3, startScore: 501, outMode: 'double' } as const
const group: Stage = { id: 'g', type: 'group', groupCount: 1, ...rules }
const knockout: Stage = { id: 'ko', type: 'knockout', qualifiersPerGroup: null, ...rules }
const matchIn = (stageId: string) => ({ id: `${stageId}-m`, stageId }) as Match

describe('currentPhaseTab', () => {
  it('stays on the group phase until the bracket is drawn', () => {
    expect(currentPhaseTab([group, knockout], [matchIn('g')])).toBe('g')
    expect(currentPhaseTab([group, knockout], [matchIn('g'), matchIn('ko')])).toBe('ko')
  })

  it('takes the only phase there is, or none', () => {
    expect(currentPhaseTab([knockout], [])).toBe('ko')
    expect(currentPhaseTab([], [])).toBeNull()
  })
})

describe('useViewerTabs', () => {
  const scopes: ReturnType<typeof effectScope>[] = []

  function setup(opts: { current?: string | null; enabled?: boolean } = {}) {
    const tabs = ref(['g', 'ko', PLAYERS_TAB])
    const current = ref<string | null>(opts.current ?? 'g')
    const enabled = ref(opts.enabled ?? true)
    const scope = effectScope()
    scopes.push(scope)
    const api = scope.run(() =>
      useViewerTabs({
        tabs: () => tabs.value,
        current: () => current.value,
        enabled: () => enabled.value,
      }),
    )!
    return { ...api, tabs, current, enabled }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    scopes.splice(0).forEach((s) => s.stop())
    vi.useRealTimers()
  })

  it('opens on the current phase and follows it when the next one starts', async () => {
    const t = setup()
    t.select(PLAYERS_TAB)
    expect(t.active.value).toBe(PLAYERS_TAB)

    t.current.value = 'ko'
    await nextTick()
    expect(t.active.value).toBe('ko')
  })

  it('falls back to the first tab when the current phase has none', () => {
    const t = setup({ current: null })
    expect(t.active.value).toBe('g')
  })

  it('rotates only once switched on, and remembers the choice', () => {
    const t = setup()
    vi.advanceTimersByTime(ROTATE_MS)
    expect(t.active.value).toBe('g')

    t.toggleAutoRotate()
    vi.advanceTimersByTime(ROTATE_MS)
    expect(t.active.value).toBe('ko')
    vi.advanceTimersByTime(2 * ROTATE_MS)
    expect(t.active.value).toBe('g')

    expect(setup().autoRotate.value).toBe(true)
  })

  it('gives a tab picked by hand a full interval', () => {
    const t = setup()
    t.toggleAutoRotate()
    vi.advanceTimersByTime(ROTATE_MS - 1000)
    t.select(PLAYERS_TAB)

    vi.advanceTimersByTime(ROTATE_MS - 1)
    expect(t.active.value).toBe(PLAYERS_TAB)
    vi.advanceTimersByTime(1)
    expect(t.active.value).toBe('g')
  })

  it('does not rotate while the tabs are off screen', async () => {
    const t = setup({ enabled: false })
    t.toggleAutoRotate()
    vi.advanceTimersByTime(ROTATE_MS)
    expect(t.active.value).toBe('g')

    t.enabled.value = true
    await nextTick()
    vi.advanceTimersByTime(ROTATE_MS)
    expect(t.active.value).toBe('ko')
  })
})
