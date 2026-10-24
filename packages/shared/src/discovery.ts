// LAN discovery: a board broadcasts a request over UDP and every tournament server on the
// network answers, so nobody has to type an IP. The server listens for it on the same port
// number it serves HTTP on (UDP and TCP ports don't collide). Datagrams can come from
// anything on the network, so both sides parse them and drop what doesn't match.
import { z } from 'zod'

/** Port servers listen on unless `PORT` says otherwise — so also where boards look first. */
export const DEFAULT_SERVER_PORT = 3000

export const discoveryRequestSchema = z.object({ pipod: z.literal('discover'), v: z.literal(1) })
export type DiscoveryRequest = z.infer<typeof discoveryRequestSchema>

export const discoveryReplySchema = z.object({
  pipod: z.literal('server'),
  v: z.literal(1),
  /** Human-readable server name (the host's name), to tell several servers apart. */
  name: z.string().min(1).max(100),
  /** TCP port the server's HTTP + socket.io API listens on. */
  port: z.number().int().min(1).max(65535),
})
export type DiscoveryReply = z.infer<typeof discoveryReplySchema>

export const DISCOVERY_REQUEST: DiscoveryRequest = { pipod: 'discover', v: 1 }

/**
 * One line of the launcher's `POST /.launcher/discover` response, which streams every datagram
 * that answered the broadcast, undecoded, as NDJSON (`application/x-ndjson`) the moment it
 * arrives. The launcher declares the same shape itself — it hosts more than the darts apps, so
 * it doesn't depend on this package.
 */
export const discoveryAnswerSchema = z.object({ address: z.string(), message: z.string() })

/** Parse a datagram's text as JSON matching `schema`; null for anything else. */
export function parseJsonMessage<T>(schema: z.ZodType<T>, raw: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
