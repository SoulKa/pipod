import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SetupScreen from '../SetupScreen.vue'

function mountSetup() {
  const el = document.createElement('div')
  el.id = 'app'
  document.body.appendChild(el)
  // Teleports the options overlay to #app, so that element has to exist.
  return mount(SetupScreen, { attachTo: el })
}

function keyboard() {
  return document.body.querySelector('.kb')
}

function pressKey(text: string) {
  const keys = [...document.body.querySelectorAll<HTMLButtonElement>('.kb button')]
  const key = keys.find((b) => b.textContent?.trim() === text)
  if (!key) throw new Error(`no key labelled "${text}"`)
  key.click()
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('SetupScreen', () => {
  it('names a player through the shared on-screen keyboard', async () => {
    const wrapper = mountSetup()
    const field = wrapper.get('input.name-field')
    expect(keyboard()).toBeNull()

    await field.trigger('click')
    expect(keyboard()).not.toBeNull()

    pressKey('A')
    await wrapper.vm.$nextTick()
    pressKey('n')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('input.name-field').element.value).toBe('An')

    // "Fertig" keeps the board's original wording for the close key.
    document.body.querySelector<HTMLButtonElement>('.kb button[aria-label="Done"]')?.click()
    await wrapper.vm.$nextTick()
    expect(keyboard()).toBeNull()
  })

  it('opens the keyboard on the row added by "Spieler hinzufügen"', async () => {
    const wrapper = mountSetup()
    const addButton = wrapper.findAll('button').find((b) => b.text().includes('Spieler hinzufügen'))
    await addButton?.trigger('click')

    expect(wrapper.findAll('input.name-field')).toHaveLength(2)
    expect(keyboard()).not.toBeNull()
    // The new (second) row owns the keyboard.
    expect(wrapper.findAll('.player')[1]?.classes()).toContain('editing')
  })

  it('starts a game once two named players are in the throwing order', async () => {
    const wrapper = mountSetup()
    const addButton = wrapper.findAll('button').find((b) => b.text().includes('Spieler hinzufügen'))
    await addButton?.trigger('click')

    const fields = wrapper.findAll('input.name-field')
    for (const [i, field] of fields.entries()) {
      field.element.value = `P${i + 1}`
      await field.trigger('input')
    }

    // Tap both name chips to build the throwing order, then start.
    for (const chip of wrapper.findAll('.chip')) await chip.trigger('click')
    await wrapper.get('.start').trigger('click')

    expect(wrapper.emitted('start')?.[0]?.[0]).toMatchObject({ names: ['P1', 'P2'] })
  })
})
