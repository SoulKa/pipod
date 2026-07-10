// Server entry point: build the HTTP app, attach socket.io to the same server so
// REST + WebSocket share one port, then listen on the LAN.
import { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@pi-darts/shared'
import { buildApp } from './app'
import { env } from './env'
import { setupRealtime } from './realtime'

const app = await buildApp()

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  app.server,
  {
    cors: { origin: true },
  },
)
setupRealtime(io)

await app.listen({ host: env.host, port: env.port })
app.log.info(`pi-darts server listening on http://${env.host}:${env.port}`)
