import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VirtualKeyboard from './VirtualKeyboard.vue'
import { KEYBOARD_HEIGHT_VAR } from './keyboardHeight'

type Keyboard = VueWrapper

function keyByText(wrapper: Keyboard, text: string) {
  const key = wrapper.findAll('button').find((b) => b.text() === text)
  if (!key) throw new Error(`no key labelled "${text}"`)
  return key
}

function keyByLabel(wrapper: Keyboard, label: string) {
  return wrapper.get(`button[aria-label="${label}"]`)
}

function lastValue(wrapper: Keyboard): string | undefined {
  const events = wrapper.emitted('update:modelValue')
  return events?.at(-1)?.[0] as string | undefined
}

describe('VirtualKeyboard', () => {
  it('offers umlauts and the punctuation used in place names', () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'x' } })
    const labels = wrapper.findAll('button').map((b) => b.text())
    for (const key of ['ü', 'ö', 'ä', 'ß', '.', '-', ',']) {
      expect(labels).toContain(key)
    }
  })

  it('auto-capitalises the first character', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: '' } })
    await keyByText(wrapper, 'Q').trigger('click')
    expect(lastValue(wrapper)).toBe('Q')
  })

  it('stays lower case mid-word', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'Stuttg' } })
    await keyByText(wrapper, 'a').trigger('click')
    expect(lastValue(wrapper)).toBe('Stuttga')
  })

  it('auto-capitalises after a space', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'Bad ' } })
    await keyByText(wrapper, 'C').trigger('click')
    expect(lastValue(wrapper)).toBe('Bad C')
  })

  it('applies manual shift to a single key only', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'ab' } })
    await keyByLabel(wrapper, 'Shift').trigger('click')
    await keyByText(wrapper, 'C').trigger('click')
    expect(lastValue(wrapper)).toBe('abC')

    // Shift disarmed itself, so the next key is lower case again.
    await wrapper.setProps({ modelValue: 'abC' })
    await keyByText(wrapper, 'd').trigger('click')
    expect(lastValue(wrapper)).toBe('abCd')
  })

  it('keeps ß single-width when shifted', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'stra' } })
    await keyByLabel(wrapper, 'Shift').trigger('click')
    await keyByText(wrapper, 'ß').trigger('click')
    expect(lastValue(wrapper)).toBe('straß')
  })

  it('types digits and spaces verbatim', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'Gleis' } })
    await keyByLabel(wrapper, 'Space').trigger('click')
    expect(lastValue(wrapper)).toBe('Gleis ')

    await wrapper.setProps({ modelValue: 'Gleis ' })
    await keyByText(wrapper, '7').trigger('click')
    expect(lastValue(wrapper)).toBe('Gleis 7')
  })

  it('deletes the last character', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'abc' } })
    await keyByLabel(wrapper, 'Backspace').trigger('click')
    expect(lastValue(wrapper)).toBe('ab')
  })

  it('refuses to type past maxlength but still deletes', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'abcd', maxlength: 4 } })
    await keyByText(wrapper, 'e').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await keyByLabel(wrapper, 'Backspace').trigger('click')
    expect(lastValue(wrapper)).toBe('abc')
  })

  it('emits close from the done key', async () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: 'a' } })
    await keyByLabel(wrapper, 'Done').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('publishes its height while open and clears it on close', () => {
    const wrapper = mount(VirtualKeyboard, { props: { modelValue: '' } })
    expect(document.documentElement.style.getPropertyValue(KEYBOARD_HEIGHT_VAR)).not.toBe('')

    wrapper.unmount()
    expect(document.documentElement.style.getPropertyValue(KEYBOARD_HEIGHT_VAR)).toBe('')
  })
})
