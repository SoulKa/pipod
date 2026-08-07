// Composition root: builds the HTTP app, attaches socket.io to the same server so
// REST + WebSocket share one port, and starts listening. Kept separate from index.ts
// so tests can boot the identical stack on an ephemeral port.
import type { FastifyInstance } from 'fastify'
import { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@pipod/shared'
import { buildApp } from './app'
import { setupRealtime } from './realtime'
import type { IoServer } from './realtime/hub'
import { syncAllTournamentStatuses } from './services/tournamentStatus'

export interface StartServerOptions {
  host?: string
  port?: number
  /** Fastify's logger; tests turn it off to keep output readable. */
  logger?: boolean
}

export interface RunningServer {
  app: FastifyInstance
  io: IoServer
  /** Base URL of the bound address — resolves port 0 to the port actually assigned. */
  url: string
  close: () => Promise<void>
}

export async function startServer(opts: StartServerOptions = {}): Promise<RunningServer> {
  const app = await buildApp({ logger: opts.logger ?? true })

  // Statuses are derived as matches are reported, so anything that finished while the
  // server was down — or before the rule existed — needs reconciling once on boot.
  const reconciled = syncAllTournamentStatuses()
  if (reconciled.length) {
    app.log.info(`reconciled the status of ${reconciled.length} tournament(s)`)
  }

  const io: IoServer = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(app.server, { cors: { origin: true } })
  setupRealtime(io)

  const host = opts.host ?? '0.0.0.0'
  await app.listen({ host, port: opts.port ?? 3000 })

  return {
    app,
    io,
    url: resolveUrl(app, host),
    // Close socket.io first: it holds the open connections that would otherwise keep
    // the HTTP server from shutting down.
    close: async () => {
      await io.close()
      await app.close()
    },
  }
}

/** Build a connectable URL from the bound address, mapping wildcards to loopback. */
function resolveUrl(app: FastifyInstance, host: string): string {
  const address = app.server.address()
  if (!address || typeof address === 'string') return `http://${host}`
  const hostname = address.family === 'IPv6' ? `[${address.address}]` : address.address
  const reachable = ['0.0.0.0', '[::]', '::'].includes(hostname) ? '127.0.0.1' : hostname
  return `http://${reachable}:${address.port}`
}
