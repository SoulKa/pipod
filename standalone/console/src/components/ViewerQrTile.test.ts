import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('../api', () => ({
  api: { getInfo: vi.fn(async () => ({ publicOrigin: 'http://192.168.0.5:3000' })) },
}))
vi.mock('qrcode', () => ({
  default: { toString: vi.fn(async (url: string) => `<svg data-url="${url}"></svg>`) },
}))

import ViewerQrTile from './ViewerQrTile.vue'

describe('ViewerQrTile', () => {
  it('shows the code for the LAN address without being opened', async () => {
    const tile = mount(ViewerQrTile, { props: { path: '/' } })
    await flushPromises()

    expect(tile.find('.qr-tile svg').attributes('data-url')).toBe('http://192.168.0.5:3000/')
    tile.unmount()
  })

  it('enlarges into a dialog on click, which Escape closes', async () => {
    const tile = mount(ViewerQrTile, { props: { path: '/view/t1' }, attachTo: document.body })
    await flushPromises()

    await tile.find('.qr-tile').trigger('click')
    expect(document.body.querySelector('[role="dialog"] .qr-url')?.textContent).toBe(
      'http://192.168.0.5:3000/view/t1',
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    tile.unmount()
  })
})
