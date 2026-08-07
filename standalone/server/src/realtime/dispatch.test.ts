import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import {
  addParticipant,
  createFloor,
  createStage,
  createTournament,
  generateStage,
} from '../services/tournaments'
import { assignMatchFloor } from '../services/matches'
import { repo } from '../repo'
import { setupRealtime, dispatchFloorMatch } from './index'
import type { IoServer } from './hub'

/** Records what a floor's board would receive, in order. */
function fakeIo(room: string) {
  const emitted: { event: string; payload: unknown }[] = []
  const io = {
    on: () => io,
    sockets: { adapter: { rooms: new Map([[room, new Set(['socket-1'])]]) } },
    to: () => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ event, payload })
        return true
      },
    }),
  }
  return { io: io as unknown as IoServer, emitted }
}

describe('dispatchFloorMatch', () => {
  beforeEach(resetDb)

  it('sends the board its session before telling it about the match', () => {
    const tournament = createTournament('T')
    addParticipant(tournament.id, 'Alice', 1)
    addParticipant(tournament.id, 'Bob', 2)
    const floor = createFloor(tournament.id, 'Floor 1')
    const stage = createStage(tournament.id, {
      name: 'Gruppenphase',
      type: 'group',
      format: 'round_robin',
      bestOf: 1,
      startScore: 301,
      outMode: 'single',
    })
    const match = generateStage(stage.id)[0]!
    assignMatchFloor(match.id, floor.id)

    const { io, emitted } = fakeIo(`floor:${tournament.id}:${floor.id}`)
    setupRealtime(io)
    expect(dispatchFloorMatch(repo.getMatch(match.id)!)).not.toBeNull()

    // A board starts its leg the moment it is assigned, stamping its first upload with
    // the revision it knows. Learning the match first means stamping a stale one, which
    // the floor session rejects as a revision conflict.
    const toBoard = emitted
      .filter((entry) => entry.event === 'board:session' || entry.event === 'match:assigned')
      .map((entry) => entry.event)
    expect(toBoard).toEqual(['board:session', 'match:assigned'])
  })
})
