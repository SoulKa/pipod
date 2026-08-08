import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import GameScreen from '../GameScreen.vue'
import FireworksCanvas from '../FireworksCanvas.vue'
import LemonBurst from '../LemonBurst.vue'
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
