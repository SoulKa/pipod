// Where the stack under test runs, shared by the Playwright config (which starts it) and the
// specs (which talk to it).
import { fileURLToPath } from 'node:url'
import { DEFAULT_SERVER_PORT } from '@pipod/shared'

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * The tournament server, on the default port on purpose: that is where boards look when they
 * search the LAN, so the launcher's discovery spec can find it. A dev server already running
 * there makes the run fail fast instead of testing against the wrong server.
 */
export const SERVER_PORT = DEFAULT_SERVER_PORT
export const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`

/** The built board, served by `vite preview` for browser specs. */
export const BOARD_PORT = 4173
export const BOARD_URL = `http://127.0.0.1:${BOARD_PORT}`
