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
const selectTournament = vi.fn()
const selectFloor = vi.fn()
const selectError = ref('')
const floors = ref<{ id: string; tournamentId: string; name: string }[]>([])
const occupiedFloorIds = ref<string[]>([])
let isConnected = false
vi.mock('../../game/tournamentClient', () => ({
  useTournamentClient: () => ({
    connected: ref(isConnected),
    floorId: ref(''),
    tournaments: ref([]),
    floors,
    occupiedFloorIds,
    errorMsg: ref(''),
    selectError,
    boardId: ref('board-1'),
    connect,
    setBoardId: vi.fn(),
    selectTournament,
    selectFloor,
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
  selectTournament.mockReset()
  selectFloor.mockReset()
  selectError.value = ''
  floors.value = []
  occupiedFloorIds.value = []
  isConnected = false
  window.history.replaceState(null, '', '/')
})

describe('TournamentBar tournament list', () => {
  it('says so when no tournament can be joined', async () => {
    isConnected = true
    window.history.replaceState(null, '', '/?ip=192.168.0.9')
    const wrapper = mount(TournamentBar)
    await flushPromises()

    expect(wrapper.text()).toContain('Kein laufendes Turnier')
  })

  it('stays on the list when a saved link points at a closed tournament', async () => {
    selectTournament.mockImplementation(async () => {
      selectError.value = 'this tournament is over'
      return false
    })
    window.history.replaceState(null, '', '/?ip=192.168.0.9&tournamentId=t3&floorId=f1')
    const wrapper = mount(TournamentBar)
    await flushPromises()

    expect(wrapper.text()).toContain('this tournament is over')
    expect(selectFloor).not.toHaveBeenCalled()
    expect(new URLSearchParams(window.location.search).has('tournamentId')).toBe(false)
  })
})

describe('TournamentBar floor picker', () => {
  /** Open the picker of tournament t1 the way a saved launch link does. */
  async function openPicker(link = '/?ip=192.168.0.9&tournamentId=t1') {
    selectTournament.mockResolvedValue(true)
    floors.value = [
      { id: 'f1', tournamentId: 't1', name: 'Feld 1' },
      { id: 'f2', tournamentId: 't1', name: 'Feld 2' },
    ]
    window.history.replaceState(null, '', link)
    const wrapper = mount(TournamentBar)
    await flushPromises()
    return wrapper
  }

  it('marks a floor another board holds and keeps it from being picked', async () => {
    occupiedFloorIds.value = ['f1']
    const wrapper = await openPicker()

    const taken = button(wrapper, 'Feld 1')
    expect(taken.text()).toContain('Belegt')
    expect(taken.attributes('disabled')).toBeDefined()
    expect(button(wrapper, 'Feld 2').attributes('disabled')).toBeUndefined()
  })

  it('stays on the picker, and forgets the floor, when the server refuses it', async () => {
    selectFloor.mockImplementation(async () => {
      selectError.value = 'another board is already connected to this floor'
      return false
    })
    const wrapper = await openPicker()

    await button(wrapper, 'Feld 1').trigger('click')
    await flushPromises()

    expect(selectFloor).toHaveBeenCalledWith('f1')
    expect(wrapper.text()).toContain('Feld für dieses Board auswählen')
    expect(wrapper.text()).toContain('another board is already connected to this floor')
    expect(new URLSearchParams(window.location.search).has('floorId')).toBe(false)
  })

  it('saves the floor once the server accepts it', async () => {
    selectFloor.mockResolvedValue(true)
    const wrapper = await openPicker()

    await button(wrapper, 'Feld 2').trigger('click')
    await flushPromises()

    expect(new URLSearchParams(window.location.search).get('floorId')).toBe('f2')
  })
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
