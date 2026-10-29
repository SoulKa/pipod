// Reactive tournament feed shared by the admin and overview views: loads detail
// over REST, then keeps it live via socket.io (snapshots refresh detail; per-match
// updates and live scores patch in place without a refetch).
import { computed, ref, shallowRef } from 'vue'
import type { LiveMatchState, Match, Participant, Standing, TournamentDetail } from '@pipod/shared'
import { api } from './api'
import { createSocket, type ConsoleSocket } from './socket'

export function useTournamentFeed() {
  const detail = ref<TournamentDetail | null>(null)
  const standings = ref<Standing[]>([])
  const live = ref(new Map<string, LiveMatchState>())
  const connected = ref(false)
  const socket = shallowRef<ConsoleSocket | null>(null)
  let currentId: string | null = null

  // Built once per snapshot, so every name and avatar on screen is a map lookup.
  const participantsById = computed(
    () => new Map((detail.value?.participants ?? []).map((p) => [p.id, p])),
  )
  function participant(id: string | null): Participant | undefined {
    return id ? participantsById.value.get(id) : undefined
  }
  /** A player's name, or a dash for a seat nobody holds yet. */
  function nameOf(id: string | null): string {
    return participant(id)?.name ?? '—'
  }

  // Both awaits below can outlive a switch to another tournament (quick back/forward in the
  // admin), so each checks it is still wanted before it writes anything.
  async function refresh(): Promise<void> {
    const id = currentId
    if (!id) return
    const next = await api.getTournament(id)
    if (currentId === id) detail.value = next
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
    if (currentId !== id) return

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

  return { detail, standings, live, connected, open, close, refresh, participant, nameOf }
}
