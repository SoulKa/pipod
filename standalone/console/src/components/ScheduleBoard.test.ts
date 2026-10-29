import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { Floor, LiveMatchState, Match, Participant, TournamentDetail } from '@pipod/shared'

// ScheduleBoard drives the server-side scheduler through the REST client and renders match
// cards inside a drag-and-drop list. Mock the api so we can assert calls, and stub the
// draggable (keeping its default slot) so cards still render without SortableJS/DOM drag.
vi.mock('../api', () => ({
  api: {
    autoAssign: vi.fn().mockResolvedValue({ ok: true }),
    setAutoFill: vi.fn().mockResolvedValue({}),
    assignMatchFloor: vi.fn().mockResolvedValue({}),
    reorderFloorQueue: vi.fn().mockResolvedValue({ ok: true }),
  },
}))

import { api } from '../api'
import ScheduleBoard from './ScheduleBoard.vue'

function match(over: Partial<Match> = {}): Match {
  return {
    id: 'm',
    tournamentId: 't1',
    stageId: 's1',
    groupId: null,
    round: 0,
    slot: 0,
    participantAId: null,
    participantBId: null,
    bestOf: 3,
    startScore: 501,
    outMode: 'double',
    floorId: null,
    queueOrder: 0,
    status: 'ready',
    legsA: 0,
    legsB: 0,
    winnerId: null,
    nextMatchId: null,
    nextSlot: null,
    ...over,
  }
}

const floor: Floor = { id: 'f1', tournamentId: 't1', name: 'Field 1' }
const participants: Participant[] = [
  { id: 'pA', tournamentId: 't1', name: 'Alice', seed: null },
  { id: 'pB', tournamentId: 't1', name: 'Bob', seed: null },
]

function detail(over: Partial<TournamentDetail> = {}): TournamentDetail {
  return {
    tournament: { id: 't1', name: 'Cup', status: 'active', autoAssign: false, createdAt: 'now' },
    floors: [floor],
    participants,
    stages: [
      {
        id: 's1',
        tournamentId: 't1',
        type: 'group',
        bestOf: 3,
        startScore: 501,
        outMode: 'double',
        groupCount: 1,
      },
    ],
    matches: [
      match({ id: 'backlog1', participantAId: 'pA', participantBId: 'pB' }),
      match({
        id: 'live1',
        participantAId: 'pA',
        participantBId: 'pB',
        floorId: 'f1',
        status: 'live',
      }),
    ],
    groups: [],
    ...over,
  }
}

function mountBoard(d: TournamentDetail = detail(), live = new Map<string, LiveMatchState>()) {
  return mount(ScheduleBoard, {
    props: { detail: d, live },
    // Render the draggable's slot so match cards appear, but skip real SortableJS behaviour.
    global: { stubs: { VueDraggable: { template: '<div class="dnd"><slot /></div>' } } },
  })
}

beforeEach(() => {
  vi.mocked(api.autoAssign).mockResolvedValue({ ok: true })
  vi.mocked(api.setAutoFill).mockResolvedValue({} as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ScheduleBoard rendering', () => {
  it('shows the floor column, the backlog count, and matchup names', () => {
    const board = mountBoard()
    const text = board.text()
    expect(text).toContain('Field 1')
    expect(text).toContain('Alice')
    expect(text).toContain('Bob')
    // One ready match sits unassigned in the backlog.
    expect(board.find('.col-count').text()).toBe('1')
  })

  it('prefers the live-score mirror over the persisted match legs', () => {
    const live = new Map<string, LiveMatchState>([
      [
        'live1',
        {
          matchId: 'live1',
          legIndex: 0,
          currentParticipantId: 'pA',
          scores: [],
          legsA: 2,
          legsB: 1,
        },
      ],
    ])
    const board = mountBoard(detail(), live)
    expect(board.find('.card-live .score').text()).toBe('2–1')
  })
})

describe('ScheduleBoard scheduler actions', () => {
  it('runs auto-assign and asks the parent to refresh', async () => {
    const board = mountBoard()
    await board.find('.pd-button--primary').trigger('click')
    await flushPromises()

    expect(api.autoAssign).toHaveBeenCalledWith('t1')
    expect(board.emitted('refresh')).toHaveLength(1)
  })

  it('toggles auto-fill through the api', async () => {
    const board = mountBoard()
    await board.find('.autofill-toggle input').setValue(true)
    await flushPromises()

    expect(api.setAutoFill).toHaveBeenCalledWith('t1', true)
  })

  it('emits an error when a scheduler call fails', async () => {
    vi.mocked(api.autoAssign).mockRejectedValueOnce(new Error('scheduler offline'))
    const board = mountBoard()

    await board.find('.pd-button--primary').trigger('click')
    await flushPromises()

    expect(board.emitted('error')).toEqual([['scheduler offline']])
    // The finally-block still reconciles with the server.
    expect(board.emitted('refresh')).toHaveLength(1)
  })
})
