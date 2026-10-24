import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import type { FoundServer } from '../../game/discovery'

// Per test: whether the board runs in the launcher, and what a search finds there.
let inLauncher = true
let outcome: FoundServer[] = []
// Whether the search is still running once it has reported `outcome`.
let stillSearching = false
const searches = vi.fn()
vi.mock('../../game/discovery', () => ({
  canDiscover: () => inLauncher,
  useServerDiscovery: () => {
    const servers = ref<FoundServer[]>([])
    return {
      servers,
      searching: ref(stillSearching),
      search: async () => {
        searches()
        servers.value = outcome
      },
    }
  },
}))

// The wizard only drives the client; stub it so no socket is opened.
const connect = vi.fn()
vi.mock('../../game/tournamentClient', () => ({
  useTournamentClient: () => ({
    connected: ref(false),
    floorId: ref(''),
    tournaments: ref([]),
    floors: ref([]),
    errorMsg: ref(''),
    boardId: ref('board-1'),
    connect,
    setBoardId: vi.fn(),
    selectTournament: vi.fn(),
    selectFloor: vi.fn(),
  }),
}))

import TournamentBar from '../TournamentBar.vue'

function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))!
}

const KEYPAD = 'IP des Turnier-Servers eingeben'

beforeEach(() => {
  inLauncher = true
  stillSearching = false
  searches.mockClear()
  connect.mockClear()
  window.history.replaceState(null, '', '/')
})

describe('TournamentBar discovery', () => {
  it('lists servers found on the LAN and connects to the one tapped', async () => {
    outcome = [{ name: 'Bar', host: '192.168.0.5:3000' }]
    const wrapper = mount(TournamentBar)
    await flushPromises()

    await button(wrapper, 'Bar').trigger('click')

    expect(connect).toHaveBeenCalledWith('192.168.0.5:3000')
  })

  it('lets a server be picked while the search is still running', async () => {
    outcome = [{ name: 'Bar', host: '192.168.0.5:3000' }]
    stillSearching = true
    const wrapper = mount(TournamentBar)
    await flushPromises()

    expect(wrapper.text()).toContain('Turnier-Server auswählen')
    await button(wrapper, 'Bar').trigger('click')

    expect(connect).toHaveBeenCalledWith('192.168.0.5:3000')
  })

  it('keeps manual entry one tap away, and Back searches the list again', async () => {
    outcome = []
    const wrapper = mount(TournamentBar)
    await flushPromises()

    expect(wrapper.text()).toContain('Kein Turnier-Server gefunden')
    await button(wrapper, 'IP manuell eingeben').trigger('click')
    expect(wrapper.text()).toContain(KEYPAD)

    await button(wrapper, 'Zurück').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Kein Turnier-Server gefunden')
    expect(searches).toHaveBeenCalledTimes(2)
  })

  it('starts on manual entry outside the launcher, without searching', async () => {
    inLauncher = false
    const wrapper = mount(TournamentBar)
    await flushPromises()

    expect(wrapper.text()).toContain(KEYPAD)
    expect(wrapper.text()).not.toContain('Zurück')
    expect(searches).not.toHaveBeenCalled()
  })

  it('lets Back reach a fresh server list after starting with a saved IP', async () => {
    outcome = [{ name: 'Bar', host: '192.168.0.5:3000' }]
    window.history.replaceState(null, '', '/?ip=192.168.0.9')
    const wrapper = mount(TournamentBar)
    await flushPromises()
    expect(connect).toHaveBeenCalledWith('192.168.0.9')

    await button(wrapper, 'Zurück').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Turnier-Server auswählen')
    expect(button(wrapper, 'Bar').exists()).toBe(true)
  })

  it('goes back to the keypad with the saved IP outside the launcher', async () => {
    inLauncher = false
    window.history.replaceState(null, '', '/?ip=192.168.0.9')
    const wrapper = mount(TournamentBar)
    await flushPromises()

    await button(wrapper, 'Zurück').trigger('click')

    expect(wrapper.text()).toContain(KEYPAD)
    expect(wrapper.find('output').text()).toBe('192.168.0.9')
    expect(wrapper.text()).not.toContain('Zurück')
  })
})
