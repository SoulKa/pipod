import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { Participant, TournamentDetail } from '@pipod/shared'

const detail = ref<TournamentDetail | null>(null)
vi.mock('../feed', () => ({
  useTournamentFeed: () => ({
    detail,
    open: vi.fn(),
    close: vi.fn(),
    refresh: vi.fn(),
  }),
}))

const api = vi.hoisted(() => ({
  setAvatarEmoji: vi.fn(),
  setAvatarPhoto: vi.fn(),
  clearAvatar: vi.fn(),
}))
vi.mock('../api', () => ({ api }))
vi.mock('vue-router', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))
// happy-dom has no canvas to crop with; the crop itself is the browser's job.
vi.mock('../photo', () => ({ toAvatarJpeg: async (file: Blob) => file }))

import PlayerProfileView from './PlayerProfileView.vue'

function setPlayer(avatar: Participant['avatar']): void {
  detail.value = {
    tournament: {
      id: 't1',
      name: 'Cup',
      status: 'active',
      autoAssign: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    floors: [],
    participants: [{ id: 'p1', tournamentId: 't1', name: 'Anna', seed: null, avatar }],
    stages: [],
    matches: [],
    groups: [],
  }
}

function mountView() {
  return mount(PlayerProfileView, { props: { id: 't1', participantId: 'p1' } })
}

const photo = (version: string) => ({ kind: 'photo', version }) as const

/** Pick a file in the "Foto aufnehmen" input, with the upload left pending. */
async function takePhoto(view: ReturnType<typeof mountView>) {
  let finish!: (participant: Participant) => void
  api.setAvatarPhoto.mockReturnValue(new Promise((resolve) => (finish = resolve)))
  const input = view.find('input[capture]')
  Object.defineProperty(input.element, 'files', { value: [new Blob(['x'])], configurable: true })
  await input.trigger('change')
  await flushPromises()
  return finish
}

const withAvatar = (avatar: Participant['avatar']): Participant => ({
  ...detail.value!.participants[0]!,
  avatar,
})

describe('PlayerProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  it('keeps the photo preview through unrelated refetches while uploading', async () => {
    setPlayer({ kind: 'emoji', emoji: '🍺' })
    const view = mountView()
    await takePhoto(view)
    expect(view.find('.preview').exists()).toBe(true)

    // Someone else's match finished: same picture, new objects.
    setPlayer({ kind: 'emoji', emoji: '🍺' })
    await flushPromises()
    expect(view.find('.preview').exists()).toBe(true)
  })

  it('hands the picture over to the feed once it shows the upload', async () => {
    setPlayer({ kind: 'emoji', emoji: '🍺' })
    const view = mountView()
    const finish = await takePhoto(view)
    finish(withAvatar(photo('new')))
    await flushPromises()
    expect(view.find('.preview').exists()).toBe(true)

    setPlayer(photo('new'))
    await flushPromises()
    expect(view.find('.preview').exists()).toBe(false)
  })

  it('drops the preview at once when the same photo was uploaded again', async () => {
    setPlayer(photo('same'))
    const view = mountView()
    const finish = await takePhoto(view)
    finish(withAvatar(photo('same')))
    await flushPromises()
    expect(view.find('.preview').exists()).toBe(false)
  })

  it('saves a quick-pick emoji', async () => {
    setPlayer(null)
    const view = mountView()
    await view.find('[aria-label="Emoji 🐙"]').trigger('click')
    expect(api.setAvatarEmoji).toHaveBeenCalledWith('p1', '🐙')
  })

  it('saves a typed emoji as soon as it is one', async () => {
    setPlayer(null)
    const view = mountView()
    await view.find('.emoji-input').setValue('👨‍👩‍👧')
    await flushPromises()
    expect(api.setAvatarEmoji).toHaveBeenCalledWith('p1', '👨‍👩‍👧')
  })

  it('does not send text typed into the emoji field', async () => {
    setPlayer(null)
    const view = mountView()
    await view.find('.emoji-input').setValue('lol')
    await flushPromises()
    expect(api.setAvatarEmoji).not.toHaveBeenCalled()
  })

  it('offers removal only when a picture is set', async () => {
    setPlayer(null)
    expect(mountView().find('.remove').exists()).toBe(false)

    setPlayer({ kind: 'emoji', emoji: '🍺' })
    const view = mountView()
    await view.find('.remove').trigger('click')
    expect(api.clearAvatar).toHaveBeenCalledWith('p1')
  })

  it('says so for a player that is not in the tournament', () => {
    setPlayer(null)
    const view = mount(PlayerProfileView, { props: { id: 't1', participantId: 'ghost' } })
    expect(view.text()).toContain('gibt es in diesem Turnier nicht')
  })
})
