import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type {
  LiveMatchState,
  Participant,
  Stage,
  Tournament,
  TournamentDetail,
  TournamentStatus,
} from '@pipod/shared'

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
  api: {
    listTournaments: vi.fn(),
    configurePhases: vi.fn().mockResolvedValue([]),
    startTournament: vi.fn().mockResolvedValue([]),
  },
}))

import { api } from '../api'
import AdminView from './AdminView.vue'

const players: Participant[] = [
  { id: 'pA', tournamentId: 't1', name: 'Anna', seed: null },
  { id: 'pB', tournamentId: 't1', name: 'Ben', seed: null },
]

function setDetail(
  status: TournamentStatus,
  over: Partial<Pick<TournamentDetail, 'participants' | 'stages'>> = {},
): void {
  detail.value = {
    tournament: tournament(status),
    floors: [],
    participants: [],
    stages: [],
    matches: [],
    groups: [],
    ...over,
  }
}

async function mountAdmin(
  listed: TournamentStatus,
  selected: TournamentStatus,
  over: Parameters<typeof setDetail>[1] = {},
) {
  vi.mocked(api.listTournaments).mockResolvedValue([tournament(listed)])
  setDetail(selected, over)
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

describe('AdminView phase setup', () => {
  const knockoutStage: Stage = {
    id: 'ko',
    tournamentId: 't1',
    type: 'knockout',
    bestOf: 5,
    startScore: 301,
    outMode: 'single',
    qualifiersPerGroup: null,
  }

  const toggle = (view: Awaited<ReturnType<typeof mountAdmin>>, phase: string) =>
    view.find(`[data-phase="${phase}"] .phase-toggle input`)

  it('offers both phases, on, for a tournament without a setup', async () => {
    const view = await mountAdmin('setup', 'setup')
    expect((toggle(view, 'group').element as HTMLInputElement).checked).toBe(true)
    expect((toggle(view, 'knockout').element as HTMLInputElement).checked).toBe(true)
  })

  it('shows the saved setup', async () => {
    const view = await mountAdmin('setup', 'setup', { stages: [knockoutStage] })
    expect((toggle(view, 'group').element as HTMLInputElement).checked).toBe(false)
    expect((toggle(view, 'knockout').element as HTMLInputElement).checked).toBe(true)
  })

  it('explains why it cannot start with every phase off', async () => {
    const view = await mountAdmin('setup', 'setup', { participants: players })
    await toggle(view, 'group').setValue(false)
    await toggle(view, 'knockout').setValue(false)

    expect(view.text()).toContain('Mindestens eine Phase muss aktiv sein.')
  })

  it('starts with what the form shows, in one request', async () => {
    const view = await mountAdmin('setup', 'setup', { participants: players })
    await view.find('.tournament-list button').trigger('click')
    await flushPromises()
    await toggle(view, 'group').setValue(false)

    const start = view.findAll('button').find((b) => b.text() === 'Turnier starten')!
    await start.trigger('click')
    await flushPromises()

    expect(api.startTournament).toHaveBeenCalledWith('t1', {
      group: null,
      knockout: { bestOf: 3, startScore: 501, outMode: 'double', qualifiersPerGroup: 2 },
    })
    expect(api.configurePhases).not.toHaveBeenCalled()
  })

  it('edits a phase rule through the shared card', async () => {
    const view = await mountAdmin('setup', 'setup', { participants: players })
    await view.find('.tournament-list button').trigger('click')
    await flushPromises()
    await view.find('[aria-label="Best of K.-o.-Phase"]').setValue('5')

    const start = view.findAll('button').find((b) => b.text() === 'Turnier starten')!
    await start.trigger('click')
    await flushPromises()

    expect(vi.mocked(api.startTournament).mock.calls[0]![1].knockout).toMatchObject({ bestOf: 5 })
  })
})
