// @vitest-environment node
import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LauncherUpdater } from './launcherUpdater'
import type { LauncherUpdate } from '@shared/types'

/** An electron-updater stand-in whose check/download results each test controls. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- keeps the vi.fn mock types
function fakeUpdater(available: string | null) {
  return Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(async () => ({
      isUpdateAvailable: available !== null,
      updateInfo: { version: available ?? '1.0.0' }
    })),
    downloadUpdate: vi.fn(async () => []),
    quitAndInstall: vi.fn()
  })
}

function track(updater: LauncherUpdater): LauncherUpdate[] {
  const states: LauncherUpdate[] = []
  updater.on('change', (s: LauncherUpdate) => states.push(s))
  return states
}

afterEach(() => vi.useRealTimers())

describe('LauncherUpdater', () => {
  it('is unsupported without an updater and ignores check/download', async () => {
    const updater = new LauncherUpdater(null, '1.0.0')
    await updater.check()
    await updater.download()
    expect(updater.get()).toEqual({ current: '1.0.0', status: 'unsupported' })
  })

  it('never downloads or installs on its own', () => {
    const fake = fakeUpdater('1.1.0')
    new LauncherUpdater(fake, '1.0.0')
    expect(fake.autoDownload).toBe(false)
    expect(fake.autoInstallOnAppQuit).toBe(false)
  })

  it('reports an available version after a check', async () => {
    const updater = new LauncherUpdater(fakeUpdater('1.1.0'), '1.0.0')
    await updater.check()
    expect(updater.get()).toEqual({ current: '1.0.0', status: 'available', version: '1.1.0' })
  })

  it('stays idle when up to date', async () => {
    const updater = new LauncherUpdater(fakeUpdater(null), '1.0.0')
    await updater.check()
    expect(updater.get().status).toBe('idle')
  })

  it('keeps the last state when a check fails', async () => {
    const fake = fakeUpdater('1.1.0')
    const updater = new LauncherUpdater(fake, '1.0.0')
    await updater.check()
    fake.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await updater.check()
    expect(updater.get().status).toBe('available')
  })

  it('downloads with progress, then quits and relaunches into the update', async () => {
    const fake = fakeUpdater('1.1.0')
    fake.downloadUpdate.mockImplementation(async () => {
      fake.emit('download-progress', { percent: 40 })
      return []
    })
    const updater = new LauncherUpdater(fake, '1.0.0')
    await updater.check()
    const states = track(updater)

    await updater.download()

    expect(states).toEqual([
      { current: '1.0.0', status: 'downloading', version: '1.1.0', percent: 0 },
      { current: '1.0.0', status: 'downloading', version: '1.1.0', percent: 40 }
    ])
    expect(fake.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('reports a failed download so it can be retried', async () => {
    const fake = fakeUpdater('1.1.0')
    fake.downloadUpdate.mockRejectedValueOnce(new Error('network down'))
    const updater = new LauncherUpdater(fake, '1.0.0')
    await updater.check()

    await updater.download()
    expect(updater.get()).toEqual({
      current: '1.0.0',
      status: 'error',
      version: '1.1.0',
      message: 'network down'
    })
    expect(fake.quitAndInstall).not.toHaveBeenCalled()

    await updater.download()
    expect(fake.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('does nothing on download when no update is known', async () => {
    const fake = fakeUpdater(null)
    const updater = new LauncherUpdater(fake, '1.0.0')
    await updater.check()
    await updater.download()
    expect(fake.downloadUpdate).not.toHaveBeenCalled()
  })

  it('checks on start and then periodically until stopped', async () => {
    vi.useFakeTimers()
    const fake = fakeUpdater(null)
    const updater = new LauncherUpdater(fake, '1.0.0')

    updater.start(1000)
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(3)

    updater.stop()
    await vi.advanceTimersByTimeAsync(2000)
    expect(fake.checkForUpdates).toHaveBeenCalledTimes(3)
  })
})
