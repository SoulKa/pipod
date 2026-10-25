import { EventEmitter } from 'events'
import { canStartLauncherUpdate } from '@shared/launcherUpdate'
import type { LauncherUpdate, LauncherUpdateState } from '@shared/types'

/** The part of electron-updater's `autoUpdater` this drives (faked in tests). */
export interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  checkForUpdates(): Promise<{
    isUpdateAvailable: boolean
    updateInfo: { version: string }
  } | null>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
}

/**
 * The launcher's own update, deliberately user-driven: checks only surface an available version
 * (a badge in Settings), and nothing downloads or restarts until the user taps Update — the
 * shell restarting mid-game would be worse than running an older one. Emits 'change'
 * (LauncherUpdate) on every state change. Without an updater (dev, or not running as an
 * AppImage) it stays `unsupported`.
 */
export class LauncherUpdater extends EventEmitter {
  private state: LauncherUpdate
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly updater: Updater | null,
    private readonly current: string
  ) {
    super()
    this.state = { current, status: updater ? 'idle' : 'unsupported' }
    if (!updater) return
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.on('download-progress', ({ percent }) => {
      if (this.state.status === 'downloading') this.set({ ...this.state, percent })
    })
    // Failures are handled where the promises reject; this only stops the EventEmitter from
    // throwing on an 'error' event nobody listens to.
    updater.on('error', () => {})
  }

  get(): LauncherUpdate {
    return this.state
  }

  /** Check now, then every `intervalMs` until stop(). */
  start(intervalMs: number): void {
    if (!this.updater || this.timer) return
    void this.check()
    this.timer = setInterval(() => void this.check(), intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async check(): Promise<void> {
    if (!this.updater || this.downloading) return
    let result: Awaited<ReturnType<Updater['checkForUpdates']>>
    try {
      result = await this.updater.checkForUpdates()
    } catch (err) {
      // Offline, or a release without update metadata: keep the last known state, the next
      // periodic check retries.
      console.warn('[launcher] update check failed:', err instanceof Error ? err.message : err)
      return
    }
    // The user may have started a download while the check was in flight.
    if (this.downloading) return
    this.set(
      result?.isUpdateAvailable
        ? { status: 'available', version: result.updateInfo.version }
        : { status: 'idle' }
    )
  }

  /** Download the available update, then quit and relaunch into it. */
  async download(): Promise<void> {
    if (!this.updater || !canStartLauncherUpdate(this.state)) return
    const { version } = this.state
    this.set({ status: 'downloading', version, percent: 0 })
    try {
      await this.updater.downloadUpdate()
    } catch (err) {
      this.set({
        status: 'error',
        version,
        message: err instanceof Error ? err.message : String(err)
      })
      return
    }
    this.updater.quitAndInstall(true, true)
  }

  private get downloading(): boolean {
    return this.state.status === 'downloading'
  }

  private set(state: LauncherUpdateState): void {
    this.state = { current: this.current, ...state }
    this.emit('change', this.state)
  }
}
