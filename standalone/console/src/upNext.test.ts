import { describe, expect, it } from 'vitest'
import type { Match } from '@pipod/shared'
import { upNextMatches } from './upNext'

const m = (over: Partial<Match>): Match =>
  ({
    id: 'm',
    status: 'ready',
    participantAId: 'a',
    participantBId: 'b',
    floorId: null,
    queueOrder: 0,
    round: 0,
    slot: 0,
    ...over,
  }) as Match

describe('upNextMatches', () => {
  it('puts queued matches first, in queue order, then the backlog', () => {
    const ids = upNextMatches([
      m({ id: 'backlog', queueOrder: 0 }),
      m({ id: 'second', floorId: 'f1', queueOrder: 2 }),
      m({ id: 'first', floorId: 'f2', queueOrder: 1 }),
    ]).map((x) => x.id)

    expect(ids).toEqual(['first', 'second', 'backlog'])
  })

  it('leaves out running, finished and not yet decided matches', () => {
    const ids = upNextMatches([
      m({ id: 'live', status: 'live' }),
      m({ id: 'done', status: 'completed' }),
      m({ id: 'pending', status: 'pending', participantBId: null }),
      m({ id: 'ready' }),
    ]).map((x) => x.id)

    expect(ids).toEqual(['ready'])
  })
})
