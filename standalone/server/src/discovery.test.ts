import { createSocket, type Socket } from 'node:dgram'
import { afterEach, describe, expect, it } from 'vitest'
import { DISCOVERY_REQUEST, discoveryReplySchema, parseJsonMessage } from '@pipod/shared'
import { startDiscoveryResponder } from './discovery'
import { createLogger } from './logger'
import { startServer, type RunningServer } from './server'

const cleanup: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
})

async function udpClient(): Promise<Socket> {
  const socket = createSocket('udp4')
  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise<void>((resolve) => socket.close(() => resolve())))
  return socket
}

/** Send one datagram and resolve with the first answer, or null after `waitMs`. */
function ask(socket: Socket, port: number, message: string, waitMs = 500): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage)
      resolve(null)
    }, waitMs)
    function onMessage(reply: Buffer) {
      clearTimeout(timer)
      resolve(reply.toString('utf8'))
    }
    socket.once('message', onMessage)
    socket.send(message, port, '127.0.0.1')
  })
}

async function server(): Promise<RunningServer> {
  const running = await startServer({ host: '127.0.0.1', port: 0, logger: false })
  cleanup.push(() => running.close())
  return running
}

describe('LAN discovery', () => {
  it('answers on the HTTP port number with the port boards should connect to', async () => {
    const running = await server()
    const client = await udpClient()

    const answer = await ask(client, running.port, JSON.stringify(DISCOVERY_REQUEST))

    expect(parseJsonMessage(discoveryReplySchema, answer ?? '')).toMatchObject({
      pipod: 'server',
      port: running.port,
    })
  })

  it('ignores datagrams that are not discovery requests', async () => {
    const running = await server()
    const client = await udpClient()

    expect(await ask(client, running.port, 'hello', 200)).toBeNull()
    expect(await ask(client, running.port, '{"pipod":"discover","v":2}', 200)).toBeNull()
  })

  it('stays out of the way when the UDP port is already taken', async () => {
    const blocker = await udpClient()
    const { port } = blocker.address()

    const stop = await startDiscoveryResponder({
      host: '127.0.0.1',
      port,
      log: createLogger({ level: 'silent' }),
    })

    // Nothing was bound, so stopping is a harmless no-op rather than a null to check for.
    await expect(stop()).resolves.toBeUndefined()
  })
})
