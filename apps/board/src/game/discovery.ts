// Find tournament servers on the LAN. A web page can't send UDP, so the launcher broadcasts
// for us (`/.launcher/discover`); this module owns the darts side of the exchange.
import { ref } from 'vue'
import {
  DEFAULT_SERVER_PORT,
  DISCOVERY_REQUEST,
  discoveryAnswerSchema,
  discoveryReplySchema,
  parseJsonMessage,
} from '@pipod/shared'

export interface FoundServer {
  name: string
  /** `ip:port`, ready to hand to the tournament client like a typed-in host. */
  host: string
}

/**
 * Discovery needs the launcher's UDP bridge, which only exists for the apps it serves over
 * `piapp://` — not in a plain browser (e.g. `yarn dev:board`).
 */
export function canDiscover(): boolean {
  return window.location.protocol === 'piapp:'
}

export function useServerDiscovery() {
  const servers = ref<FoundServer[]>([])
  const searching = ref(false)
  let current: AbortController | null = null

  /** Add one streamed answer to the list, if it is a tournament server's reply. */
  function add(line: string): void {
    const answer = parseJsonMessage(discoveryAnswerSchema, line)
    const reply = answer && parseJsonMessage(discoveryReplySchema, answer.message)
    if (!answer || !reply) return
    const host = `${answer.address}:${reply.port}`
    if (servers.value.some((s) => s.host === host)) return
    servers.value = [...servers.value, { name: reply.name, host }].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }

  /** Start a fresh search, cancelling one still running so the two can't mix their results. */
  async function search(): Promise<void> {
    current?.abort()
    const run = (current = new AbortController())
    searching.value = true
    servers.value = []
    try {
      // Aborting fails the stream, which also makes the launcher stop listening early.
      const response = await fetch(`/.launcher/discover?port=${DEFAULT_SERVER_PORT}`, {
        method: 'POST',
        body: JSON.stringify(DISCOVERY_REQUEST),
        signal: run.signal,
      })
      if (response.ok && response.body) await readLines(response.body, add)
    } catch {
      // Failed, broke off or cancelled: the search is over either way; keep what was found.
    } finally {
      if (current === run) searching.value = false
    }
  }

  return { servers, searching, search }
}

/**
 * Hand each complete line to `onLine` as soon as it arrives. The stream ends when the launcher
 * stops listening, which is when the search is over.
 */
async function readLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = (pending + decoder.decode(value, { stream: true })).split('\n')
    pending = lines.pop() ?? ''
    lines.forEach(onLine)
  }
  onLine(pending + decoder.decode())
}
