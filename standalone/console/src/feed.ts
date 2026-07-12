// Reactive tournament feed shared by the admin and overview views: loads detail
// over REST, then keeps it live via socket.io (snapshots refresh detail; per-match
// updates and live scores patch in place without a refetch).
import { ref, shallowRef } from 'vue'
import type { LiveMatchState, Match, Standing } from '@pi-darts/shared'
import { api, type TournamentDetail } from './api'
import { createSocket, type ConsoleSocket } from './socket'

export function useTournamentFeed() {
  const detail = ref<TournamentDetail | null>(null)
  const standings = ref<Standing[]>([])
  const live = ref(new Map<string, LiveMatchState>())
  const connected = ref(false)
  const socket = shallowRef<ConsoleSocket | null>(null)
  let currentId: string | null = null

  async function refresh(): Promise<void> {
    if (currentId) detail.value = await api.getTournament(currentId)
  }

  function patchMatch(match: Match): void {
    if (!detail.value) return
    const idx = detail.value.matches.findIndex((m) => m.id === match.id)
    if (idx >= 0) detail.value.matches[idx] = match
    else detail.value.matches.push(match)
  }

  async function open(id: string): Promise<void> {
    currentId = id
    await refresh()

    const s = createSocket()
    socket.value = s
    s.on('connect', () => {
      connected.value = true
      s.emit('tournament:subscribe', { tournamentId: id })
    })
    s.on('disconnect', () => (connected.value = false))
    s.on('tournament:state', (snap) => {
      standings.value = snap.standings
      void refresh()
    })
    s.on('match:updated', patchMatch)
    s.on('match:live', (state) => {
      const next = new Map(live.value)
      next.set(state.matchId, state)
      live.value = next
    })
  }

  function close(): void {
    socket.value?.disconnect()
    socket.value = null
    currentId = null
  }

  return { detail, standings, live, connected, open, close, refresh }
}
