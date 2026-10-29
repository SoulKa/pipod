// Player pictures. No ownership checks on purpose: anyone at the venue may change anyone's
// picture — it is a gimmick among friends, not an account.
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Participant, ParticipantAvatar } from '@pipod/shared'
import { db } from '../db/client'
import { participantPhotos, participants } from '../db/schema'
import { repo } from '../repo'
import { log } from '../logger'

/** What a participant's picture becomes; null removes it. */
export type AvatarChange = { photo: Buffer } | { emoji: string } | null

/** Every JPEG starts with an SOI marker followed by another marker. */
export function isJpeg(data: Buffer): boolean {
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
}

/**
 * Photo URLs are cached as immutable, so the version is derived from the bytes: it changes
 * exactly when the photo does, whatever the clock says or whatever came in between.
 */
export function photoVersion(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex').slice(0, 16)
}

/**
 * The one write path for pictures: the avatar value and the photo bytes change together.
 * Undefined for an unknown participant.
 */
export function setAvatar(id: string, change: AvatarChange): Participant | undefined {
  const participant = repo.getParticipant(id)
  if (!participant) return undefined
  const photo = change && 'photo' in change ? change.photo : null
  const avatar: ParticipantAvatar | null = photo
    ? { kind: 'photo', version: photoVersion(photo) }
    : change && 'emoji' in change
      ? { kind: 'emoji', emoji: change.emoji }
      : null

  db.transaction((tx) => {
    if (photo) {
      const row = { data: photo, updatedAt: new Date().toISOString() }
      tx.insert(participantPhotos)
        .values({ participantId: id, ...row })
        .onConflictDoUpdate({ target: participantPhotos.participantId, set: row })
        .run()
    } else {
      tx.delete(participantPhotos).where(eq(participantPhotos.participantId, id)).run()
    }
    tx.update(participants).set({ avatar }).where(eq(participants.id, id)).run()
  })
  log.debug({ participant: participant.name, avatar: avatar?.kind ?? 'none' }, 'avatar changed')
  return { ...participant, avatar }
}
