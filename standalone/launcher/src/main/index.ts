import { app, shell, BrowserWindow, ipcMain, WebContentsView } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AppStore } from './appStore'
import { handlePiappProtocol, registerPiappScheme } from './protocol'
import { PIAPP_SCHEME } from './config'
import { loadSettings, saveSettings } from './settings'
import { HOME_NOTCH_HEIGHT, HOME_NOTCH_WIDTH } from '../shared/constants'
import type { LauncherSettings, UpdateProgress } from '../shared/types'

// Serve installed app bundles over piapp://. Must be registered before app 'ready'.
registerPiappScheme()

// In dev, mirror the 720x1280 panel at half size so the (tall) window fits a normal monitor:
// the window is half-size AND every webContents is zoomed to 0.5, so content still lays out at
// full panel resolution and is merely drawn smaller. Prod is 1:1.
const DEV_SCALE = is.dev ? 0.5 : 1

const store = new AppStore()
let mainWindow: BrowserWindow | null = null
let appView: WebContentsView | null = null
let homeButton: WebContentsView | null = null

/** Keep a webContents zoomed to DEV_SCALE across every (re)load. */
function keepZoomed(wc: Electron.WebContents): void {
  wc.on('did-finish-load', () => wc.setZoomFactor(DEV_SCALE))
}

/** Load the launcher renderer into a view/window, optionally in a query-selected role. */
function loadRenderer(webContents: Electron.WebContents, query?: Record<string, string>): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    void webContents.loadURL(url.toString())
  } else {
    void webContents.loadFile(
      join(__dirname, '../renderer/index.html'),
      query ? { query } : undefined
    )
  }
}

function createWindow(): void {
  // Raspberry Pi touchscreen is a 1280x720 panel mounted vertically → portrait 720x1280.
  mainWindow = new BrowserWindow({
    width: 720 * DEV_SCALE,
    height: 1280 * DEV_SCALE,
    // Treat width/height as the content area so the window frame/title bar doesn't shrink it
    // (otherwise the zoomed board is <1280px tall and scrolls).
    useContentSize: true,
    show: false,
    autoHideMenuBar: true,
    // Kiosk on the Pi; windowed in dev so it's not full-screen while iterating.
    fullscreen: !is.dev,
    kiosk: !is.dev,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Keep the portrait 9:16 ratio when resized in dev (fullscreen kiosk fills the panel anyway).
  mainWindow.setAspectRatio(720 / 1280)

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('resize', layoutViews)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  keepZoomed(mainWindow.webContents)
  loadRenderer(mainWindow.webContents)
}

/** App view fills the whole panel; the Home button floats over its bottom-centre. */
function layoutViews(): void {
  if (!mainWindow) return
  const { width, height } = mainWindow.getContentBounds()
  const w = HOME_NOTCH_WIDTH * DEV_SCALE
  const h = HOME_NOTCH_HEIGHT * DEV_SCALE
  appView?.setBounds({ x: 0, y: 0, width, height })
  homeButton?.setBounds({
    x: Math.round((width - w) / 2),
    y: 0, // hangs from the top edge
    width: Math.round(w),
    height: Math.round(h)
  })
}

/** Create the floating Home button overlay once and keep it warm across launches. */
function ensureHomeButton(): WebContentsView {
  if (!homeButton) {
    homeButton = new WebContentsView({
      webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
    })
    homeButton.setBackgroundColor('#00000000') // transparent so only the circle shows over the app
    keepZoomed(homeButton.webContents)
    loadRenderer(homeButton.webContents, { role: 'overlay' })
  }
  return homeButton
}

/**
 * Show an installed app full-screen with the floating Home button layered on top. An optional
 * query (e.g. `mode=tournament`) is appended to the launch URL so one bundle can back several
 * home tiles; the protocol resolves files by pathname, so the query only reaches the app.
 *
 * Each launch gets its own view, loaded off-screen and only composited once it has painted — the
 * current screen (old app, or the home grid) stays up until then, so no stale frame or blank flash.
 */
function launchApp(id: string, query?: string): void {
  if (!mainWindow) return
  if (!store.getActiveDir(id)) throw new Error(`App "${id}" is not installed`)

  // piapp:// is a secure scheme (apps need a secure context for crypto.randomUUID etc.), but apps
  // talk to the LAN server over plain http. Disable webSecurity for the app view so those
  // same-device, same-LAN requests aren't blocked as mixed content — acceptable on a kiosk.
  const next = new WebContentsView({ webPreferences: { sandbox: true, webSecurity: false } })
  next.setBackgroundColor('#0f172a') // neutral dark in case any sub-frame gap shows through
  keepZoomed(next.webContents)
  // Lay out at the full panel up front so the first paint (while still detached) is correct.
  const { width, height } = mainWindow.getContentBounds()
  next.setBounds({ x: 0, y: 0, width, height })

  const previous = appView
  appView = next

  let revealed = false
  const reveal = (): void => {
    if (revealed) return
    revealed = true
    // A newer launch superseded this one (or the window went away) → discard this view.
    if (!mainWindow || appView !== next) {
      next.webContents.close()
      return
    }
    const cv = mainWindow.contentView
    cv.addChildView(next)
    // (Re-)stack the Home button on top of the freshly added app view.
    const home = ensureHomeButton()
    if (cv.children.includes(home)) cv.removeChildView(home)
    cv.addChildView(home)
    layoutViews()
    if (previous) {
      cv.removeChildView(previous)
      previous.webContents.close()
    }
  }
  next.webContents.once('did-finish-load', reveal)
  // Don't strand the user on the old app if the new one fails to load.
  next.webContents.once('did-fail-load', reveal)

  void next.webContents.loadURL(`${PIAPP_SCHEME}://${id}/index.html${query ? `?${query}` : ''}`)
  mainWindow.webContents.send('launcher:activeApp', id)
}

/** Detach the Home button (kept warm) and tear down the running app view; back to the home grid. */
function goHome(): void {
  if (!mainWindow) return
  const cv = mainWindow.contentView
  if (homeButton && cv.children.includes(homeButton)) cv.removeChildView(homeButton)
  if (appView) {
    if (cv.children.includes(appView)) cv.removeChildView(appView)
    appView.webContents.close()
    appView = null
  }
  mainWindow.webContents.send('launcher:activeApp', null)
}

function registerIpc(): void {
  ipcMain.handle('launcher:listInstalled', () => store.listInstalled())
  ipcMain.handle('launcher:checkForUpdates', () => store.checkForUpdates())
  ipcMain.handle('launcher:installOrUpdate', (_e, id: string) => store.installOrUpdate(id))
  ipcMain.handle('launcher:launchApp', (_e, id: string, query?: string) => launchApp(id, query))
  ipcMain.handle('launcher:goHome', () => goHome())
  ipcMain.handle('launcher:getSettings', () => loadSettings())
  ipcMain.handle('launcher:setSettings', (_e, patch: Partial<LauncherSettings>) =>
    saveSettings(patch)
  )

  store.on('progress', (p: UpdateProgress) => mainWindow?.webContents.send('launcher:progress', p))
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.pi-darts.launcher')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Load installed bundles (seeding on first run), then serve them over piapp:// and wire IPC.
  await store.init()
  handlePiappProtocol(store)
  registerIpc()
  createWindow()

  // Auto-apply app updates on launch when a release is reachable (apps-only = low risk); any
  // failure silently keeps the working version.
  const settings = await loadSettings()
  if (settings.autoUpdateOnLaunch) {
    void store.autoUpdateInstalled().then((ids) => {
      if (ids.length) mainWindow?.webContents.send('launcher:autoUpdated', ids)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
