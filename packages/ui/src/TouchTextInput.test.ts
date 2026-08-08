import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TouchTextInput from './TouchTextInput.vue'

const mounted: VueWrapper[] = []

// Mounts the field with both models wired back into props, the way `v-model` / `v-model:open` on a
// real parent behave — without the update listeners defineModel stays in local mode and ignores
// prop changes.
function mountField(props: Record<string, unknown> = {}) {
  const wrapper: VueWrapper = mount(TouchTextInput, {
    attachTo: document.body,
    props: {
      modelValue: '',
      open: false,
      'onUpdate:modelValue': (value: string) => void wrapper.setProps({ modelValue: value }),
      'onUpdate:open': (value: boolean) => void wrapper.setProps({ open: value }),
      ...props,
    },
  })
  mounted.push(wrapper)
  return wrapper
}

function panel() {
  return document.body.querySelector('.kb')
}

function panelKey(text: string) {
  const keys = [...document.body.querySelectorAll<HTMLButtonElement>('.kb button')]
  const key = keys.find((b) => b.textContent?.trim() === text)
  if (!key) throw new Error(`no key labelled "${text}"`)
  return key
}

afterEach(() => {
  // Unmount rather than clearing innerHTML: these instances share the module-level "which
  // keyboard is open" slot, so a leaked one would still react to the next test's field.
  while (mounted.length) mounted.pop()?.unmount()
  document.body.innerHTML = ''
})

describe('TouchTextInput', () => {
  it('keeps the keyboard closed until the field is tapped', async () => {
    const wrapper = mountField()
    expect(panel()).toBeNull()

    await wrapper.get('input').trigger('click')
    expect(panel()).not.toBeNull()
  })

  it('types into the bound value through the keyboard', async () => {
    const wrapper = mountField()
    await wrapper.get('input').trigger('click')

    panelKey('U').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('input').element.value).toBe('U')

    panelKey('l').click()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('input').element.value).toBe('Ul')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Ul'])
  })

  it('closes on the done key', async () => {
    const wrapper = mountField()
    await wrapper.get('input').trigger('click')

    document.body.querySelector<HTMLButtonElement>('.kb button[aria-label="Done"]')?.click()
    await wrapper.vm.$nextTick()
    expect(panel()).toBeNull()
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('closes when the parent clears v-model:open', async () => {
    const wrapper = mountField()
    await wrapper.get('input').trigger('click')
    expect(panel()).not.toBeNull()

    await wrapper.setProps({ open: false })
    expect(panel()).toBeNull()
  })

  it('still accepts a hardware keyboard', async () => {
    const wrapper = mountField()
    const input = wrapper.get('input')
    input.element.value = 'Vaihingen'
    await input.trigger('input')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Vaihingen'])
  })

  it('shows only one keyboard when a second field is tapped', async () => {
    const first = mountField()
    const second = mountField()

    await first.get('input').trigger('click')
    await second.get('input').trigger('click')
    await first.vm.$nextTick()

    expect(document.body.querySelectorAll('.kb')).toHaveLength(1)
  })

  it('uses the placeholder as the panel heading when no label is given', async () => {
    const wrapper = mountField({ placeholder: 'Search for a city…' })
    await wrapper.get('input').trigger('click')
    expect(document.body.querySelector('.kb-label')?.textContent).toBe('Search for a city…')
  })
})
