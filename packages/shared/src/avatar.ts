// Player pictures: the rules every client and the server agree on, so a viewer refuses
// exactly what the server would and every screen draws the same fallback initials.
import { z } from 'zod'
import type { ParticipantAvatar } from './domain'

/** Edge length of the square JPEG the viewer uploads (it crops and scales before sending). */
export const AVATAR_PHOTO_SIZE = 512

/** Upload cap; a 512px JPEG is far below it, so it only bounds what a client may send. */
export const AVATAR_PHOTO_MAX_BYTES = 1024 * 1024

/** Picked from when typing an emoji is too much effort. */
export const AVATAR_QUICK_EMOJIS = [
  '🍺',
  '🐻',
  '🦊',
  '🐙',
  '🦄',
  '🐸',
  '🎯',
  '🔥',
  '👑',
  '🤡',
  '🐐',
  '🦈',
] as const

const pictographic = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

/**
 * Exactly one emoji, as a person sees it: ZWJ families, flags and skin tones are one
 * grapheme each, so they pass; text, digits and two emoji in a row don't.
 */
export function isSingleEmoji(value: string): boolean {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
  return graphemes.length === 1 && pictographic.test(value)
}

export const setAvatarEmojiSchema = z.object({
  emoji: z.string().max(64).refine(isSingleEmoji, { message: 'must be a single emoji' }),
})
export type SetAvatarEmojiInput = z.infer<typeof setAvatarEmojiSchema>

/** Up to two initials, from the first two words of a name ("Max Mustermann" → "MM"). */
export function avatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.slice(0, 2).map((word) => [...word][0] ?? '')
  return letters.join('').toUpperCase() || '?'
}

/** A stable hue per participant, so their initials keep one color on every screen. */
export function avatarHue(participantId: string): number {
  let hash = 0
  for (const char of participantId) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
}

/** Where a participant's photo is served; the version makes each new photo a new URL. */
export function avatarPhotoUrl(origin: string, participantId: string, version: string): string {
  return `${origin}/api/participants/${participantId}/avatar?v=${version}`
}

/**
 * What the picture is, as a comparable value. Every refetch builds new avatar objects, so
 * anything reacting to a picture change must compare this, not the object.
 */
export function avatarKey(avatar: ParticipantAvatar | null): string {
  if (!avatar) return ''
  return avatar.kind === 'photo' ? `photo:${avatar.version}` : `emoji:${avatar.emoji}`
}
