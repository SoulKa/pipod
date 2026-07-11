export type AppMode = 'local' | 'tournament'

// The board runs as a local scoreboard by default. Passing `?mode=tournament`
// (e.g. the tournament kiosk URL) turns it into a standalone tournament client
// that joins a server and never touches the saved local roster/options.
export function resolveMode(): AppMode {
  return new URLSearchParams(window.location.search).get('mode') === 'tournament'
    ? 'tournament'
    : 'local'
}
