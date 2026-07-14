// Shared data shapes for the launcher store, imported type-only by main, preload, and renderer.
// These mirror the manifest.json produced by scripts/build-manifest.mjs.

export interface ManifestApp {
  id: string
  name: string
  description: string
  version: string
  artifact: string
  sha256: string
  size: number
  icon?: string
  /** Query string appended to the bundle's index.html at launch (e.g. `mode=tournament`). */
  query?: string
}

export interface Manifest {
  schemaVersion: number
  release: string
  commit: string
  apps: ManifestApp[]
}

/** Metadata persisted next to each installed app bundle (apps/<id>.json). */
export interface InstalledApp {
  id: string
  version: string
  sha256: string
  installedAt: string
  /** Persisted from the manifest so the home grid can label + launch the app offline. */
  name?: string
  query?: string
}

/** One row in the launcher store view: installed state merged with the remote manifest. */
export interface CatalogEntry {
  id: string
  name: string
  description: string
  icon?: string
  installed: boolean
  installedVersion: string | null
  availableVersion: string | null
  updateAvailable: boolean
}

/** Progress emitted while installing/updating an app. */
export interface UpdateProgress {
  id: string
  phase: 'download' | 'verify' | 'extract' | 'swap' | 'done' | 'error'
  received?: number
  total?: number
  message?: string
}

export interface LauncherSettings {
  /** Auto-apply newer bundles on launch when a release is reachable. */
  autoUpdateOnLaunch: boolean
  /** Server host the board app should talk to (persisted so the operator sets it once). */
  boardServerUrl: string
}

/** The typed API the preload exposes on window.launcher; implemented in preload, consumed by the renderer. */
export interface LauncherBridge {
  listInstalled(): Promise<InstalledApp[]>
  checkForUpdates(): Promise<CatalogEntry[]>
  installOrUpdate(id: string): Promise<void>
  /** Launch an installed bundle, optionally with a query string (e.g. shortcut mode). */
  launchApp(id: string, query?: string): Promise<void>
  goHome(): Promise<void>
  getSettings(): Promise<LauncherSettings>
  setSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings>
  /** Subscribe to install/update progress; returns an unsubscribe function. */
  onProgress(cb: (p: UpdateProgress) => void): () => void
  /** Fires with the running app's id, or null when the launcher returns home. */
  onActiveApp(cb: (id: string | null) => void): () => void
  /** Fires after launch-time auto-updates with the ids that changed. */
  onAutoUpdated(cb: (ids: string[]) => void): () => void
}
