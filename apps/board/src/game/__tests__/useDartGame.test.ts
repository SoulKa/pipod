import { describe, expect, it } from 'vitest'
import { useDartGame, type OutMode } from '../useDartGame'

/** Start a game with the given per-player start score and out mode. */
function start(startScore: number, outMode: OutMode, names = ['A', 'B']) {
  const game = useDartGame()
  game.startGame({ names, startScore, outMode })
  return game
}

describe('startGame', () => {
  it('seeds players at the start score and enters the playing phase', () => {
    const game = start(501, 'single')
    expect(game.phase.value).toBe('playing')
    expect(game.players.value.map((p) => p.score)).toEqual([501, 501])
    expect(game.currentPlayerIndex.value).toBe(0)
  })

  it('hands the first throw to startIndex without reordering the roster', () => {
    const game = useDartGame()
    game.startGame({ names: ['A', 'B'], startScore: 301, outMode: 'single', startIndex: 1 })
    expect(game.currentPlayerIndex.value).toBe(1)
    expect(game.players.value.map((p) => p.name)).toEqual(['A', 'B'])
  })

  it('falls back to the first seat when startIndex has no player', () => {
    const game = useDartGame()
    game.startGame({ names: ['A', 'B'], startScore: 301, outMode: 'single', startIndex: 5 })
    expect(game.currentPlayerIndex.value).toBe(0)
  })
})

describe('scoring a turn', () => {
  it('subtracts thrown points from the active player', () => {
    const game = start(501, 'single')
    game.throwDart(20, 3) // T20 = 60
    expect(game.players.value[0]!.score).toBe(441)
    expect(game.currentThrows.value).toHaveLength(1)
  })

  it('advances to the next player after three darts and records the turn', () => {
    const game = start(501, 'single')
    game.throwDart(20, 1)
    game.throwDart(20, 1)
    game.throwDart(20, 1)
    expect(game.currentPlayerIndex.value).toBe(1)
    expect(game.currentThrows.value).toHaveLength(0)
    expect(game.players.value[0]!.lastThrows).toHaveLength(3)
    expect(game.players.value[0]!.score).toBe(441)
  })
})

describe('bust', () => {
  it('reverts the whole turn and passes to the next player when going below zero', () => {
    const game = start(30, 'single')
    game.throwDart(10, 1) // 30 → 20
    game.throwDart(25, 1) // 20 → -5 busts; whole turn reverts
    expect(game.players.value[0]!.score).toBe(30)
    expect(game.currentPlayerIndex.value).toBe(1)
  })

  it('double-out: reaching zero on a non-double busts', () => {
    const game = start(20, 'double')
    game.throwDart(20, 1) // lands on 0 with a single → bust
    expect(game.players.value[0]!.score).toBe(20)
    expect(game.finishOrder.value).toEqual([])
    expect(game.currentPlayerIndex.value).toBe(1)
  })

  it('double-out: leaving exactly 1 busts', () => {
    const game = start(21, 'double')
    game.throwDart(20, 1) // 21 → 1 is not checkoutable → bust
    expect(game.players.value[0]!.score).toBe(21)
    expect(game.currentPlayerIndex.value).toBe(1)
  })
})

describe('finishing', () => {
  it('single-out finishes on exactly zero with any dart', () => {
    const game = start(20, 'single')
    game.throwDart(20, 1)
    expect(game.players.value[0]!.score).toBe(0)
    expect(game.finishOrder.value).toEqual([0])
    expect(game.showBanner.value).toBe(true)
  })

  it('double-out finishes only on a double', () => {
    const game = start(40, 'double')
    game.throwDart(20, 2) // D20 → 0
    expect(game.players.value[0]!.score).toBe(0)
    expect(game.finishOrder.value).toEqual([0])
  })

  it('is game over once all but one player has finished', () => {
    const game = start(40, 'double')
    game.throwDart(20, 2) // player A finishes
    expect(game.isGameOver.value).toBe(true) // 2-player game: one finisher ends it
  })

  it('continuePlaying dismisses the banner and hands off in a 3-player game', () => {
    const game = start(40, 'double', ['A', 'B', 'C'])
    game.throwDart(20, 2) // A finishes; banner up, not yet game over
    expect(game.isGameOver.value).toBe(false)
    game.continuePlaying()
    expect(game.showBanner.value).toBe(false)
    expect(game.currentPlayerIndex.value).toBe(1) // moved on to B
  })
})

describe('undo', () => {
  it('restores the state that preceded the last dart', () => {
    const game = start(100, 'single')
    expect(game.canUndo.value).toBe(false)
    game.throwDart(20, 1) // 100 → 80
    expect(game.canUndo.value).toBe(true)
    game.undo()
    expect(game.players.value[0]!.score).toBe(100)
    expect(game.currentThrows.value).toHaveLength(0)
    expect(game.canUndo.value).toBe(false)
  })
})

describe('checkoutRoutes', () => {
  it('reflects a finishable score for the active player', () => {
    const game = start(40, 'double')
    expect(game.checkoutRoutes.value[0]?.label).toBe('D20')
  })

  it('is empty while the finish banner is showing', () => {
    const game = start(40, 'double')
    game.throwDart(20, 2) // finish → banner up
    expect(game.checkoutRoutes.value).toEqual([])
  })
})
