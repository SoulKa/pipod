// Server entry point: build the HTTP app, attach socket.io to the same server so
// REST + WebSocket share one port, then listen on the LAN.
import { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@pipod/shared'
import { buildApp } from './app'
import { env } from './env'
import { setupRealtime } from './realtime'
import { syncAllTournamentStatuses } from './services/tournamentStatus'

const app = await buildApp()

// Statuses are derived as matches are reported, so anything that finished while the
// server was down — or before the rule existed — needs reconciling once on boot.
const reconciled = syncAllTournamentStatuses()
if (reconciled.length) {
  app.log.info(`reconciled the status of ${reconciled.length} tournament(s)`)
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  app.server,
  {
    cors: { origin: true },
  },
)
setupRealtime(io)

await app.listen({ host: env.host, port: env.port })
app.log.info(`piPod server listening on http://${env.host}:${env.port}`)
