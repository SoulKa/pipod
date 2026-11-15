import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import SettingsScreen from '../SettingsScreen.vue'
import type {
  BacklightState,
  LauncherBridge,
  LauncherSettings,
  LauncherUpdateState
} from '@shared/types'

const downloadLauncherUpdate = vi.fn(async () => {})
const previewBrightness = vi.fn(async () => {})
const setSettings = vi.fn(async (patch: Partial<LauncherSettings>) => ({
  autoUpdateOnLaunch: true,
  ...patch
}))
let backlight: BacklightState

beforeEach(() => {
  downloadLauncherUpdate.mockClear()
  previewBrightness.mockClear()
  setSettings.mockClear()
  backlight = { available: false, writable: false, percent: 100 }
  window.launcher = {
    getSettings: vi.fn(async () => ({ autoUpdateOnLaunch: true })),
    getBacklight: vi.fn(async () => backlight),
    previewBrightness,
    setSettings,
    downloadLauncherUpdate
  } as Partial<LauncherBridge> as LauncherBridge
})

function mountSettings(update: LauncherUpdateState = { status: 'idle' }): VueWrapper {
  return mount(SettingsScreen, { props: { launcherUpdate: { current: '1.0.0', ...update } } })
}

describe('SettingsScreen launcher update', () => {
  it('shows the running version and no update button when up to date', () => {
    const settings = mountSettings()
    expect(settings.get('.launcher .name').text()).toBe('piPod launcher v1.0.0')
    expect(settings.find('.launcher .primary').exists()).toBe(false)
  })

  it('starts the download when an available update is tapped', async () => {
    const settings = mountSettings({ status: 'available', version: '1.1.0' })
    expect(settings.get('.launcher .status').text()).toBe('v1.1.0 available')
    await settings.get('.launcher .primary').trigger('click')
    expect(downloadLauncherUpdate).toHaveBeenCalledOnce()
  })

  it('offers a retry after a failed download', async () => {
    const settings = mountSettings({ status: 'error', version: '1.1.0', message: 'offline' })
    expect(settings.get('.launcher .status').text()).toBe('Update failed: offline')
    expect(settings.get('.launcher .primary').text()).toBe('Retry')
    await settings.get('.launcher .primary').trigger('click')
    expect(downloadLauncherUpdate).toHaveBeenCalledOnce()
  })

  it('shows download progress without a button', () => {
    const settings = mountSettings({ status: 'downloading', version: '1.1.0', percent: 42.4 })
    expect(settings.get('.launcher .status').text()).toContain('42%')
    expect(settings.find('.launcher .primary').exists()).toBe(false)
    expect(settings.find('progress').exists()).toBe(true)
  })
})

describe('SettingsScreen brightness', () => {
  it('hides the slider when there is no backlight', async () => {
    const settings = mountSettings()
    await flushPromises()
    expect(settings.find('.brightness').exists()).toBe(false)
  })

  it('previews while dragging and persists on release', async () => {
    backlight = { available: true, writable: true, percent: 80 }
    const settings = mountSettings()
    await flushPromises()
    const slider = settings.get('.brightness input')
    expect((slider.element as HTMLInputElement).value).toBe('80')

    // Not setValue(): it fires `change` too, which is the release.
    ;(slider.element as HTMLInputElement).value = '40'
    await slider.trigger('input')
    expect(previewBrightness).toHaveBeenLastCalledWith(40)
    expect(setSettings).not.toHaveBeenCalled()

    await slider.trigger('change')
    expect(setSettings).toHaveBeenCalledWith({ brightness: 40 })
  })

  it('explains a missing write permission', async () => {
    backlight = { available: true, writable: false, percent: 100 }
    const settings = mountSettings()
    await flushPromises()
    expect(settings.get('.brightness .hint').text()).toContain('README')
  })
})
