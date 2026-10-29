// Player pictures. No ownership checks on purpose: anyone at the venue may change anyone's
// picture — it is a gimmick among friends, not an account.
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Participant, ParticipantAvatar } from '@pipod/shared'
import { db } from '../db/client'
import { participantPhotos, participants } from '../db/schema'
import { repo } from '../repo'
import { log } from '../logger'

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
function writeAvatar(
  id: string,
  avatar: ParticipantAvatar | null,
  photo: Buffer | null,
): Participant | undefined {
  const participant = db.transaction((tx) => {
    // better-sqlite3 has one synchronous connection, so this read is part of `tx` too.
    const current = repo.getParticipant(id)
    if (!current) return undefined
    if (photo) {
      tx.insert(participantPhotos)
        .values({ participantId: id, data: photo })
        .onConflictDoUpdate({ target: participantPhotos.participantId, set: { data: photo } })
        .run()
    } else {
      tx.delete(participantPhotos).where(eq(participantPhotos.participantId, id)).run()
    }
    tx.update(participants).set({ avatar }).where(eq(participants.id, id)).run()
    return { ...current, avatar }
  })
  if (participant) {
    log.debug({ participant: participant.name, avatar: avatar?.kind ?? 'none' }, 'avatar changed')
  }
  return participant
}

export function setAvatarPhoto(id: string, photo: Buffer): Participant | undefined {
  return writeAvatar(id, { kind: 'photo', version: photoVersion(photo) }, photo)
}

export function setAvatarEmoji(id: string, emoji: string): Participant | undefined {
  return writeAvatar(id, { kind: 'emoji', emoji }, null)
}

export function clearAvatar(id: string): Participant | undefined {
  return writeAvatar(id, null, null)
}
