import { describe, expect, it } from 'vitest'
import { CELEBRATION_CLIPS, pickClip } from '../celebrationClips'

describe('CELEBRATION_CLIPS', () => {
  it('offers more than one clip, so the pick is actually a choice', () => {
    expect(CELEBRATION_CLIPS.length).toBeGreaterThan(1)
  })

  it('gives every clip a source and a time on screen', () => {
    for (const clip of CELEBRATION_CLIPS) {
      expect(clip.src).toBeTruthy()
      expect(clip.durationMs).toBeGreaterThan(0)
    }
  })
})

describe('pickClip', () => {
  it('takes the first clip at the bottom of the range', () => {
    expect(pickClip(() => 0)).toBe(CELEBRATION_CLIPS[0])
  })

  it('takes the last clip at the top of the range', () => {
    expect(pickClip(() => 0.999)).toBe(CELEBRATION_CLIPS.at(-1))
  })

  it('can reach every clip, so none is dead weight', () => {
    // Mid-bucket, so the mapping does not hinge on float rounding at the boundaries.
    const seen = new Set(
      CELEBRATION_CLIPS.map((_, i) => pickClip(() => (i + 0.5) / CELEBRATION_CLIPS.length)),
    )
    expect(seen.size).toBe(CELEBRATION_CLIPS.length)
  })

  it('never falls off the end when the generator returns exactly 1', () => {
    expect(CELEBRATION_CLIPS).toContain(pickClip(() => 1))
  })
})
