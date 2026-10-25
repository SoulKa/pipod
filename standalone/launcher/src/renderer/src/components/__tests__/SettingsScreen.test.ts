import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import SettingsScreen from '../SettingsScreen.vue'
import type { LauncherBridge, LauncherUpdateState } from '@shared/types'

const downloadLauncherUpdate = vi.fn(async () => {})

beforeEach(() => {
  downloadLauncherUpdate.mockClear()
  window.launcher = {
    getSettings: vi.fn(async () => ({ autoUpdateOnLaunch: true })),
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
