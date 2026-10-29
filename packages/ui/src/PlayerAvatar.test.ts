import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { Participant } from '@pipod/shared'
import PlayerAvatar from './PlayerAvatar.vue'

function participant(avatar: Participant['avatar']) {
  return { id: 'p1', name: 'Max Power', avatar }
}

describe('PlayerAvatar', () => {
  it('shows initials without a picture', () => {
    const view = mount(PlayerAvatar, { props: { participant: participant(null) } })
    expect(view.find('.initials').text()).toBe('MP')
    expect(view.find('img').exists()).toBe(false)
  })

  it('shows an emoji', () => {
    const view = mount(PlayerAvatar, {
      props: { participant: participant({ kind: 'emoji', emoji: '🦊' }) },
    })
    expect(view.find('.emoji').text()).toBe('🦊')
  })

  it('loads a photo from its versioned URL on the given origin', () => {
    const photo = participant({ kind: 'photo', version: 'abc123' })
    expect(
      mount(PlayerAvatar, { props: { participant: photo } })
        .find('img')
        .attributes('src'),
    ).toBe('/api/participants/p1/avatar?v=abc123')
    expect(
      mount(PlayerAvatar, { props: { participant: photo, origin: 'http://pi:3000' } })
        .find('img')
        .attributes('src'),
    ).toBe('http://pi:3000/api/participants/p1/avatar?v=abc123')
  })

  it('falls back to initials when the photo fails to load', async () => {
    const view = mount(PlayerAvatar, {
      props: { participant: participant({ kind: 'photo', version: 'abc123' }) },
    })
    await view.find('img').trigger('error')
    expect(view.find('.initials').text()).toBe('MP')
  })

  it('retries a broken photo only once the picture changes', async () => {
    const view = mount(PlayerAvatar, {
      props: { participant: participant({ kind: 'photo', version: 'abc123' }) },
    })
    await view.find('img').trigger('error')

    // A refetch hands over an equal but new avatar object: still broken.
    await view.setProps({ participant: participant({ kind: 'photo', version: 'abc123' }) })
    expect(view.find('img').exists()).toBe(false)

    await view.setProps({ participant: participant({ kind: 'photo', version: 'def456' }) })
    expect(view.find('img').attributes('src')).toBe('/api/participants/p1/avatar?v=def456')
  })
})
