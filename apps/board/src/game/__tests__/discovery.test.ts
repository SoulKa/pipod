import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { canDiscover, useServerDiscovery } from '../discovery'

function answer(address: string, name: string, port = 3000): string {
  const message = JSON.stringify({ pipod: 'server', v: 1, name, port })
  return `${JSON.stringify({ address, message })}\n`
}

/**
 * Stub the launcher's endpoint with a stream the test feeds chunk by chunk. Like a real fetch,
 * aborting the request fails the stream, so no further answers arrive.
 */
function launcherStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
  const encoder = new TextEncoder()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', () =>
        controller.error(new DOMException('aborted', 'AbortError')),
      )
      return { ok: true, body }
    }),
  )
  return {
    send: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
    end: () => controller.close(),
    fail: (err: Error) => controller.error(err),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useServerDiscovery', () => {
  it('asks the launcher to broadcast a discovery request on the server port', async () => {
    const launcher = launcherStream()
    launcher.end()

    await useServerDiscovery().search()

    expect(fetch).toHaveBeenCalledWith('/.launcher/discover?port=3000', {
      method: 'POST',
      body: JSON.stringify({ pipod: 'discover', v: 1 }),
      signal: expect.any(AbortSignal),
    })
  })

  it('lists each server as soon as it answers, while still searching', async () => {
    const launcher = launcherStream()
    const discovery = useServerDiscovery()
    const done = discovery.search()

    launcher.send(answer('192.168.0.9', 'Werkstatt', 4000))
    await flushPromises()
    expect(discovery.servers.value).toEqual([{ name: 'Werkstatt', host: '192.168.0.9:4000' }])
    expect(discovery.searching.value).toBe(true)

    launcher.send(answer('192.168.0.5', 'Bar'))
    launcher.end()
    await done

    expect(discovery.servers.value).toEqual([
      { name: 'Bar', host: '192.168.0.5:3000' },
      { name: 'Werkstatt', host: '192.168.0.9:4000' },
    ])
    expect(discovery.searching.value).toBe(false)
  })

  it('reassembles answers split across chunks', async () => {
    const launcher = launcherStream()
    const discovery = useServerDiscovery()
    const done = discovery.search()

    const line = answer('192.168.0.5', 'Bar')
    launcher.send(line.slice(0, 20))
    launcher.send(line.slice(20))
    launcher.end()
    await done

    expect(discovery.servers.value).toEqual([{ name: 'Bar', host: '192.168.0.5:3000' }])
  })

  it('drops unrelated datagrams and duplicate answers', async () => {
    const launcher = launcherStream()
    const discovery = useServerDiscovery()
    const done = discovery.search()

    launcher.send(answer('192.168.0.5', 'Bar'))
    launcher.send(answer('192.168.0.5', 'Bar'))
    launcher.send(`${JSON.stringify({ address: '192.168.0.7', message: 'other protocol' })}\n`)
    launcher.send('not json at all\n')
    launcher.end()
    await done

    expect(discovery.servers.value).toEqual([{ name: 'Bar', host: '192.168.0.5:3000' }])
  })

  it('starts each search from an empty list', async () => {
    const first = launcherStream()
    const discovery = useServerDiscovery()
    const done = discovery.search()
    first.send(answer('192.168.0.5', 'Bar'))
    first.end()
    await done

    const second = launcherStream()
    const again = discovery.search()
    expect(discovery.servers.value).toEqual([])
    second.end()
    await again
  })

  it('cancels a running search when a new one starts', async () => {
    const first = launcherStream()
    const discovery = useServerDiscovery()
    const firstDone = discovery.search()
    first.send(answer('192.168.0.5', 'Old'))
    await flushPromises()

    const second = launcherStream()
    const secondDone = discovery.search()
    // The first search ends (its stream was aborted) without touching the second one's state.
    await firstDone
    expect(discovery.servers.value).toEqual([])
    expect(discovery.searching.value).toBe(true)

    second.send(answer('192.168.0.6', 'New'))
    second.end()
    await secondDone
    expect(discovery.servers.value).toEqual([{ name: 'New', host: '192.168.0.6:3000' }])
    expect(discovery.searching.value).toBe(false)
  })

  it('ends quietly when the launcher cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const discovery = useServerDiscovery()

    await discovery.search()

    expect(discovery.servers.value).toEqual([])
    expect(discovery.searching.value).toBe(false)
  })

  it('keeps servers found before the stream broke off', async () => {
    const launcher = launcherStream()
    const discovery = useServerDiscovery()
    const done = discovery.search()

    launcher.send(answer('192.168.0.5', 'Bar'))
    await flushPromises()
    launcher.fail(new Error('launcher went away'))
    await done

    expect(discovery.servers.value).toEqual([{ name: 'Bar', host: '192.168.0.5:3000' }])
    expect(discovery.searching.value).toBe(false)
  })
})

describe('canDiscover', () => {
  it('is off in a plain browser, where the launcher bridge does not exist', () => {
    expect(window.location.protocol).toBe('http:')
    expect(canDiscover()).toBe(false)
  })
})
