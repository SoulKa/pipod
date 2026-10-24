import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { Tournament, TournamentStatus } from '@pipod/shared'

const listTournaments = vi.fn<() => Promise<Tournament[]>>()
vi.mock('../api', () => ({ api: { listTournaments: () => listTournaments() } }))

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

describe('LiveView', () => {
  it('follows the newest active tournament and links the QR code to /', async () => {
    listTournaments.mockResolvedValue([
      tournament('old-active', 'active', '2026-01-01T00:00:00Z'),
      tournament('new-active', 'active', '2026-02-01T00:00:00Z'),
      tournament('newest-setup', 'setup', '2026-03-01T00:00:00Z'),
    ])
    const wrapper = mount(LiveView)
    await flushPromises()

    expect(wrapper.find('.overview-stub').text()).toBe('new-active /')
    wrapper.unmount()
  })

  it('falls back to the newest tournament when none is active', async () => {
    listTournaments.mockResolvedValue([
      tournament('done', 'completed', '2026-01-01T00:00:00Z'),
      tournament('later', 'cancelled', '2026-02-01T00:00:00Z'),
    ])
    const wrapper = mount(LiveView)
    await flushPromises()

    expect(wrapper.find('.overview-stub').text()).toBe('later /')
    wrapper.unmount()
  })

  it('shows a waiting message when there is no tournament yet', async () => {
    listTournaments.mockResolvedValue([])
    const wrapper = mount(LiveView)
    await flushPromises()

    expect(wrapper.find('.overview-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('Noch kein Turnier')
    wrapper.unmount()
  })
})
