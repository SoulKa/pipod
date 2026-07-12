import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

// A minimal stand-in for the parts of Response that api.ts touches. `ok` defaults
// to true so the common success path is one line; error cases set it explicitly.
function fakeResponse(body: unknown, init: { ok?: boolean; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    statusText: init.statusText ?? '',
    json: async () => body,
  } as unknown as Response
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

/** The URL and RequestInit that the single fetch call was made with. */
function lastCall(): [string, RequestInit | undefined] {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? []
  return [url as string, init as RequestInit | undefined]
}

describe('api — reads', () => {
  it('lists tournaments with a bare GET', async () => {
    const tournaments = [{ id: 't1', name: 'Cup', status: 'active', createdAt: 'now' }]
    fetchMock.mockResolvedValue(fakeResponse(tournaments))

    await expect(api.listTournaments()).resolves.toEqual(tournaments)
    const [url, init] = lastCall()
    expect(url).toBe('/api/tournaments')
    // No init means a default GET.
    expect(init).toBeUndefined()
  })

  it('gets a tournament by id', async () => {
    const detail = { tournament: { id: 't1' } }
    fetchMock.mockResolvedValue(fakeResponse(detail))

    await expect(api.getTournament('t1')).resolves.toEqual(detail)
    expect(lastCall()[0]).toBe('/api/tournaments/t1')
  })
})

describe('api — writes', () => {
  it('sends a JSON body with a content-type header when there is a payload', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ id: 't1', name: 'Cup' }))

    await api.createTournament('Cup')

    const [url, init] = lastCall()
    expect(url).toBe('/api/tournaments')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'content-type': 'application/json' })
    expect(init?.body).toBe(JSON.stringify({ name: 'Cup' }))
  })

  it('omits the header and body on a bodyless POST (FST_ERR_CTP_EMPTY_JSON_BODY guard)', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ id: 't1' }))

    await api.cancelTournament('t1')

    const [url, init] = lastCall()
    expect(url).toBe('/api/tournaments/t1/cancel')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toBeUndefined()
    expect(init?.body).toBeUndefined()
  })

  it('forwards structured inputs verbatim in the body', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ id: 'm1' }))

    await api.reportLeg('m1', 2, 'p7')

    const [url, init] = lastCall()
    expect(url).toBe('/api/matches/m1/legs')
    expect(init?.body).toBe(JSON.stringify({ legIndex: 2, winnerId: 'p7' }))
  })

  it('deletes with the DELETE verb and consumes the ok envelope', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true }))

    await expect(api.deleteTournament('t1')).resolves.toBeUndefined()
    const [url, init] = lastCall()
    expect(url).toBe('/api/tournaments/t1')
    expect(init?.method).toBe('DELETE')
  })
})

describe('api — error handling', () => {
  it('throws the server-provided error message on a non-ok response', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ error: 'name taken' }, { ok: false }))

    await expect(api.createTournament('Cup')).rejects.toThrow('name taken')
  })

  it('falls back to statusText when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)

    await expect(api.listTournaments()).rejects.toThrow('Bad Gateway')
  })
})
