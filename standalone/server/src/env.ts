import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SERVER_PORT } from '@pipod/shared'

/** The console bundle `yarn build` leaves next to this workspace, if one was built. */
const builtConsole = fileURLToPath(new URL('../../console/dist', import.meta.url))

/** Runtime configuration, read from the environment with LAN-friendly defaults. */
export const env = {
  /** Bind on all interfaces so boards on the LAN can reach the server. */
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? DEFAULT_SERVER_PORT),
  /**
   * Origin other devices reach the server at, for links and QR codes. Detected from the LAN
   * address when unset — set it when that guess is wrong, e.g. in Docker, where the server
   * only sees the container's own address, or behind a reverse proxy.
   */
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  /** Directory for the SQLite file — mounted as a Docker volume in production. */
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  /** Absolute path to the built console bundle to serve (empty = don't serve). */
  consoleDir: process.env.CONSOLE_DIR ?? (existsSync(builtConsole) ? builtConsole : ''),
  /** Lowest log level to print: trace | debug | info | warn | error | fatal | silent. */
  logLevel: process.env.LOG_LEVEL ?? 'info',
  /**
   * Open the admin console in the default browser once listening. Off in production,
   * where there is no desktop (Docker), and in `dev`, where every restart would reopen it.
   */
  openBrowser: flag(process.env.OPEN_BROWSER, process.env.NODE_ENV !== 'production'),
}

/** DB_FILE overrides the on-disk path (tests set it to `:memory:` for a throwaway DB). */
export const dbPath = process.env.DB_FILE ?? resolve(env.dataDir, 'pipod.db')

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase())
}
