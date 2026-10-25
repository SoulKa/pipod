import type { ElectronAPI } from '@electron-toolkit/preload'
import type { LauncherBridge } from '@shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    launcher: LauncherBridge
  }
}
