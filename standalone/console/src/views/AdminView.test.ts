import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { LiveMatchState, Tournament, TournamentStatus } from '@pipod/shared'
import type { TournamentDetail } from '../api'

const tournament = (status: TournamentStatus): Tournament => ({
  id: 't1',
  name: 'Cup',
  status,
  autoAssign: false,
  createdAt: 'now',
})

const detail = ref<TournamentDetail | null>(null)
const openSpy = vi.fn()

vi.mock('../feed', () => ({
  useTournamentFeed: () => ({
    detail,
    standings: ref([]),
    live: ref(new Map<string, LiveMatchState>()),
    connected: ref(true),
    open: openSpy,
    close: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../api', () => ({
  api: { listTournaments: vi.fn() },
}))

import { api } from '../api'
import AdminView from './AdminView.vue'

function setDetail(status: TournamentStatus): void {
  detail.value = {
    tournament: tournament(status),
    floors: [],
    participants: [],
    stages: [],
    matches: [],
    groups: [],
  }
}

async function mountAdmin(listed: TournamentStatus, selected: TournamentStatus) {
  vi.mocked(api.listTournaments).mockResolvedValue([tournament(listed)])
  setDetail(selected)
  const view = mount(AdminView, {
    global: { stubs: { RouterLink: true, ScheduleBoard: true } },
  })
  await flushPromises()
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminView tournament status', () => {
  it('shows the finished state in the header once the tournament completes', async () => {
    const view = await mountAdmin('active', 'completed')
    expect(view.find('.status').text()).toBe('Abgeschlossen')
  })

  it('marks the finished state distinctly from a running one', async () => {
    const done = await mountAdmin('completed', 'completed')
    expect(done.find('.status').classes()).toContain('status--completed')

    const running = await mountAdmin('active', 'active')
    expect(running.find('.status').classes()).not.toContain('status--completed')
  })

  it('keeps the rail list in step with the live feed when a tournament finishes', async () => {
    // The list was fetched while the tournament was still running; the feed has since
    // reported it finished, so the rail must not keep advertising "Aktiv".
    const view = await mountAdmin('active', 'active')
    expect(view.find('.tournament-list button small').text()).toBe('Aktiv')

    setDetail('completed')
    await flushPromises()

    expect(view.find('.tournament-list button small').text()).toBe('Abgeschlossen')
  })
})
