// @vitest-environment node
import { createSocket, type Socket } from 'node:dgram'
import { afterEach, describe, expect, it } from 'vitest'
import { broadcastAddresses, broadcastAndListen, type DiscoveryAnswer } from './discovery'

const sockets: Socket[] = []

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

/** A fake server on loopback that answers every datagram with `reply(payload)`. */
async function responder(reply: (payload: string) => string): Promise<number> {
  const socket = createSocket('udp4')
  sockets.push(socket)
  socket.on('message', (message, remote) => {
    socket.send(reply(message.toString('utf8')), remote.port, remote.address)
  })
  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve))
  return socket.address().port
}

describe('broadcastAndListen', () => {
  it('reports each answer with its sender', async () => {
    const port = await responder((payload) => `echo:${payload}`)
    const answers: DiscoveryAnswer[] = []

    await broadcastAndListen({
      port,
      payload: Buffer.from('hello'),
      onAnswer: (answer) => answers.push(answer),
      waitMs: 200,
      targets: ['127.0.0.1']
    })

    expect(answers).toEqual([{ address: '127.0.0.1', message: 'echo:hello' }])
  })

  it('reports answers as they arrive, before the wait is over', async () => {
    const port = await responder(() => 'early')
    const stop = new AbortController()
    const started = Date.now()

    await broadcastAndListen({
      port,
      payload: Buffer.from('hello'),
      // Stopping on the first answer proves it came in long before the 10 s wait ended.
      onAnswer: () => stop.abort(),
      waitMs: 10_000,
      signal: stop.signal,
      targets: ['127.0.0.1']
    })

    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('reports identical answers to repeated broadcasts once', async () => {
    const port = await responder(() => 'same')
    const answers: DiscoveryAnswer[] = []

    await broadcastAndListen({
      port,
      payload: Buffer.from('hello'),
      onAnswer: (answer) => answers.push(answer),
      waitMs: 200,
      targets: ['127.0.0.1', '127.0.0.1']
    })

    expect(answers).toHaveLength(1)
  })

  it('reports nothing when nobody answers', async () => {
    const port = await responder(() => 'unused')
    sockets.pop()?.close()
    const answers: DiscoveryAnswer[] = []

    await broadcastAndListen({
      port,
      payload: Buffer.from('hello'),
      onAnswer: (answer) => answers.push(answer),
      waitMs: 100,
      targets: ['127.0.0.1']
    })

    expect(answers).toEqual([])
  })
})

describe('broadcastAddresses', () => {
  it('always includes the global broadcast address', () => {
    expect(broadcastAddresses()).toContain('255.255.255.255')
  })
})
