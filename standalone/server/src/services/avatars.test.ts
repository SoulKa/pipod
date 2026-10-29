import { beforeEach, describe, expect, it } from 'vitest'
import { avatarHue, avatarInitials, isSingleEmoji } from '@pipod/shared'
import { resetDb } from '../test/db'
import { withPlayers } from '../test/tournaments'
import { repo } from '../repo'
import { isJpeg, photoVersion, setAvatar } from './avatars'
import { deleteParticipant, deleteTournament } from './tournaments'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

describe('isSingleEmoji', () => {
  it.each(['🍺', '👨‍👩‍👧', '🇩🇪', '👍🏽', '❤️'])('accepts %s', (value) => {
    expect(isSingleEmoji(value)).toBe(true)
  })

  it.each(['', 'a', 'lol', '1', '🍺🍺', '🍺 ', '#'])('refuses %j', (value) => {
    expect(isSingleEmoji(value)).toBe(false)
  })
})

describe('avatarInitials / avatarHue', () => {
  it('takes the first letters of up to two words', () => {
    expect(avatarInitials('max mustermann')).toBe('MM')
    expect(avatarInitials('  Ann  ')).toBe('A')
    expect(avatarInitials('Jean Luc Picard')).toBe('JL')
    expect(avatarInitials('')).toBe('?')
  })

  it('keeps one hue per participant', () => {
    expect(avatarHue('abc')).toBe(avatarHue('abc'))
    expect(avatarHue('abc')).toBeGreaterThanOrEqual(0)
    expect(avatarHue('abc')).toBeLessThan(360)
  })
})

describe('setAvatar', () => {
  beforeEach(resetDb)

  const photoVersionOf = (id: string) => {
    const avatar = repo.getParticipant(id)!.avatar
    return avatar?.kind === 'photo' ? avatar.version : null
  }

  it('starts without a picture', () => {
    const { tournament } = withPlayers(1)
    expect(repo.listParticipants(tournament.id)[0]!.avatar).toBeNull()
  })

  it('versions a photo by its bytes', () => {
    const { players } = withPlayers(1)
    const id = players[0]!.id
    const other = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20])
    setAvatar(id, { photo: jpeg })
    const first = photoVersionOf(id)
    setAvatar(id, { photo: other })
    expect(photoVersionOf(id)).not.toBe(first)
    expect(repo.getParticipantPhoto(id)).toEqual(other)

    // The same bytes again are the same photo, so the cached URL stays right.
    setAvatar(id, { photo: jpeg })
    expect(photoVersionOf(id)).toBe(first)
  })

  it('keeps versions stable across an emoji in between', () => {
    // Nothing remembers the old version while the emoji is set; the bytes decide.
    const { players } = withPlayers(1)
    const id = players[0]!.id
    setAvatar(id, { photo: jpeg })
    const first = photoVersionOf(id)
    setAvatar(id, { emoji: '🦊' })
    setAvatar(id, { photo: jpeg })
    expect(photoVersionOf(id)).toBe(first)
    expect(first).toBe(photoVersion(jpeg))
  })

  it('swaps a photo for an emoji and drops the image', () => {
    const { players } = withPlayers(1)
    const id = players[0]!.id
    setAvatar(id, { photo: jpeg })
    expect(setAvatar(id, { emoji: '🦊' })!.avatar).toEqual({ kind: 'emoji', emoji: '🦊' })
    expect(repo.getParticipant(id)!.avatar).toEqual({ kind: 'emoji', emoji: '🦊' })
    expect(repo.getParticipantPhoto(id)).toBeUndefined()
  })

  it('clears either kind', () => {
    const { players } = withPlayers(2)
    const [a, b] = players.map((p) => p.id)
    setAvatar(a!, { photo: jpeg })
    setAvatar(b!, { emoji: '🐙' })
    setAvatar(a!, null)
    setAvatar(b!, null)
    expect(repo.getParticipant(a!)!.avatar).toBeNull()
    expect(repo.getParticipant(b!)!.avatar).toBeNull()
    expect(repo.getParticipantPhoto(a!)).toBeUndefined()
  })

  it('returns undefined for an unknown participant', () => {
    expect(setAvatar('nobody', { emoji: '🍺' })).toBeUndefined()
  })

  it('deletes photos with their participant or tournament', () => {
    const { tournament, players } = withPlayers(2)
    const [a, b] = players.map((p) => p.id)
    setAvatar(a!, { photo: jpeg })
    setAvatar(b!, { photo: jpeg })

    deleteParticipant(a!)
    expect(repo.getParticipantPhoto(a!)).toBeUndefined()
    expect(repo.getParticipantPhoto(b!)).toEqual(jpeg)
    deleteTournament(tournament.id)
    expect(repo.getParticipantPhoto(b!)).toBeUndefined()
  })
})

describe('isJpeg', () => {
  it('checks the JPEG start-of-image marker', () => {
    expect(isJpeg(jpeg)).toBe(true)
    expect(isJpeg(Buffer.from('not a jpeg'))).toBe(false)
    expect(isJpeg(Buffer.from([0xff, 0xd8]))).toBe(false)
  })
})
