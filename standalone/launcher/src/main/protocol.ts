import { net, protocol } from 'electron'
import { existsSync } from 'fs'
import { join, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { PIAPP_SCHEME } from './config'
import type { AppStore } from './appStore'
import { broadcastAndListen } from './discovery'

/** Discovery requests are tiny; the cap keeps an app from flooding the LAN with big datagrams. */
const MAX_DISCOVERY_PAYLOAD = 1024

/**
 * Must run before app 'ready'. Registers piapp:// as a standard, secure, fetch-capable scheme so
 * bundles built with a '/'-rooted base (like board) load their assets unchanged.
 */
export function registerPiappScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PIAPP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

/**
 * Launcher actions a hosted app can trigger over its own origin (see the reserved `/.launcher/`
 * routes in {@link handlePiappProtocol}). Kept to a tiny, fixed surface — no preload/IPC bridge.
 */
export interface PiappControl {
  goHome(): void
  setDefaultHomeHidden(hidden: boolean): void
}

/**
 * Serves piapp://<id>/<path> from the app's active bundle dir. Missing paths fall back to
 * index.html so history-mode SPAs (e.g. a future console) route correctly. Guards traversal.
 *
 * Requests under the reserved `/.launcher/` prefix are control calls (an app steering its own Home
 * button via same-origin `fetch`, or asking for a LAN broadcast it can't send from a web page),
 * handled here instead of served as files.
 */
export function handlePiappProtocol(store: AppStore, control: PiappControl): void {
  protocol.handle(PIAPP_SCHEME, async (request) => {
    const url = new URL(request.url)
    const root = store.getActiveDir(url.hostname)
    if (!root) return new Response('App not installed', { status: 404 })

    // Reserved control channel: real SPA routes never use this prefix, so there's no collision.
    if (url.pathname.startsWith('/.launcher/')) {
      switch (url.pathname) {
        case '/.launcher/home':
          control.goHome()
          return new Response(null, { status: 204 })
        case '/.launcher/home-button':
          control.setDefaultHomeHidden(url.searchParams.get('hidden') === '1')
          return new Response(null, { status: 204 })
        case '/.launcher/discover':
          return discover(request, url)
        default:
          return new Response('Unknown launcher action', { status: 404 })
      }
    }

    const rel = decodeURIComponent(url.pathname) || '/'
    const requested = normalize(join(root, rel === '/' ? '/index.html' : rel))
    // Confine to the bundle root.
    if (requested !== root && !requested.startsWith(root + sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    const filePath = existsSync(requested) ? requested : join(root, 'index.html')
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

/**
 * `POST /.launcher/discover?port=N`: broadcast the request body over UDP and stream every reply
 * back as one `{ address, message }` JSON line (NDJSON) the moment it arrives; the body ends when
 * listening stops. Browsers can't send UDP, so this is how an app finds servers on the LAN
 * without anyone typing an IP.
 */
async function discover(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'POST') return new Response('Use POST', { status: 405 })
  // Required: the launcher doesn't know which app protocol is asking, so it has no default.
  const port = Number(url.searchParams.get('port'))
  // Unprivileged ports only, so an app can't aim broadcasts at well-known system services.
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return new Response('Invalid port', { status: 400 })
  }
  const payload = Buffer.from(await request.arrayBuffer())
  if (!payload.length || payload.length > MAX_DISCOVERY_PAYLOAD) {
    return new Response('Invalid payload', { status: 400 })
  }

  // The app cancelling its read (navigating away, a new search) stops the scan early.
  const stop = new AbortController()
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      void broadcastAndListen({
        port,
        payload,
        signal: stop.signal,
        onAnswer: (answer) => controller.enqueue(encoder.encode(`${JSON.stringify(answer)}\n`))
      }).then(() => {
        // Closing a stream the reader already cancelled throws; there is nothing left to end.
        if (!stop.signal.aborted) controller.close()
      })
    },
    cancel() {
      stop.abort()
    }
  })
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } })
}
