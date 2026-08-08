// Clips that celebrate a triple 20. Imported rather than referenced by path so Vite
// fingerprints and bundles them.
import dogDanceGif from '../assets/dog-dance.gif'
import shaqShimmyGif from '../assets/shaq-shimmy.gif'
import wowGif from '../assets/wow.gif'

export type CelebrationClip = {
  src: string
  /** How long it stays on screen. Each GIF loops forever, so this sets the play count. */
  durationMs: number
}

// Display size is a single CSS rule in WowPopup rather than per-clip, since sizing by
// height keeps both a wide clip and a near-square one clear of the number pad.
export const CELEBRATION_CLIPS: CelebrationClip[] = [
  // 350×280, 4.0s per loop — played once.
  { src: wowGif, durationMs: 4000 },
  // 117×125, 0.66s per loop — short, so play it twice.
  { src: dogDanceGif, durationMs: 660 * 2 },
  // 498×372, 0.9s per loop — one shimmy is the whole joke.
  { src: shaqShimmyGif, durationMs: 900 },
]

/** Pick a clip at random. Injected rng keeps the choice deterministic under test. */
export function pickClip(rng: () => number = Math.random): CelebrationClip {
  const index = Math.floor(rng() * CELEBRATION_CLIPS.length)
  // Guard the rng() === 1 edge, which would index past the end.
  return CELEBRATION_CLIPS[Math.min(index, CELEBRATION_CLIPS.length - 1)]!
}
