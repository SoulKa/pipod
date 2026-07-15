import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  CatalogEntry,
  InstalledApp,
  LauncherBridge,
  LauncherSettings,
  NetworkState,
  UpdateProgress
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const launcher: LauncherBridge = {
  listInstalled: () => ipcRenderer.invoke('launcher:listInstalled') as Promise<InstalledApp[]>,
  checkForUpdates: () => ipcRenderer.invoke('launcher:checkForUpdates') as Promise<CatalogEntry[]>,
  installOrUpdate: (id) => ipcRenderer.invoke('launcher:installOrUpdate', id) as Promise<void>,
  launchApp: (id, query) => ipcRenderer.invoke('launcher:launchApp', id, query) as Promise<void>,
  goHome: () => ipcRenderer.invoke('launcher:goHome') as Promise<void>,
  quit: () => ipcRenderer.invoke('launcher:quit') as Promise<void>,
  getSettings: () => ipcRenderer.invoke('launcher:getSettings') as Promise<LauncherSettings>,
  setSettings: (patch) =>
    ipcRenderer.invoke('launcher:setSettings', patch) as Promise<LauncherSettings>,
  getNetworkState: () => ipcRenderer.invoke('launcher:getNetworkState') as Promise<NetworkState>,
  onProgress: (cb) => subscribe<UpdateProgress>('launcher:progress', cb),
  onActiveApp: (cb) => subscribe<string | null>('launcher:activeApp', cb),
  onAutoUpdated: (cb) => subscribe<string[]>('launcher:autoUpdated', cb)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('launcher', launcher)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.launcher = launcher
}
