import { constants, promises as fs } from 'fs'
import { join } from 'path'
import { MIN_BRIGHTNESS_PERCENT } from '@shared/constants'
import type { BacklightState } from '@shared/types'

// The kernel exposes display backlights here (Touch Display 2 included). The node's name depends
// on the driver and the I²C bus it sits on, so take whatever device is present rather than
// hardcoding one; the Pi has a single panel.
const BACKLIGHT_ROOT = '/sys/class/backlight'

const UNAVAILABLE: BacklightState = { available: false, writable: false, percent: 100 }

/** Clamp to the floor so the panel can never be dimmed to black with no way to see the slider. */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 100
  return Math.min(100, Math.max(MIN_BRIGHTNESS_PERCENT, Math.round(percent)))
}

async function readInt(path: string): Promise<number | null> {
  try {
    const n = Number.parseInt(await fs.readFile(path, 'utf8'), 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** First backlight device with a usable max_brightness, or null (no panel, or not Linux). */
async function findDevice(root: string): Promise<{ dir: string; max: number } | null> {
  let names: string[]
  try {
    names = (await fs.readdir(root)).sort()
  } catch {
    return null
  }
  for (const name of names) {
    const dir = join(root, name)
    const max = await readInt(join(dir, 'max_brightness'))
    if (max && max > 0) return { dir, max }
  }
  return null
}

export async function readBacklight(root = BACKLIGHT_ROOT): Promise<BacklightState> {
  const device = await findDevice(root)
  if (!device) return UNAVAILABLE
  const file = join(device.dir, 'brightness')
  const raw = (await readInt(file)) ?? device.max
  // sysfs nodes are root-owned by default; writing needs the udev rule from the README.
  const writable = await fs.access(file, constants.W_OK).then(
    () => true,
    () => false
  )
  return { available: true, writable, percent: clampPercent((raw / device.max) * 100) }
}

/** Set the panel brightness; false when there's no device or it isn't writable. Never throws. */
export async function applyBrightness(percent: number, root = BACKLIGHT_ROOT): Promise<boolean> {
  const device = await findDevice(root)
  if (!device) return false
  // Some panels have a coarse range (e.g. 0–31); never round down to 0, which turns it off.
  const raw = Math.max(1, Math.round((clampPercent(percent) / 100) * device.max))
  try {
    await fs.writeFile(join(device.dir, 'brightness'), String(raw))
    return true
  } catch (err) {
    console.warn('[launcher] backlight: could not set brightness:', (err as Error).message)
    return false
  }
}
