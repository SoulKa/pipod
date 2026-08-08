// Boots the real composition root on an ephemeral port and talks to it over real
// HTTP, so end-to-end tests exercise the same wiring production runs.
import { startServer, type RunningServer } from '../../server'

export function startTestServer(): Promise<RunningServer> {
  return startServer({ host: '127.0.0.1', port: 0, logger: false })
}

export interface ApiClient {
  get: <T>(path: string) => Promise<T>
  post: <T>(path: string, body?: unknown) => Promise<T>
}

/** Minimal REST client for the /api surface; throws with the server's message on failure. */
export function api(baseUrl: string): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text}`)
    return (text ? JSON.parse(text) : null) as T
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
  }
}

/** Poll until `predicate` holds — for server-side state that settles asynchronously. */
export async function waitUntil(
  predicate: () => boolean,
  { timeoutMs = 2000, label = 'condition' } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
