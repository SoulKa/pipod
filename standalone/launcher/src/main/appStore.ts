import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync, promises as fs } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { appDir, appMetaPath, appsRoot, seedDir } from './paths'
import { downloadAsset, fetchLatestManifest } from './github'
import type { CatalogEntry, InstalledApp, Manifest, ManifestApp, UpdateProgress } from '../shared/types'

const execFileAsync = promisify(execFile)

/**
 * Owns the installed app bundles on disk: seeding, listing, checking the remote release for
 * updates, and installing/updating with sha256 verification + atomic swap (previous bundle kept
 * as .bak for rollback). Emits 'progress' (UpdateProgress) while installing.
 */
export class AppStore extends EventEmitter {
  private installed = new Map<string, InstalledApp>()

  async init(): Promise<void> {
    await fs.mkdir(appsRoot(), { recursive: true })
    await this.loadInstalled()
    await this.seedIfMissing()
  }

  /** Absolute dir of an app's active bundle, or null if not installed (used by the protocol). */
  getActiveDir(id: string): string | null {
    return this.installed.has(id) && existsSync(appDir(id)) ? appDir(id) : null
  }

  listInstalled(): InstalledApp[] {
    return [...this.installed.values()]
  }

  /** Merge installed state with the latest remote manifest. Falls back to installed-only offline. */
  async checkForUpdates(): Promise<CatalogEntry[]> {
    let manifest: Manifest | null = null
    try {
      manifest = (await fetchLatestManifest()).manifest
    } catch {
      manifest = null
    }
    const ids = new Set<string>(this.installed.keys())
    manifest?.apps.forEach((a) => ids.add(a.id))

    return [...ids].map((id) => {
      const inst = this.installed.get(id) ?? null
      const remote = manifest?.apps.find((a) => a.id === id) ?? null
      return {
        id,
        name: remote?.name ?? id,
        description: remote?.description ?? '',
        icon: remote?.icon,
        installed: !!inst,
        installedVersion: inst?.version ?? null,
        availableVersion: remote?.version ?? null,
        updateAvailable:
          !!remote && !!inst && (remote.version !== inst.version || remote.sha256 !== inst.sha256),
      }
    })
  }

  /** Download the app from the latest release and install it, emitting progress. */
  async installOrUpdate(id: string): Promise<void> {
    const emit = (p: UpdateProgress): boolean => this.emit('progress', p)
    try {
      const { manifest, assets } = await fetchLatestManifest()
      const app = manifest.apps.find((a) => a.id === id)
      if (!app) throw new Error(`App "${id}" is not in the latest release`)
      const url = assets.get(app.artifact)
      if (!url) throw new Error(`Release is missing asset ${app.artifact}`)

      emit({ id, phase: 'download', received: 0, total: app.size })
      const buf = await downloadAsset(url, (received, total) =>
        emit({ id, phase: 'download', received, total: total || app.size }),
      )
      await this.installBuffer(app, buf, emit)
    } catch (err) {
      emit({ id, phase: 'error', message: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  /** Auto-apply updates for already-installed apps (launch cadence). Returns updated ids. */
  async autoUpdateInstalled(): Promise<string[]> {
    const catalog = await this.checkForUpdates()
    const updated: string[] = []
    for (const entry of catalog) {
      if (!entry.updateAvailable) continue
      try {
        await this.installOrUpdate(entry.id)
        updated.push(entry.id)
      } catch {
        // Keep the working version on any failure; a manual retry stays available.
      }
    }
    return updated
  }

  private async loadInstalled(): Promise<void> {
    this.installed.clear()
    const entries = await fs.readdir(appsRoot(), { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.json')) continue
      try {
        const meta = JSON.parse(await fs.readFile(join(appsRoot(), e.name), 'utf8')) as InstalledApp
        if (meta.id && existsSync(appDir(meta.id))) this.installed.set(meta.id, meta)
      } catch {
        // Ignore corrupt metadata; the app just looks "not installed".
      }
    }
  }

  /** First-run: install any seeded app that isn't already present (offline-first). */
  private async seedIfMissing(): Promise<void> {
    const dir = seedDir()
    const manifestPath = join(dir, 'manifest.json')
    if (!existsSync(manifestPath)) return
    let manifest: Manifest
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Manifest
    } catch {
      return
    }
    for (const app of manifest.apps) {
      if (this.installed.has(app.id)) continue
      const tarball = join(dir, app.artifact)
      if (!existsSync(tarball)) continue
      try {
        await this.installBuffer(app, await fs.readFile(tarball), () => true)
      } catch {
        // A bad seed shouldn't block launch; the store can still install from remote.
      }
    }
  }

  /** Verify → extract → atomic swap → persist metadata. Leaves the active bundle intact on error. */
  private async installBuffer(
    app: ManifestApp,
    buf: Buffer,
    emit: (p: UpdateProgress) => void,
  ): Promise<void> {
    emit({ id: app.id, phase: 'verify' })
    const sha256 = createHash('sha256').update(buf).digest('hex')
    if (app.sha256 && sha256 !== app.sha256) {
      throw new Error(`sha256 mismatch for ${app.id} (expected ${app.sha256}, got ${sha256})`)
    }

    emit({ id: app.id, phase: 'extract' })
    const staged = `${appDir(app.id)}.next`
    const tmpTar = join(appsRoot(), `${app.id}.download.tar.gz`)
    await fs.rm(staged, { recursive: true, force: true })
    await fs.mkdir(staged, { recursive: true })
    await fs.writeFile(tmpTar, buf)
    try {
      await execFileAsync('tar', ['-xzf', tmpTar, '-C', staged])
    } finally {
      await fs.rm(tmpTar, { force: true })
    }
    if (!existsSync(join(staged, 'index.html'))) {
      await fs.rm(staged, { recursive: true, force: true })
      throw new Error(`${app.id} bundle has no index.html`)
    }

    emit({ id: app.id, phase: 'swap' })
    await this.swapIntoPlace(app.id, staged)

    const meta: InstalledApp = {
      id: app.id,
      version: app.version,
      sha256,
      installedAt: new Date().toISOString(),
      name: app.name,
      // Persist so the home grid can label + launch the app without a remote manifest.
      ...(app.query ? { query: app.query } : {}),
    }
    await fs.writeFile(appMetaPath(app.id), `${JSON.stringify(meta, null, 2)}\n`)
    this.installed.set(app.id, meta)
    emit({ id: app.id, phase: 'done' })
  }

  /** Rename current→.bak and staged→current. Rename is atomic within the same filesystem. */
  private async swapIntoPlace(id: string, staged: string): Promise<void> {
    const active = appDir(id)
    const backup = `${active}.bak`
    await fs.rm(backup, { recursive: true, force: true })
    if (existsSync(active)) await fs.rename(active, backup)
    await fs.rename(staged, active)
  }
}
