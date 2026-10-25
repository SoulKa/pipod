import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { Tournament, TournamentStatus } from '@pipod/shared'

// A stand-in socket: tests fire server events at it and see what the view subscribed to.
type Handler = (payload?: unknown) => void
const handlers = new Map<string, Handler>()
const emitted: string[] = []
vi.mock('../socket', () => ({
  createSocket: () => ({
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    emit: (event: string) => emitted.push(event),
    disconnect: vi.fn(),
  }),
}))

// The overview opens a socket feed; stand it in with a stub that just shows its props.
vi.mock('./OverviewView.vue', () => ({
  default: defineComponent({
    props: { id: String, qrPath: String },
    setup: (props) => () => h('div', { class: 'overview-stub' }, `${props.id} ${props.qrPath}`),
  }),
}))

import LiveView from './LiveView.vue'

function tournament(id: string, status: TournamentStatus, createdAt: string): Tournament {
  return { id, name: id, status, autoAssign: false, createdAt }
}

/** Mount, connect, and deliver one tournament list from the server. */
async function mountWith(list: Tournament[]) {
  const wrapper = mount(LiveView)
  handlers.get('connect')!()
  handlers.get('tournaments:list')!(list)
  await flushPromises()
  return wrapper
}

describe('LiveView', () => {
  it('subscribes to the tournament list once connected', async () => {
    emitted.length = 0
    const wrapper = await mountWith([])
    expect(emitted).toEqual(['tournaments:subscribe'])
    wrapper.unmount()
  })

  it('follows the newest active tournament and links the QR code to /', async () => {
    const wrapper = await mountWith([
      tournament('old-active', 'active', '2026-01-01T00:00:00Z'),
      tournament('new-active', 'active', '2026-02-01T00:00:00Z'),
      tournament('newest-setup', 'setup', '2026-03-01T00:00:00Z'),
    ])

    expect(wrapper.find('.overview-stub').text()).toBe('new-active /')
    wrapper.unmount()
  })

  it('falls back to the newest tournament when none is active', async () => {
    const wrapper = await mountWith([
      tournament('done', 'completed', '2026-01-01T00:00:00Z'),
      tournament('later', 'cancelled', '2026-02-01T00:00:00Z'),
    ])

    expect(wrapper.find('.overview-stub').text()).toBe('later /')
    wrapper.unmount()
  })

  it('switches the moment a pushed list shows a tournament starting', async () => {
    const wrapper = await mountWith([tournament('done', 'completed', '2026-01-01T00:00:00Z')])

    handlers.get('tournaments:list')!([
      tournament('done', 'completed', '2026-01-01T00:00:00Z'),
      tournament('fresh', 'active', '2026-02-01T00:00:00Z'),
    ])
    await flushPromises()

    expect(wrapper.find('.overview-stub').text()).toBe('fresh /')
    wrapper.unmount()
  })

  it('shows the idle board while there is no tournament yet', async () => {
    const wrapper = await mountWith([])

    expect(wrapper.find('.overview-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('Noch kein Turnier')
    expect(wrapper.find('.idle--offline').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the idle board as offline when the connection drops', async () => {
    const wrapper = await mountWith([])

    handlers.get('disconnect')!()
    await flushPromises()

    expect(wrapper.find('.idle--offline').exists()).toBe(true)
    expect(wrapper.text()).toContain('Verbindung getrennt')
    wrapper.unmount()
  })
})
