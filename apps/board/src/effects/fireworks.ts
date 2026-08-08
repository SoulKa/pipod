// Fireworks particle simulation for the win celebration. Pure and framework-free: no DOM,
// no Vue, no timers — the caller owns the animation loop and the drawing. Randomness is
// injected so the whole thing stays deterministic under test.

/** Pixels per second², tuned so a rocket takes roughly a second to top out. */
const GRAVITY = 900
/** Air resistance on sparks, as a fraction of velocity shed per second. */
const DRAG = 1.4
/** Time between launches. */
export const LAUNCH_INTERVAL_MS = 700
/** Sparks in a single explosion. */
export const SPARKS_PER_BURST = 60
/** Hard ceiling on live sparks — the Pi's GPU is the reason this exists. */
export const MAX_SPARKS = 600
/** A stalled frame must not teleport particles across the screen. */
const MAX_FRAME_MS = 50

/** Board palette, so the celebration matches the rest of the UI. */
const COLORS = ['#22d3ee', '#a78bfa', '#facc15', '#fb7185', '#34d399'] as const

export type Rocket = {
  x: number
  y: number
  /** Previous position, so the renderer can draw a motion trail. */
  px: number
  py: number
  vx: number
  vy: number
  color: string
}

export type Spark = Rocket & {
  /** Remaining brightness, 1 down to 0. */
  life: number
  /** Total lifetime in seconds. */
  maxLife: number
}

export type FireworksState = {
  rockets: Rocket[]
  sparks: Spark[]
  sinceLaunchMs: number
  sparksPerBurst: number
}

export type FireworksOptions = {
  /**
   * Start with the launch timer already full, so the first rocket goes up on the very
   * first step instead of after a full interval of empty screen.
   */
  primed?: boolean
  /** Particles per explosion. Lower it when each one is expensive to draw. */
  sparksPerBurst?: number
}

export function createFireworks(options: FireworksOptions = {}): FireworksState {
  return {
    rockets: [],
    sparks: [],
    sinceLaunchMs: options.primed ? LAUNCH_INTERVAL_MS : 0,
    sparksPerBurst: options.sparksPerBurst ?? SPARKS_PER_BURST,
  }
}

/** Explode into a ring of sparks at (x, y). Skipped whole if it would breach the cap. */
export function burstAt(state: FireworksState, x: number, y: number, rng: () => number): void {
  const count = state.sparksPerBurst
  if (state.sparks.length + count > MAX_SPARKS) return

  const color = COLORS[Math.floor(rng() * COLORS.length)] ?? COLORS[0]
  for (let i = 0; i < count; i++) {
    // Evenly spaced angles with a jittered offset: a round burst, not a visible grid.
    const angle = ((i + rng()) / count) * Math.PI * 2
    const speed = 60 + rng() * 160
    state.sparks.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 0.9 + rng() * 0.6,
      color,
    })
  }
}

function launch(state: FireworksState, width: number, height: number, rng: () => number): void {
  // Aim for an apex in the top quarter — the result card owns the middle of the screen,
  // so anything lower explodes behind it. Then solve for the speed that reaches it.
  const rise = height * (0.72 + rng() * 0.2)
  const x = width * (0.15 + rng() * 0.7)
  state.rockets.push({
    x,
    y: height,
    px: x,
    py: height,
    vx: (rng() - 0.5) * 80,
    vy: -Math.sqrt(2 * GRAVITY * rise),
    color: COLORS[Math.floor(rng() * COLORS.length)] ?? COLORS[0],
  })
}

/**
 * Advance the simulation by `dtMs`. Launching needs the canvas size, so it is skipped
 * while the canvas has no area — but existing particles still age, which is what lets a
 * burst drain even after the canvas is gone.
 */
export function stepFireworks(
  state: FireworksState,
  dtMs: number,
  width: number,
  height: number,
  rng: () => number = Math.random,
): void {
  const dt = Math.min(dtMs, MAX_FRAME_MS) / 1000

  if (width > 0 && height > 0) {
    state.sinceLaunchMs += dtMs
    if (state.sinceLaunchMs >= LAUNCH_INTERVAL_MS) {
      state.sinceLaunchMs = 0
      launch(state, width, height, rng)
    }
  }

  for (let i = state.rockets.length - 1; i >= 0; i--) {
    const rocket = state.rockets[i]!
    rocket.px = rocket.x
    rocket.py = rocket.y
    rocket.x += rocket.vx * dt
    rocket.y += rocket.vy * dt
    rocket.vy += GRAVITY * dt

    // Apex reached (or it escaped off the top) — hand it over to the sparks.
    if (rocket.vy >= 0 || rocket.y <= 0) {
      state.rockets.splice(i, 1)
      burstAt(state, rocket.x, rocket.y, rng)
    }
  }

  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const spark = state.sparks[i]!
    spark.px = spark.x
    spark.py = spark.y
    spark.x += spark.vx * dt
    spark.y += spark.vy * dt
    spark.vy += GRAVITY * dt
    const drag = Math.max(0, 1 - DRAG * dt)
    spark.vx *= drag
    spark.vy *= drag
    spark.life -= dt / spark.maxLife
    if (spark.life <= 0) state.sparks.splice(i, 1)
  }
}
