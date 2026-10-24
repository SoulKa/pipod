import { describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ModalOverlay from '../ModalOverlay.vue'

function mountOverlay(
  props: { title: string; width?: number } = { title: 'Settings' }
): VueWrapper {
  return mount(ModalOverlay, {
    props,
    slots: {
      default: '<p class="content">body</p>',
      'head-tools': '<button class="tool">Tool</button>'
    }
  })
}

describe('ModalOverlay', () => {
  it('renders the title and projects the default + head-tools slots', () => {
    const overlay = mountOverlay()
    expect(overlay.find('.head h2').text()).toBe('Settings')
    expect(overlay.find('.content').text()).toBe('body')
    expect(overlay.find('.head-tools .tool').exists()).toBe(true)
  })

  it('emits close when the Close button is clicked', async () => {
    const overlay = mountOverlay()
    await overlay.get('.head-tools button:last-child').trigger('click')
    expect(overlay.emitted('close')).toHaveLength(1)
  })

  it('closes on a scrim click but not on a panel click', async () => {
    const overlay = mountOverlay()

    await overlay.find('.panel').trigger('click')
    expect(overlay.emitted('close')).toBeUndefined()

    await overlay.find('.scrim').trigger('click')
    expect(overlay.emitted('close')).toHaveLength(1)
  })

  it('applies the width prop as the --panel-width custom property', () => {
    const overlay = mountOverlay({ title: 'Wide', width: 640 })
    expect(overlay.find('.panel').attributes('style')).toContain('--panel-width: 640px')
  })
})
