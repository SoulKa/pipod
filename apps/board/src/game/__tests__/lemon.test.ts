import { describe, expect, it } from 'vitest'
import { isLemonTurn } from '../lemon'
import type { DartThrow } from '../useDartGame'

function darts(...spec: [number, number][]): DartThrow[] {
  return spec.map(([base, multiplier]) => ({
    base,
    multiplier: multiplier as 1 | 2 | 3,
    points: base * multiplier,
  }))
}

describe('isLemonTurn', () => {
  it('spots the classic 26 in the order it was thrown', () => {
    expect(isLemonTurn(darts([5, 1], [1, 1], [20, 1]))).toBe(true)
  })

  it('spots it in any other order', () => {
    expect(isLemonTurn(darts([20, 1], [5, 1], [1, 1]))).toBe(true)
    expect(isLemonTurn(darts([1, 1], [20, 1], [5, 1]))).toBe(true)
  })

  it('ignores turns that hit the same numbers with a multiplier', () => {
    // T20 + S5 + S1 is 66 — a good turn, not a lemon.
    expect(isLemonTurn(darts([20, 3], [5, 1], [1, 1]))).toBe(false)
    expect(isLemonTurn(darts([20, 1], [5, 2], [1, 1]))).toBe(false)
  })

  it('ignores incomplete turns', () => {
    expect(isLemonTurn(darts([5, 1], [1, 1]))).toBe(false)
    expect(isLemonTurn([])).toBe(false)
  })

  it('needs all three numbers, not repeats of them', () => {
    expect(isLemonTurn(darts([20, 1], [20, 1], [5, 1]))).toBe(false)
    expect(isLemonTurn(darts([5, 1], [5, 1], [5, 1]))).toBe(false)
  })

  it('ignores unrelated turns', () => {
    expect(isLemonTurn(darts([20, 1], [19, 1], [18, 1]))).toBe(false)
  })
})
