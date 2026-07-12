import { existsSync } from 'node:fs'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { env } from './env'
import { registerRoutes } from './routes'

/**
 * Build the Fastify app: JSON REST API under /api and, when a built console bundle
 * is configured, serve it as a single-page app (non-/api routes fall back to
 * index.html so client-side routing works).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  // Trusted LAN, no auth — allow any origin so boards/overview can connect.
  await app.register(cors, { origin: true })
  await registerRoutes(app)

  if (env.consoleDir && existsSync(env.consoleDir)) {
    await app.register(fastifyStatic, { root: env.consoleDir })
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api')) {
        return reply.code(404).send({ error: 'not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}
