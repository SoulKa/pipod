import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { LiveMatchState, Match } from '@pipod/shared'
import BracketTree from './BracketTree.vue'

// happy-dom has no layout engine and so no scrollIntoView; the auto-scroll behaviour
// is asserted through this stub.
const scrollIntoView = vi.fn()
beforeEach(() => {
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
})

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

const NAMES: Record<string, string> = { pA: 'Anna', pB: 'Ben', pC: 'Cara', pD: 'Dee' }
const nameOf = (id: string | null) => (id ? (NAMES[id] ?? '—') : '—')

/** A four-player bracket: two semi-finals feeding one final. */
function semisAndFinal(over: { final?: Partial<Match> } = {}): Match[] {
  return [
    match({ id: 's0', round: 0, slot: 0, participantAId: 'pA', participantBId: 'pB' }),
    match({ id: 's1', round: 0, slot: 1, participantAId: 'pC', participantBId: 'pD' }),
    match({ id: 'f', round: 1, slot: 0, status: 'pending', ...over.final }),
  ]
}

function mountTree(matches: Match[], live = new Map<string, LiveMatchState>()) {
  return mount(BracketTree, { props: { matches, nameOf, live } })
}

describe('BracketTree rendering', () => {
  it('renders one row per round, labelled from the final backwards', () => {
    const tree = mountTree(semisAndFinal())
    expect(tree.findAll('.round-label').map((n) => n.text())).toEqual(['Halbfinale', 'Finale'])
  })

  it('shows both participants of a match, with unfilled slots as a dash', () => {
    const tree = mountTree(semisAndFinal())
    const semi = tree.findAll('.match')[0]!
    expect(semi.text()).toContain('Anna')
    expect(semi.text()).toContain('Ben')
    // The final has no participants yet.
    expect(
      tree
        .findAll('.match')
        .at(-1)!
        .findAll('.pname')
        .map((n) => n.text()),
    ).toEqual(['—', '—'])
  })

  it('marks the winning side of a decided match', () => {
    const matches = semisAndFinal()
    matches[0] = { ...matches[0]!, status: 'completed', winnerId: 'pA', legsA: 2, legsB: 1 }
    const tree = mountTree(matches)

    const sides = tree.findAll('.match')[0]!.findAll('.side')
    expect(sides[0]!.classes()).toContain('win')
    expect(sides[1]!.classes()).not.toContain('win')
  })

  it('crowns the champion once the final is decided', () => {
    const open = mountTree(semisAndFinal())
    expect(open.find('.champion').exists()).toBe(false)

    const decided = mountTree(
      semisAndFinal({
        final: { status: 'completed', winnerId: 'pA', participantAId: 'pA', participantBId: 'pC' },
      }),
    )
    expect(decided.find('.champion').text()).toContain('Anna')
  })

  it('prefers the live mirror over persisted legs for a live match', () => {
    const matches = semisAndFinal()
    matches[0] = { ...matches[0]!, status: 'live', legsA: 0, legsB: 0 }
    const live = new Map<string, LiveMatchState>([
      [
        's0',
        {
          matchId: 's0',
          legIndex: 0,
          currentParticipantId: 'pA',
          scores: [],
          legsA: 2,
          legsB: 1,
        },
      ],
    ])
    const tree = mountTree(matches, live)

    const legs = tree.findAll('.match')[0]!.findAll('.legs')
    expect(legs.map((n) => n.text())).toEqual(['2', '1'])
    expect(tree.findAll('.match')[0]!.classes()).toContain('match--live')
  })

  it('draws one connector elbow per downstream match', () => {
    const tree = mountTree(semisAndFinal())
    // One gap (semis → final) holding a single join for the one final.
    expect(tree.findAll('.gap')).toHaveLength(1)
    expect(tree.findAll('.gap-join .join')).toHaveLength(1)
  })

  it('renders nothing for a stage with no matches', () => {
    const tree = mountTree([])
    expect(tree.findAll('.round')).toHaveLength(0)
  })
})

describe('BracketTree auto-scroll', () => {
  it('scrolls to the round in play on mount', async () => {
    const matches = semisAndFinal()
    matches[0] = { ...matches[0]!, status: 'completed', winnerId: 'pA' }
    matches[1] = { ...matches[1]!, status: 'completed', winnerId: 'pC' }
    matches[2] = { ...matches[2]!, status: 'ready', participantAId: 'pA', participantBId: 'pC' }

    mountTree(matches)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('scrolls again when the active round advances, but not on every match change', async () => {
    const tree = mountTree(semisAndFinal())
    await new Promise((resolve) => setTimeout(resolve, 0))
    scrollIntoView.mockClear()

    // A semi finishes: still round 0 in play, so the view is left alone.
    const half = semisAndFinal()
    half[0] = { ...half[0]!, status: 'completed', winnerId: 'pA' }
    await tree.setProps({ matches: half })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scrollIntoView).not.toHaveBeenCalled()

    // Both semis done: the final is now the active round.
    const advanced = half.map((m) =>
      m.round === 0 ? { ...m, status: 'completed' as const, winnerId: 'pA' } : m,
    )
    await tree.setProps({ matches: advanced })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
