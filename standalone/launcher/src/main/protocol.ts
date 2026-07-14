import { net, protocol } from 'electron'
import { existsSync } from 'fs'
import { join, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { PIAPP_SCHEME } from './config'
import type { AppStore } from './appStore'

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
 * button via same-origin `fetch`), handled here instead of served as files.
 */
export function handlePiappProtocol(store: AppStore, control: PiappControl): void {
  protocol.handle(PIAPP_SCHEME, (request) => {
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
