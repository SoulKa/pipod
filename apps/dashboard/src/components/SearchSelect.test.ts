import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchSelect from '@/components/SearchSelect.vue'

interface Option {
  label: string
}

const mounted: VueWrapper[] = []

function mountSelect(search: (query: string) => Promise<Option[]>) {
  const wrapper = mount(SearchSelect<Option>, {
    attachTo: document.body,
    props: {
      current: 'Stuttgart',
      placeholder: 'Search for a city…',
      search,
      optionLabel: (o: Option) => o.label,
    },
  })
  mounted.push(wrapper)
  return wrapper
}

function pressKey(text: string) {
  const keys = [...document.body.querySelectorAll<HTMLButtonElement>('.kb button')]
  const key = keys.find((b) => b.textContent?.trim() === text)
  if (!key) throw new Error(`no key labelled "${text}"`)
  key.click()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  // Unmount before clearing: a leaked instance still holds the shared "keyboard is open" slot
  // and would try to patch a teleport whose container has been torn out.
  while (mounted.length) mounted.pop()?.unmount()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('SearchSelect', () => {
  it('searches for text typed on the on-screen keyboard', async () => {
    const search = vi.fn(async () => [{ label: 'Ulm' }])
    const wrapper = mountSelect(search)

    await wrapper.get('input').trigger('click')
    pressKey('U')
    await wrapper.vm.$nextTick()

    // Debounced: nothing fires until the pause.
    expect(search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(search).toHaveBeenCalledWith('U')
  })

  it('debounces a burst of keystrokes into one request', async () => {
    const search = vi.fn(async () => [{ label: 'Ulm' }])
    const wrapper = mountSelect(search)

    await wrapper.get('input').trigger('click')
    for (const key of ['U', 'l', 'm']) {
      pressKey(key)
      await wrapper.vm.$nextTick()
    }
    await vi.advanceTimersByTimeAsync(300)

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('Ulm')
  })

  it('emits the pick and dismisses the keyboard', async () => {
    const search = vi.fn(async () => [{ label: 'Ulm' }])
    const wrapper = mountSelect(search)

    await wrapper.get('input').trigger('click')
    pressKey('U')
    await wrapper.vm.$nextTick()
    await vi.advanceTimersByTimeAsync(300)

    const result = wrapper.findAll('button').find((b) => b.text() === 'Ulm')
    await result?.trigger('click')

    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual({ label: 'Ulm' })
    expect(document.body.querySelector('.kb')).toBeNull()
  })
})
