// Server entry point: start the composed stack on the configured LAN address.
import { existsSync } from 'node:fs'
import QRCode from 'qrcode'
import { env } from './env'
import { log } from './logger'
import { httpOrigin, openInBrowser, publicOrigin } from './network'
import { startServer } from './server'

const { app, port, close } = await startServer({ host: env.host, port: env.port })
app.log.info(`piPod server listening on http://${env.host}:${port}`)

// Without handlers the process dies mid-request; under Docker the tsx entrypoint
// would also leave `docker stop` waiting for its SIGKILL timeout. `once`, so a
// second Ctrl+C falls back to the default hard exit if closing hangs.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info(`${signal} received, shutting down`)
    close().then(
      () => process.exit(0),
      (err) => {
        log.error({ err }, 'shutdown failed')
        process.exit(1)
      },
    )
  })
}

if (env.consoleDir) {
  const adminUrl = `${httpOrigin('localhost', port)}/admin`
  log.info(`Admin console: ${adminUrl}`)

  if (existsSync('/.dockerenv') && !env.publicUrl) {
    log.warn(
      'running in Docker without PUBLIC_URL — the viewer link and QR codes use the container address',
    )
  }
  const origin = publicOrigin(port)
  if (origin) {
    const viewerUrl = `${origin}/`
    // Small mode packs two modules per character, so the code fits a normal terminal.
    const qr = await QRCode.toString(viewerUrl, { type: 'terminal', small: true })
    log.info(`Viewer (scan to watch on your phone): ${viewerUrl}\n${qr}`)
  } else {
    log.warn('no LAN address found (set PUBLIC_URL) — other devices cannot reach the viewer')
  }

  if (env.openBrowser) {
    openInBrowser(adminUrl, (err) => log.warn({ err }, 'could not open the admin console'))
  }
} else {
  log.warn(
    'console bundle not found, so no admin console or viewer is served — run `yarn build`, or `yarn dev:console` while developing',
  )
}
