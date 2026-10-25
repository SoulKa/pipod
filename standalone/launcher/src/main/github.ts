import { net } from 'electron'
import { GITHUB_OWNER, GITHUB_REPO } from './config'
import type { Manifest } from '@shared/types'

interface ReleaseAsset {
  name: string
  browser_download_url: string
}
interface Release {
  tag_name: string
  assets: ReleaseAsset[]
}

const UA = 'pipod-launcher'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await net.fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA }
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

/** The latest release's manifest plus a name→download-URL map for its assets. */
export async function fetchLatestManifest(): Promise<{
  manifest: Manifest
  assets: Map<string, string>
}> {
  const release = await fetchJson<Release>(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
  )
  const assets = new Map(release.assets.map((a) => [a.name, a.browser_download_url]))
  const manifestUrl = assets.get('manifest.json')
  if (!manifestUrl) throw new Error(`Release ${release.tag_name} has no manifest.json asset`)
  const manifest = await fetchJson<Manifest>(manifestUrl)
  return { manifest, assets }
}

/** Download an asset into memory, reporting progress as bytes arrive. */
export async function downloadAsset(
  url: string,
  onChunk?: (received: number, total: number) => void
): Promise<Buffer> {
  const res = await net.fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok || !res.body) throw new Error(`download ${url} → ${res.status} ${res.statusText}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onChunk?.(received, total)
  }
  return Buffer.concat(chunks)
}
