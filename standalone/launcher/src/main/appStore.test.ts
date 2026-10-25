// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStore } from './appStore'
import type { Manifest, ManifestApp } from '@shared/types'

const root = vi.hoisted(() => ({ dir: '' }))
const github = vi.hoisted(() => ({ fetchLatestManifest: vi.fn(), downloadAsset: vi.fn() }))

vi.mock('./github', () => github)
vi.mock('./paths', () => ({
  appsRoot: () => join(root.dir, 'apps'),
  appDir: (id: string) => join(root.dir, 'apps', id),
  appMetaPath: (id: string) => join(root.dir, 'apps', `${id}.json`),
  seedDir: () => join(root.dir, 'no-seed')
}))

function remoteApp(over: Partial<ManifestApp> = {}): ManifestApp {
  return {
    id: 'board',
    name: 'Board',
    description: '',
    version: '1.1.0',
    artifact: 'board-1.1.0.tar.gz',
    sha256: 'new',
    size: 1,
    icon: 'icon.svg',
    ...over
  }
}

function release(...apps: ManifestApp[]): void {
  const manifest: Manifest = { schemaVersion: 1, release: 'v2.0.0', commit: '', apps }
  github.fetchLatestManifest.mockResolvedValue({ manifest, assets: new Map() })
}

/** Put board 1.0.0 on disk as if installed earlier. */
function installBoard(): void {
  mkdirSync(join(root.dir, 'apps', 'board'), { recursive: true })
  writeFileSync(
    join(root.dir, 'apps', 'board.json'),
    JSON.stringify({ id: 'board', version: '1.0.0', sha256: 'old', installedAt: '', icon: 'i' })
  )
}

beforeEach(() => {
  root.dir = mkdtempSync(join(tmpdir(), 'pipod-appstore-'))
  github.fetchLatestManifest.mockReset()
  github.downloadAsset.mockReset()
})

afterEach(() => rmSync(root.dir, { recursive: true, force: true }))

describe('AppStore launcher compatibility', () => {
  it.each<[string | undefined, boolean]>([
    ['^1.2.0', true],
    ['^1.3.0', false],
    ['^2.0.0', false],
    ['1.2.0', true],
    // Manifests from before launcher versioning carry no range.
    [undefined, true],
    // A range format this launcher doesn't know comes from a newer release.
    ['>=1.0.0', false]
  ])('launcher 1.2.0 with range %s → compatible: %s', async (launcher, compatible) => {
    release(remoteApp({ launcher }))
    const store = new AppStore('1.2.0')
    await store.init()
    const [entry] = await store.checkForUpdates()
    expect(entry.needsLauncher).toBe(compatible ? null : launcher)
  })

  it('rejects a launcher version it cannot compare', () => {
    expect(() => new AppStore('1.4.0-rc.1')).toThrow('Invalid version: 1.4.0-rc.1')
  })

  it('accepts every range without a launcher version (unpackaged)', async () => {
    release(remoteApp({ launcher: '^9.0.0' }))
    const store = new AppStore(null)
    await store.init()
    const [entry] = await store.checkForUpdates()
    expect(entry.needsLauncher).toBeNull()
  })

  it('skips incompatible updates on launch and refuses a manual one', async () => {
    installBoard()
    release(remoteApp({ launcher: '^2.0.0' }))
    const store = new AppStore('1.2.0')
    await store.init()

    const [entry] = await store.checkForUpdates()
    expect(entry).toMatchObject({ updateAvailable: false, needsLauncher: '^2.0.0' })
    expect(await store.autoUpdateInstalled()).toEqual([])
    await expect(store.installOrUpdate('board')).rejects.toThrow('needs launcher ^2.0.0')
    expect(github.downloadAsset).not.toHaveBeenCalled()
    expect(store.listInstalled()[0].version).toBe('1.0.0')
  })
})
