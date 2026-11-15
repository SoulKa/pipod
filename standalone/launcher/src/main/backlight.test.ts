import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { applyBrightness, clampPercent, readBacklight } from './backlight'
import { MIN_BRIGHTNESS_PERCENT } from '@shared/constants'

let root: string

async function addDevice(name: string, max: number, current: number): Promise<string> {
  const dir = join(root, name)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, 'max_brightness'), `${max}\n`)
  await fs.writeFile(join(dir, 'brightness'), `${current}\n`)
  return dir
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'pipod-backlight-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('clampPercent', () => {
  it('keeps the panel from being dimmed below the floor', () => {
    expect(clampPercent(0)).toBe(MIN_BRIGHTNESS_PERCENT)
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(42.6)).toBe(43)
    expect(clampPercent(Number.NaN)).toBe(100)
  })
})

describe('readBacklight', () => {
  it('reports unavailable when there is no backlight device', async () => {
    expect(await readBacklight(join(root, 'missing'))).toEqual({
      available: false,
      writable: false,
      percent: 100
    })
    expect((await readBacklight(root)).available).toBe(false)
  })

  it('reads the current level as a percentage of max_brightness', async () => {
    await addDevice('11-0045', 31, 15)
    expect(await readBacklight(root)).toEqual({ available: true, writable: true, percent: 48 })
  })

  it('skips devices without a usable max_brightness', async () => {
    await fs.mkdir(join(root, 'a-broken'))
    await addDevice('b-panel', 255, 255)
    expect((await readBacklight(root)).percent).toBe(100)
  })
})

describe('applyBrightness', () => {
  it('scales the percentage to the device range', async () => {
    const dir = await addDevice('panel', 255, 255)
    expect(await applyBrightness(50, root)).toBe(true)
    expect(await fs.readFile(join(dir, 'brightness'), 'utf8')).toBe('128')
  })

  it('never writes 0 on a coarse panel', async () => {
    const dir = await addDevice('panel', 5, 5)
    await applyBrightness(0, root)
    expect(await fs.readFile(join(dir, 'brightness'), 'utf8')).toBe('1')
  })

  it('returns false without a device', async () => {
    expect(await applyBrightness(80, root)).toBe(false)
  })
})
