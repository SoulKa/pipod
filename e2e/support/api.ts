// Test setup through the server's REST API: specs arrange their data here and only drive the
// UI for the behaviour they are actually about.
import type { APIRequestContext, APIResponse } from '@playwright/test'
import type { Floor, Tournament } from '@pipod/shared'
import { SERVER_URL } from './stack'

/**
 * Specs share one server (and its in-memory database) for the whole run, so anything they
 * create gets a name no other test — or retry — can collide with.
 */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export async function createTournament(
  request: APIRequestContext,
  name: string,
): Promise<Tournament> {
  return ok(await request.post(`${SERVER_URL}/api/tournaments`, { data: { name } }))
}

export async function createFloor(
  request: APIRequestContext,
  tournamentId: string,
  name: string,
): Promise<Floor> {
  return ok(
    await request.post(`${SERVER_URL}/api/tournaments/${tournamentId}/floors`, { data: { name } }),
  )
}

async function ok<T>(response: APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${response.url()} → ${response.status()}: ${await response.text()}`)
  }
  return (await response.json()) as T
}
