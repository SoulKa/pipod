import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { mount, RouterLinkStub } from '@vue/test-utils'
import type { LogLine } from '@pipod/shared'

const lines = ref<LogLine[]>([])
const start = vi.fn()
const stop = vi.fn()
const clear = vi.fn()

// The shell owns the log feed's lifecycle; stub it so the drawer can be driven directly.
vi.mock('./serverLogs', () => ({
  useServerLogs: () => ({ lines, connected: ref(true), start, stop, clear }),
}))

// The shell picks its layout from the current route; a console page unless a test says
// otherwise.
const route = reactive({
  matched: [{}],
  meta: {} as { bare?: boolean },
  name: undefined as string | undefined,
  params: {} as Record<string, string>,
})
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => route,
}))

import App from './App.vue'

function line(seq: number, level: LogLine['level']): LogLine {
  return { seq, time: '2026-08-08T10:00:00.000Z', level, message: `line ${seq}` }
}

function render(buffered: LogLine[] = []) {
  lines.value = buffered
  return mount(App, { global: { stubs: { RouterLink: true, RouterView: true } } })
}

describe('App', () => {
  beforeEach(() => {
    route.meta = {}
    start.mockClear()
  })

  it('renders a spectator route without the shell and never opens the log feed', () => {
    route.meta = { bare: true }
    const wrapper = render()

    expect(wrapper.find('.console-topbar').exists()).toBe(false)
    expect(wrapper.find('.console-content').exists()).toBe(true)
    expect(start).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('starts the log feed once the operator moves from a viewer to a console page', async () => {
    route.meta = { bare: true }
    const wrapper = render()

    route.meta = {}
    await wrapper.vm.$nextTick()

    expect(start).toHaveBeenCalled()
    expect(wrapper.find('.console-topbar').exists()).toBe(true)
    wrapper.unmount()
  })

  it('starts the log feed on mount, before the terminal is ever opened', () => {
    const wrapper = render()

    expect(start).toHaveBeenCalled()
    expect(wrapper.find('.log-terminal').exists()).toBe(false)
  })

  it('toggles the terminal from the topbar button', async () => {
    const wrapper = render([line(1, 'info')])

    await wrapper.find('.console-logs-toggle').trigger('click')
    expect(wrapper.find('.log-terminal').exists()).toBe(true)

    await wrapper.find('.console-logs-toggle').trigger('click')
    expect(wrapper.find('.log-terminal').exists()).toBe(false)
  })

  it('toggles on Ctrl+` and closes on Escape', async () => {
    const wrapper = render()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', ctrlKey: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.log-terminal').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.log-terminal').exists()).toBe(false)
  })

  it('badges problems that arrived while the terminal was closed', async () => {
    const wrapper = render([line(1, 'info'), line(2, 'warn'), line(3, 'error')])
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.console-logs-badge').text()).toBe('2')

    // Opening it marks everything as seen, so the badge is gone when it closes again.
    await wrapper.find('.console-logs-toggle').trigger('click')
    await wrapper.find('.console-logs-toggle').trigger('click')
    expect(wrapper.find('.console-logs-badge').exists()).toBe(false)
  })

  it('clears through the feed the drawer does not own', async () => {
    const wrapper = render([line(1, 'info')])
    await wrapper.find('.console-logs-toggle').trigger('click')

    await wrapper.findAll('.log-actions button')[1]?.trigger('click')

    expect(clear).toHaveBeenCalled()
  })

  it('points "Live" at the viewer of the tournament open in the admin view', async () => {
    const wrapper = mount(App, {
      global: { stubs: { RouterLink: RouterLinkStub, RouterView: true } },
    })
    const live = () =>
      wrapper.findAllComponents(RouterLinkStub).find((link) => link.text() === 'Live')!

    expect(live().props('to')).toBe('/')
    Object.assign(route, { name: 'admin', params: { id: 't1' } })
    await wrapper.vm.$nextTick()
    expect(live().props('to')).toBe('/view/t1')

    Object.assign(route, { name: undefined, params: {} })
    wrapper.unmount()
  })
})
