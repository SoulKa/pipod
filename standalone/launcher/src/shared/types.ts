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
  /** Bundle-relative icon path; required for every launcher app. */
  icon: string
  /** Query string appended to the bundle's index.html at launch (e.g. `mode=tournament`). */
  query?: string
  /**
   * Launcher versions the bundle runs on: exact (`1.2.0`) or caret (`^1.2.0`). Absent in
   * manifests built before launcher versioning, which count as compatible.
   */
  launcher?: string
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
  /** Persisted from the manifest so the home grid can label, icon + launch the app offline. */
  name?: string
  icon: string
  query?: string
}

/** One row in the launcher store view: installed state merged with the remote manifest. */
export interface CatalogEntry {
  id: string
  name: string
  description: string
  icon: string
  installed: boolean
  installedVersion: string | null
  availableVersion: string | null
  /** A newer bundle is installable now (false while it's held back by `needsLauncher`). */
  updateAvailable: boolean
  /**
   * The release's `launcher` range when it holds back an install or update this launcher
   * doesn't satisfy; null otherwise.
   */
  needsLauncher: string | null
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
}

/**
 * The launcher's own self-update (electron-updater). `unsupported` outside a packaged AppImage;
 * `idle` when up to date (or the check failed); `error` only for a failed download, keeping the
 * version so it can be retried.
 */
export type LauncherUpdateState =
  | { status: 'unsupported' | 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'error'; version: string; message: string }

/** LauncherUpdateState plus the running launcher's version, as shown in Settings. */
export type LauncherUpdate = { current: string } & LauncherUpdateState

/** Live network status derived from the OS network interfaces in the main process. */
export interface NetworkState {
  /** Any non-internal interface currently holds an address. */
  online: boolean
  /** A wireless interface (wlan or en0) currently holds an address. */
  wifi: boolean
}

/** The typed API the preload exposes on window.launcher; implemented in preload, consumed by the renderer. */
export interface LauncherBridge {
  listInstalled(): Promise<InstalledApp[]>
  checkForUpdates(): Promise<CatalogEntry[]>
  installOrUpdate(id: string): Promise<void>
  /** Launch an installed bundle, optionally with a query string (e.g. shortcut mode). */
  launchApp(id: string, query?: string): Promise<void>
  goHome(): Promise<void>
  /** Quit the launcher entirely. */
  quit(): Promise<void>
  getSettings(): Promise<LauncherSettings>
  setSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings>
  /** Current network status (Wi-Fi / online), read from the OS in the main process. */
  getNetworkState(): Promise<NetworkState>
  /** Subscribe to install/update progress; returns an unsubscribe function. */
  onProgress(cb: (p: UpdateProgress) => void): () => void
  /** Fires with the running app's id, or null when the launcher returns home. */
  onActiveApp(cb: (id: string | null) => void): () => void
  /** Fires after launch-time auto-updates with the ids that changed. */
  onAutoUpdated(cb: (ids: string[]) => void): () => void
  getLauncherUpdate(): Promise<LauncherUpdate>
  /** Download the available launcher update, then restart into it. */
  downloadLauncherUpdate(): Promise<void>
  /** Fires whenever the launcher's self-update state changes. */
  onLauncherUpdate(cb: (update: LauncherUpdate) => void): () => void
}
