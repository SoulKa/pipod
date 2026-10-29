import { describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { ref } from 'vue'
import type {
  LiveMatchState,
  Match,
  Stage,
  TournamentDetail,
  TournamentStatus,
} from '@pipod/shared'

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
    participant: (id: string | null) => detail.value?.participants.find((p) => p.id === id),
    nameOf: (id: string | null) => detail.value?.participants.find((p) => p.id === id)?.name ?? '—',
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

const rules = { tournamentId: 't1', bestOf: 3, startScore: 501, outMode: 'double' } as const

/** The knockout phase, or with `group` the group phase before it. */
function stage(kind: 'knockout' | 'group' = 'knockout'): Stage {
  return kind === 'group'
    ? { id: 'g', type: 'group', groupCount: 1, ...rules }
    : { id: 'ko', type: 'knockout', qualifiersPerGroup: null, ...rules }
}

function setDetail(status: TournamentStatus, stages: Stage[], matches: Match[]): void {
  detail.value = {
    tournament: { id: 't1', name: 'Cup', status, autoAssign: false, createdAt: 'now' },
    floors: [],
    participants: [
      { id: 'pA', tournamentId: 't1', name: 'Anna', seed: 1, avatar: null },
      { id: 'pB', tournamentId: 't1', name: 'Ben', seed: 2, avatar: null },
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
      [stage('group'), stage()],
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

  it('shows the idle board while nothing is live in a running tournament', () => {
    setDetail('active', [stage()], [match({ id: 'k1' })])
    const view = mount(OverviewView, { props: { id: 't1' } })

    expect(view.find('.live-empty .idle').exists()).toBe(true)
    expect(view.find('.live-empty').text()).toContain('Warte auf das erste Match')
    expect(view.find('.live-zone').text()).toContain('Warten auf ein Board')
  })

  it('waits for the next match once a result is in, but not for a bye', () => {
    const bye = match({ id: 'bye', status: 'completed', participantAId: 'pA', winnerId: 'pA' })
    const next = match({ id: 'k2', participantAId: 'pA', participantBId: 'pB' })
    setDetail('active', [stage()], [bye, next])
    const byeOnly = mount(OverviewView, { props: { id: 't1' } })
    expect(byeOnly.find('.live-empty').text()).toContain('Warte auf das erste Match')

    setDetail('active', [stage()], [{ ...decidedFinal(), legsA: 2 }, next])
    const played = mount(OverviewView, { props: { id: 't1' } })
    expect(played.find('.live-empty').text()).toContain('Warte auf das nächste Match')
  })

  it('names phases by their type and says when the bracket gets drawn', () => {
    setDetail('active', [stage('group'), stage()], [match({ id: 'g1', stageId: 'g' })])
    const view = mount(OverviewView, { props: { id: 't1' } })

    const headings = view.findAll('.stage-card h3').map((h) => h.text())
    expect(headings).toEqual(['Gruppenphase', 'K.-o.-Phase'])
    expect(view.text()).toContain('Wird nach der Gruppenphase aus der Tabelle ausgelost.')
  })

  it('links every player to their profile so they can set a picture', () => {
    setDetail('active', [stage()], [])
    const view = mount(OverviewView, {
      props: { id: 't1' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    const links = view
      .findAllComponents(RouterLinkStub)
      .filter((link) => link.element.closest('.player-grid'))
    expect(links.map((link) => link.props('to'))).toEqual([
      { name: 'player', params: { id: 't1', participantId: 'pA' } },
      { name: 'player', params: { id: 't1', participantId: 'pB' } },
    ])
  })
})
