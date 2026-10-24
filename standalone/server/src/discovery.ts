// UDP side of LAN discovery: answer boards' broadcast requests with this server's name and
// HTTP port, so they can list it without anyone typing an IP. See @pipod/shared/discovery.
import { createSocket } from 'node:dgram'
import { hostname } from 'node:os'
import type { FastifyBaseLogger } from 'fastify'
import { discoveryRequestSchema, parseJsonMessage, type DiscoveryReply } from '@pipod/shared'

export interface DiscoveryResponderOptions {
  /** Address to bind; broadcasts only arrive on a wildcard (`0.0.0.0`) bind. */
  host: string
  /** UDP port to listen on — the same number as the HTTP port, which the reply names. */
  port: number
  log: FastifyBaseLogger
}

/**
 * Start answering discovery requests and return the stop function. Discovery is a
 * convenience — boards can still enter the IP by hand — so when the UDP port can't be bound
 * this only warns, and the returned stop does nothing.
 */
export async function startDiscoveryResponder(
  opts: DiscoveryResponderOptions,
): Promise<() => Promise<void>> {
  const socket = createSocket('udp4')
  const reply: DiscoveryReply = { pipod: 'server', v: 1, name: hostname(), port: opts.port }
  const payload = Buffer.from(JSON.stringify(reply))

  socket.on('message', (message, remote) => {
    if (!parseJsonMessage(discoveryRequestSchema, message.toString('utf8'))) return
    opts.log.debug(`discovery request from ${remote.address}:${remote.port}`)
    socket.send(payload, remote.port, remote.address, (err) => {
      if (err) opts.log.warn({ err }, `could not answer discovery request from ${remote.address}`)
    })
  })

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.bind(opts.port, opts.host, () => {
        socket.off('error', reject)
        resolve()
      })
    })
  } catch (err) {
    socket.close()
    opts.log.warn({ err }, `LAN discovery disabled: cannot listen on udp/${opts.port}`)
    return async () => {}
  }

  // A socket error after binding must not crash the server; discovery just stops answering.
  socket.on('error', (err) => opts.log.warn({ err }, 'LAN discovery socket error'))
  opts.log.info(`LAN discovery listening on udp/${opts.port}`)
  return () => new Promise<void>((resolve) => socket.close(() => resolve()))
}
