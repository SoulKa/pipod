import { describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import StorePanel from '../StorePanel.vue'
import type { CatalogEntry } from '../../../../shared/types'

function entry(over: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'board',
    name: 'Board',
    description: 'The scorer',
    icon: 'icon.png',
    installed: false,
    installedVersion: null,
    availableVersion: '1.0.0',
    updateAvailable: false,
    ...over
  }
}

function mountStore(catalog: CatalogEntry[] = [entry()]): VueWrapper {
  return mount(StorePanel, { props: { catalog, progress: {} } })
}

describe('StorePanel', () => {
  it('emits home when the back button is clicked', async () => {
    const store = mountStore()
    await store.get('.back').trigger('click')
    expect(store.emitted('home')).toHaveLength(1)
  })

  it('emits refresh when "Check for updates" is clicked', async () => {
    const store = mountStore()
    await store.get('.check').trigger('click')
    expect(store.emitted('refresh')).toHaveLength(1)
  })

  it('emits install with the entry id for an actionable row', async () => {
    const store = mountStore([entry({ id: 'console', name: 'Console' })])
    await store.get('.row .primary').trigger('click')
    expect(store.emitted('install')).toEqual([['console']])
  })
})
