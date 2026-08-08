// Server entry point: start the composed stack on the configured LAN address.
import { env } from './env'
import { startServer } from './server'

const { app } = await startServer({ host: env.host, port: env.port })
app.log.info(`piPod server listening on http://${env.host}:${env.port}`)
