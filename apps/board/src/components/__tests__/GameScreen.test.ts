import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GameScreen from '../GameScreen.vue'
import FireworksCanvas from '../FireworksCanvas.vue'
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
