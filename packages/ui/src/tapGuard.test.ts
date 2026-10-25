import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, withDirectives } from 'vue'
import { TAP_GUARD_MS, guardTaps, vTapGuard } from './tapGuard'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// A button with its own click handler, guarded either directly or through its container.
function mountGuarded(on: 'button' | 'container') {
  const onClick = vi.fn()
  const Probe = defineComponent(() => () => {
    const button = h('button', { onClick }, 'Game on!')
    const guarded = on === 'button' ? withDirectives(button, [[vTapGuard]]) : button
    const container = h('section', [guarded])
    return on === 'container' ? withDirectives(container, [[vTapGuard]]) : container
  })
  const wrapper = mount(Probe, { attachTo: document.body })
  return { wrapper, onClick, button: wrapper.get('button') }
}

describe('vTapGuard', () => {
  it('swallows a tap right after the element appears', async () => {
    const { button, onClick } = mountGuarded('button')
    await button.trigger('click')

    expect(onClick).not.toHaveBeenCalled()
    expect(button.attributes()).toHaveProperty('data-tap-guard')
  })

  it('lets taps through once the guard has elapsed', async () => {
    const { button, onClick } = mountGuarded('button')
    vi.advanceTimersByTime(TAP_GUARD_MS)
    await button.trigger('click')

    expect(onClick).toHaveBeenCalledOnce()
    expect(button.attributes()).not.toHaveProperty('data-tap-guard')
  })

  it('guards everything inside a guarded container', async () => {
    const { button, onClick } = mountGuarded('container')
    await button.trigger('click')
    expect(onClick).not.toHaveBeenCalled()

    vi.advanceTimersByTime(TAP_GUARD_MS)
    await button.trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('restarts when an element is guarded again', () => {
    const el = document.createElement('button')
    guardTaps(el)
    vi.advanceTimersByTime(TAP_GUARD_MS - 100)
    guardTaps(el)
    vi.advanceTimersByTime(100)

    expect(el.hasAttribute('data-tap-guard')).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('cancels its timer when unmounted early', () => {
    const { wrapper } = mountGuarded('button')
    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
