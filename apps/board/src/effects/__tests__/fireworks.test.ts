import { describe, expect, it } from 'vitest'
import {
  burstAt,
  createFireworks,
  stepFireworks,
  LAUNCH_INTERVAL_MS,
  MAX_SPARKS,
  SPARKS_PER_BURST,
} from '../fireworks'

// A fixed rng keeps the physics deterministic; 0.5 lands every random pick mid-range.
const rng = () => 0.5

describe('createFireworks', () => {
  it('starts with nothing in flight', () => {
    const state = createFireworks()
    expect(state.rockets).toEqual([])
    expect(state.sparks).toEqual([])
  })

  it('can start primed, so the first rocket goes up without a dead beat', () => {
    const state = createFireworks({ primed: true })
    stepFireworks(state, 16, 800, 600, rng)

    expect(state.rockets).toHaveLength(1)
  })
})

describe('launching', () => {
  it('waits for the launch interval before sending up the first rocket', () => {
    const state = createFireworks()
    stepFireworks(state, LAUNCH_INTERVAL_MS - 1, 800, 600, rng)
    expect(state.rockets).toHaveLength(0)

    stepFireworks(state, 1, 800, 600, rng)
    expect(state.rockets).toHaveLength(1)
  })

  it('launches from inside the canvas, heading up', () => {
    const state = createFireworks()
    stepFireworks(state, LAUNCH_INTERVAL_MS, 800, 600, rng)

    const rocket = state.rockets[0]!
    expect(rocket.x).toBeGreaterThan(0)
    expect(rocket.x).toBeLessThan(800)
    expect(rocket.vy).toBeLessThan(0)
  })

  it('does nothing on a zero-size canvas', () => {
    const state = createFireworks()
    expect(() => stepFireworks(state, LAUNCH_INTERVAL_MS * 5, 0, 0, rng)).not.toThrow()
    expect(state.rockets).toHaveLength(0)
    expect(state.sparks).toHaveLength(0)
  })
})

describe('bursting', () => {
  it('turns a rocket into sparks once it reaches its apex', () => {
    const state = createFireworks()
    stepFireworks(state, LAUNCH_INTERVAL_MS, 800, 600, rng)
    const first = state.rockets[0]!

    // Run until it tops out. Later rockets keep launching meanwhile, so track this one
    // rather than the count.
    for (let i = 0; i < 40 && state.rockets.includes(first); i++) {
      stepFireworks(state, 50, 800, 600, rng)
    }

    expect(state.rockets).not.toContain(first)
    expect(state.sparks.length).toBeGreaterThanOrEqual(SPARKS_PER_BURST)
  })

  it('explodes in the top third, clear of the result card', () => {
    const state = createFireworks()
    const height = 600
    stepFireworks(state, LAUNCH_INTERVAL_MS, 800, height, rng)

    // Run until the first rocket tops out and hands over to its sparks.
    for (let i = 0; i < 40 && state.sparks.length === 0; i++) {
      stepFireworks(state, 50, 800, height, rng)
    }

    expect(state.sparks.length).toBeGreaterThan(0)
    expect(Math.max(...state.sparks.map((s) => s.y))).toBeLessThan(height / 3)
  })

  it('scatters a full burst from the requested point', () => {
    const state = createFireworks()
    burstAt(state, 100, 200, rng)

    expect(state.sparks).toHaveLength(SPARKS_PER_BURST)
    expect(state.sparks.every((s) => s.x === 100 && s.y === 200)).toBe(true)
  })

  it('sends sparks out in every direction, not along a single line', () => {
    const state = createFireworks()
    burstAt(state, 100, 200, rng)

    expect(state.sparks.some((s) => s.vx > 0)).toBe(true)
    expect(state.sparks.some((s) => s.vx < 0)).toBe(true)
    expect(state.sparks.some((s) => s.vy > 0)).toBe(true)
    expect(state.sparks.some((s) => s.vy < 0)).toBe(true)
  })

  it('uses a smaller burst when configured, for costly-to-draw particles', () => {
    const state = createFireworks({ sparksPerBurst: 12 })
    burstAt(state, 100, 200, rng)

    expect(state.sparks).toHaveLength(12)
  })

  it('applies the configured burst size to rockets that top out on their own', () => {
    const state = createFireworks({ primed: true, sparksPerBurst: 12 })
    for (let i = 0; i < 40 && state.sparks.length === 0; i++) {
      stepFireworks(state, 50, 800, 600, rng)
    }

    expect(state.sparks).toHaveLength(12)
  })

  it('skips bursts that would blow past the spark cap', () => {
    const state = createFireworks()
    for (let i = 0; i < 100; i++) burstAt(state, 100, 200, rng)

    expect(state.sparks.length).toBeLessThanOrEqual(MAX_SPARKS)
  })
})

describe('stepping', () => {
  it('keeps the previous position so the renderer can draw a trail', () => {
    const state = createFireworks()
    burstAt(state, 100, 200, rng)
    // Pick a spark that is actually moving, so the trail has a length to compare.
    const spark = state.sparks.find((s) => Math.abs(s.vx) > 1)!
    stepFireworks(state, 16, 800, 600, rng)

    expect(spark.px).toBe(100)
    expect(spark.py).toBe(200)
    expect(spark.x).not.toBe(spark.px)
  })

  it('pulls sparks down under gravity', () => {
    const state = createFireworks()
    burstAt(state, 100, 200, rng)
    const spark = state.sparks[0]!
    const before = spark.vy

    stepFireworks(state, 100, 800, 600, rng)

    expect(spark.vy).toBeGreaterThan(before)
  })

  it('retires sparks once they burn out', () => {
    const state = createFireworks()
    burstAt(state, 100, 200, rng)
    expect(state.sparks.length).toBeGreaterThan(0)

    // Zero-size canvas so nothing new launches while the existing sparks age out.
    for (let i = 0; i < 200; i++) stepFireworks(state, 50, 0, 0, rng)

    expect(state.sparks).toHaveLength(0)
  })

  it('fades sparks toward zero over their life', () => {
    const state = createFireworks()
    burstAt(state, 100, 200, rng)
    const spark = state.sparks[0]!
    expect(spark.life).toBe(1)

    stepFireworks(state, 100, 0, 0, rng)

    expect(spark.life).toBeLessThan(1)
    expect(spark.life).toBeGreaterThan(0)
  })
})
