import { createSocket } from 'node:dgram'
import { networkInterfaces } from 'node:os'

/** One answer to a broadcast: who sent it and what they said, still undecoded. */
export interface DiscoveryAnswer {
  address: string
  message: string
}

export interface BroadcastOptions {
  port: number
  payload: Buffer
  /** Called once per distinct answer, as soon as it arrives. */
  onAnswer: (answer: DiscoveryAnswer) => void
  /** How long to listen for answers after sending. */
  waitMs?: number
  /** Stops listening early, e.g. when the app cancels its request. */
  signal?: AbortSignal
  /** Where to send; defaults to every LAN broadcast address. Tests send to loopback. */
  targets?: string[]
}

/** One greppable prefix for every discovery problem (CLAUDE.md points people at it). */
function warn(...args: unknown[]): void {
  console.warn('[launcher] discovery:', ...args)
}

/**
 * Broadcast a datagram on the LAN and report every answer the moment it arrives, until the
 * wait is over or `signal` aborts. Resolves once listening has stopped.
 *
 * Protocol-agnostic on purpose: apps own what they send and how they read the replies (the
 * board's tournament discovery lives in @pipod/shared), so the launcher only moves bytes.
 */
export async function broadcastAndListen(opts: BroadcastOptions): Promise<void> {
  const socket = createSocket('udp4')
  const seen = new Set<string>()

  socket.on('message', (message, remote) => {
    const answer = { address: remote.address, message: message.toString('utf8') }
    // The same server can hear several broadcasts (one per address below) and answer each.
    const key = `${answer.address}\n${answer.message}`
    if (seen.has(key)) return
    seen.add(key)
    opts.onAnswer(answer)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.bind(0, () => {
        socket.off('error', reject)
        resolve()
      })
    })
  } catch (err) {
    // No socket, no scan: report nothing so the app falls back to manual entry.
    warn('cannot open a UDP socket:', err)
    socket.close()
    return
  }
  socket.on('error', (err) => warn('socket error:', err))
  socket.setBroadcast(true)
  for (const target of opts.targets ?? broadcastAddresses()) {
    // A failed send only means fewer answers, but it is logged: an empty server list looks the
    // same whether nobody answered or the broadcast never left (e.g. macOS denying the app
    // Local Network access), and only this log tells the two apart.
    socket.send(opts.payload, opts.port, target, (err) => {
      if (err) warn(`broadcast to ${target}:${opts.port} failed:`, err)
    })
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, opts.waitMs ?? 1500)
    opts.signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
  socket.close()
}

/**
 * The global broadcast address plus each interface's own subnet broadcast: some systems
 * (macOS, hosts with several interfaces) only send 255.255.255.255 out of one interface.
 */
export function broadcastAddresses(): string[] {
  const targets = new Set(['255.255.255.255'])
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      targets.add(subnetBroadcast(entry.address, entry.netmask))
    }
  }
  return [...targets]
}

function subnetBroadcast(address: string, netmask: string): string {
  const ip = address.split('.').map(Number)
  const mask = netmask.split('.').map(Number)
  return ip.map((octet, i) => (octet | (~(mask[i] ?? 255) & 255)) & 255).join('.')
}
