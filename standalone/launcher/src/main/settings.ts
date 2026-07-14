import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { LauncherSettings } from '../shared/types'

const DEFAULTS: LauncherSettings = { autoUpdateOnLaunch: true }

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<LauncherSettings> {
  try {
    const raw = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Partial<LauncherSettings>
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function saveSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings> {
  const next = { ...(await loadSettings()), ...patch }
  await fs.writeFile(settingsPath(), `${JSON.stringify(next, null, 2)}\n`)
  return next
}
