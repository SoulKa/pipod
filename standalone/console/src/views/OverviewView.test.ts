import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { LiveMatchState, Match, Stage, TournamentStatus } from '@pipod/shared'
import type { TournamentDetail } from '../api'

// The view only reads the feed; stub it so no socket is opened during the test.
const detail = ref<TournamentDetail | null>(null)
vi.mock('../feed', () => ({
  useTournamentFeed: () => ({
    detail,
    standings: ref([]),
    live: ref(new Map<string, LiveMatchState>()),
    connected: ref(true),
    open: vi.fn(),
    close: vi.fn(),
    refresh: vi.fn(),
  }),
}))

import OverviewView from './OverviewView.vue'

function match(over: Partial<Match> = {}): Match {
  return {
    id: 'm',
    tournamentId: 't1',
    stageId: 'ko',
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

function stage(over: Partial<Stage> = {}): Stage {
  return {
    id: 'ko',
    tournamentId: 't1',
    name: 'K.-o.',
    type: 'knockout',
    format: 'single_elimination',
    order: 0,
    bestOf: 3,
    startScore: 501,
    outMode: 'double',
    ...over,
  }
}

function setDetail(status: TournamentStatus, stages: Stage[], matches: Match[]): void {
  detail.value = {
    tournament: { id: 't1', name: 'Cup', status, autoAssign: false, createdAt: 'now' },
    floors: [],
    participants: [
      { id: 'pA', tournamentId: 't1', name: 'Anna', seed: 1 },
      { id: 'pB', tournamentId: 't1', name: 'Ben', seed: 2 },
    ],
    stages,
    matches,
    groups: [],
  }
}

/** A decided one-match knockout stage. */
const decidedFinal = () =>
  match({
    id: 'f',
    status: 'completed',
    participantAId: 'pA',
    participantBId: 'pB',
    winnerId: 'pA',
  })

describe('OverviewView', () => {
  it('renders knockout stages as a bracket tree and group stages as a list', () => {
    setDetail(
      'active',
      [stage(), stage({ id: 'g', type: 'group', format: 'round_robin', order: 1 })],
      [match({ id: 'k1' }), match({ id: 'g1', stageId: 'g' })],
    )
    const view = mount(OverviewView, { props: { id: 't1' } })

    expect(view.findAll('.round-label').length).toBeGreaterThan(0)
    expect(view.findAll('.match-list')).toHaveLength(1)
  })

  it('announces the champion in the header once the tournament is completed', () => {
    setDetail('completed', [stage()], [decidedFinal()])
    const view = mount(OverviewView, { props: { id: 't1' } })

    expect(view.find('.completed-chip').text()).toContain('Anna')
  })

  it('hides the champion chip while the tournament is still running', () => {
    setDetail('active', [stage()], [match({ id: 'k1' })])
    const view = mount(OverviewView, { props: { id: 't1' } })

    expect(view.find('.completed-chip').exists()).toBe(false)
  })

  it('says the tournament is over rather than waiting for a board', () => {
    setDetail('completed', [stage()], [decidedFinal()])
    const view = mount(OverviewView, { props: { id: 't1' } })

    expect(view.find('.live-empty').text()).toContain('beendet')
    expect(view.find('.live-zone').text()).not.toContain('Warten')
  })

  it('still waits for a board when nothing is live in a running tournament', () => {
    setDetail('active', [stage()], [match({ id: 'k1' })])
    const view = mount(OverviewView, { props: { id: 't1' } })

    expect(view.find('.live-empty').text()).toContain('Aktuell läuft kein Match.')
    expect(view.find('.live-zone').text()).toContain('Warten auf ein Board')
  })
})
