export type AppMode = 'local' | 'tournament'

// The board runs as a local scoreboard by default. Passing `?mode=tournament`
// (e.g. the tournament kiosk URL) turns it into a standalone tournament client
// that joins a server and never touches the saved local roster/options.
export function resolveMode(): AppMode {
  return new URLSearchParams(window.location.search).get('mode') === 'tournament'
    ? 'tournament'
    : 'local'
}

export interface TournamentParams {
  ip?: string
  tournamentId?: string
  floorId?: string
  boardId?: string
}

// Optional connection details for a fixed kiosk board. Whatever is present
// prefills the connection wizard (prefix-based: `ip`, then `tournamentId`,
// then `floorId`); the rest falls back to the on-screen wizard.
export function resolveTournamentParams(): TournamentParams {
  const q = new URLSearchParams(window.location.search)
  const pick = (k: string) => q.get(k)?.trim() || undefined
  return {
    ip: pick('ip'),
    tournamentId: pick('tournamentId'),
    floorId: pick('floorId'),
    boardId: pick('boardId'),
  }
}

// Mirror wizard selections into the URL (without reloading) so a page refresh
// resumes from the same point. A falsy value clears that param.
export function updateTournamentParams(partial: Partial<TournamentParams>): void {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(partial)) {
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  window.history.replaceState(null, '', url)
}
