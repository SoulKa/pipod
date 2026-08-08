import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { LogLevel, LogLine } from '@pipod/shared'
import LogTerminal from './LogTerminal.vue'

const TIME = '2026-08-08T10:11:12.000Z'

/** The terminal shows local time, so derive the expectation instead of pinning a zone. */
function localTime(iso: string): string {
  const at = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

function line(seq: number, level: LogLevel, message: string, fields?: Record<string, string>) {
  const entry: LogLine = { seq, time: TIME, level, message }
  return fields ? { ...entry, fields } : entry
}

const lines: LogLine[] = [
  line(1, 'debug', 'match queued on floor', { floor: 'Board 1', players: 'Ann vs Bob' }),
  line(2, 'info', 'leg reported', { winner: 'Ann', score: '1-0' }),
  line(3, 'warn', 'board disconnected', { board: 'board-1' }),
]

function render(over: { lines?: LogLine[]; connected?: boolean } = {}) {
  return mount(LogTerminal, {
    props: { lines: over.lines ?? lines, connected: over.connected ?? true },
  })
}

describe('LogTerminal', () => {
  it('renders every line with its time, level and fields', () => {
    const rows = render().findAll('.log-line')

    expect(rows).toHaveLength(3)
    expect(rows[0]?.find('.log-time').text()).toBe(localTime(TIME))
    expect(rows[0]?.find('.log-level').text()).toBe('DEBUG')
    expect(rows[0]?.text()).toContain('floor=Board 1')
  })

  it('hides lines below the selected level', async () => {
    const wrapper = render()

    await wrapper.find('select').setValue('warn')

    const rows = wrapper.findAll('.log-line')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('board disconnected')
    expect(wrapper.find('.log-hidden').text()).toContain('2')
  })

  it('filters on message and field text', async () => {
    const wrapper = render()

    await wrapper.find('input[type="search"]').setValue('ann vs')

    const rows = wrapper.findAll('.log-line')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('match queued on floor')
  })

  it('freezes the view while paused and catches up on resume', async () => {
    const wrapper = render({ lines: lines.slice(0, 1) })

    await wrapper.find('button[aria-pressed]').trigger('click')
    await wrapper.setProps({ lines })
    expect(wrapper.findAll('.log-line')).toHaveLength(1)

    await wrapper.find('button[aria-pressed]').trigger('click')
    expect(wrapper.findAll('.log-line')).toHaveLength(3)
  })

  it('reports clear and close to the shell instead of handling them itself', async () => {
    const wrapper = render()
    const buttons = wrapper.findAll('.log-actions button')

    await buttons[1]?.trigger('click')
    await buttons[2]?.trigger('click')

    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('shows the connection state and an empty hint', () => {
    const wrapper = render({ lines: [], connected: false })

    expect(wrapper.find('.log-state').text()).toBe('getrennt')
    expect(wrapper.find('.log-empty').text()).toBe('Noch keine Log-Zeilen.')
  })

  it('explains an empty view that is only empty because of the filter', async () => {
    const wrapper = render()

    await wrapper.find('input[type="search"]').setValue('nothing matches this')

    expect(wrapper.find('.log-empty').text()).toBe('Keine Zeile passt zum Filter.')
  })
})
