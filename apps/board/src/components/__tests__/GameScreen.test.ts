import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import GameScreen from '../GameScreen.vue'
import FireworksCanvas from '../FireworksCanvas.vue'
import LemonBurst from '../LemonBurst.vue'
import WowPopup from '../WowPopup.vue'
import { CELEBRATION_CLIPS } from '../../effects/celebrationClips'
import { DEFAULT_OPTIONS, type Player } from '../../game/useDartGame'

const players: Player[] = [
  { name: 'Ann', score: 0, history: [] },
  { name: 'Bob', score: 120, history: [] },
]

function mountScreen(overrides: Record<string, unknown> = {}) {
  return mount(GameScreen, {
    props: {
      options: DEFAULT_OPTIONS,
      players,
      currentPlayerIndex: 0,
      currentThrows: [],
      finishOrder: [0],
      isGameOver: false,
      showBanner: false,
      canUndo: true,
      checkoutRoutes: [],
      standings: players,
      bannerIndex: 0,
      lemonTurns: 0,
      bigDarts: 0,
      ...overrides,
    },
  })
}

describe('GameScreen celebration', () => {
  it('has no fireworks while the game is still being played', () => {
    const wrapper = mountScreen()
    expect(wrapper.findComponent(FireworksCanvas).exists()).toBe(false)
  })

  it('celebrates a player checking out mid-game', () => {
    const wrapper = mountScreen({ showBanner: true })
    expect(wrapper.findComponent(FireworksCanvas).exists()).toBe(true)
  })

  it('celebrates the end of the game', () => {
    const wrapper = mountScreen({ showBanner: true, isGameOver: true })
    expect(wrapper.findComponent(FireworksCanvas).exists()).toBe(true)
  })

  it('keeps the fireworks from swallowing taps meant for the result buttons', () => {
    const wrapper = mountScreen({ showBanner: true })
    expect(wrapper.findComponent(FireworksCanvas).classes()).toContain('fireworks')
  })
})

describe('GameScreen lemons', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows nothing while no lemon has been thrown', () => {
    const wrapper = mountScreen()
    expect(wrapper.findComponent(LemonBurst).exists()).toBe(false)
  })

  it('rains lemons when the tally goes up', async () => {
    const wrapper = mountScreen()
    await wrapper.setProps({ lemonTurns: 1 })
    expect(wrapper.findComponent(LemonBurst).exists()).toBe(true)
  })

  it('clears itself without needing a tap', async () => {
    const wrapper = mountScreen()
    await wrapper.setProps({ lemonTurns: 1 })

    // Generous, so the assertion is about clearing itself rather than the exact tuning.
    vi.advanceTimersByTime(30_000)
    await nextTick()

    expect(wrapper.findComponent(LemonBurst).exists()).toBe(false)
  })

  it('restarts for a second lemon instead of staying dismissed', async () => {
    const wrapper = mountScreen()
    await wrapper.setProps({ lemonTurns: 1 })
    // Generous, so the assertion is about clearing itself rather than the exact tuning.
    vi.advanceTimersByTime(30_000)
    await nextTick()

    await wrapper.setProps({ lemonTurns: 2 })

    expect(wrapper.findComponent(LemonBurst).exists()).toBe(true)
  })
})

describe('GameScreen wow popup', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows nothing before a big dart', () => {
    const wrapper = mountScreen()
    expect(wrapper.findComponent(WowPopup).exists()).toBe(false)
  })

  it('pops up when the tally goes up', async () => {
    const wrapper = mountScreen()
    await wrapper.setProps({ bigDarts: 1 })
    expect(wrapper.findComponent(WowPopup).exists()).toBe(true)
  })

  it('clears itself without needing a tap', async () => {
    const wrapper = mountScreen()
    await wrapper.setProps({ bigDarts: 1 })

    vi.advanceTimersByTime(30_000)
    await nextTick()

    expect(wrapper.findComponent(WowPopup).exists()).toBe(false)
  })

  it('holds each clip for its own duration, not a shared one', async () => {
    const [first, second] = CELEBRATION_CLIPS
    expect(first!.durationMs).not.toBe(second!.durationMs)
    const shorter = first!.durationMs < second!.durationMs ? first! : second!
    const longer = shorter === first! ? second! : first!

    const pick = vi.spyOn(Math, 'random')
    // Mid-bucket, so forcing a clip stays correct however many are registered.
    const force = (clip: (typeof CELEBRATION_CLIPS)[number]) =>
      pick.mockReturnValue((CELEBRATION_CLIPS.indexOf(clip) + 0.5) / CELEBRATION_CLIPS.length)

    // The short clip must be gone on its own schedule, not the long one's.
    force(shorter)
    const quick = mountScreen()
    await quick.setProps({ bigDarts: 1 })
    expect(quick.findComponent(WowPopup).props('clip')).toBe(shorter)

    vi.advanceTimersByTime(shorter.durationMs + 1)
    await nextTick()
    expect(quick.findComponent(WowPopup).exists()).toBe(false)

    // The long clip must still be up at that same moment.
    force(longer)
    const slow = mountScreen()
    await slow.setProps({ bigDarts: 1 })
    expect(slow.findComponent(WowPopup).props('clip')).toBe(longer)

    vi.advanceTimersByTime(shorter.durationMs + 1)
    await nextTick()
    expect(slow.findComponent(WowPopup).exists()).toBe(true)

    vi.advanceTimersByTime(longer.durationMs)
    await nextTick()
    expect(slow.findComponent(WowPopup).exists()).toBe(false)
  })

  it('replays from the first frame on the next big dart', async () => {
    const wrapper = mountScreen()
    await wrapper.setProps({ bigDarts: 1 })
    const first = wrapper.findComponent(WowPopup).element

    await wrapper.setProps({ bigDarts: 2 })

    // A fresh element, so the GIF restarts rather than continuing mid-loop.
    expect(wrapper.findComponent(WowPopup).element).not.toBe(first)
  })
})
