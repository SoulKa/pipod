import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TrainBoard from './TrainBoard.vue'
import type { Departure } from '@/composables/useTrains'

const NOW = new Date('2026-01-01T10:00:00Z')

function dep(overrides: Partial<Departure>): Departure {
  return {
    line: 'S1',
    direction: 'Plochingen',
    scheduledTime: new Date('2026-01-01T10:05:00Z'),
    realtimeTime: null,
    delayMinutes: 0,
    platform: '1',
    cancelled: false,
    ...overrides,
  }
}

function mountBoard(departures: Departure[]) {
  return mount(TrainBoard, {
    props: { departures, loading: false, error: null, lastUpdated: NOW },
  })
}

describe('TrainBoard filtering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides cancelled departures', () => {
    const wrapper = mountBoard([
      dep({ direction: 'CancelledDir', cancelled: true }),
      dep({ direction: 'RunningDir', cancelled: false }),
    ])
    expect(wrapper.text()).not.toContain('CancelledDir')
    expect(wrapper.text()).toContain('RunningDir')
    wrapper.unmount()
  })

  it('hides departures whose effective time has already passed', () => {
    const wrapper = mountBoard([
      dep({ direction: 'PastDir', scheduledTime: new Date('2026-01-01T09:59:00Z') }),
      dep({ direction: 'FutureDir', scheduledTime: new Date('2026-01-01T10:05:00Z') }),
    ])
    expect(wrapper.text()).not.toContain('PastDir')
    expect(wrapper.text()).toContain('FutureDir')
    wrapper.unmount()
  })

  it('keeps a delayed departure whose realtime estimate is still in the future', () => {
    const wrapper = mountBoard([
      dep({
        direction: 'DelayedDir',
        scheduledTime: new Date('2026-01-01T09:59:00Z'),
        realtimeTime: new Date('2026-01-01T10:03:00Z'),
        delayMinutes: 4,
      }),
    ])
    expect(wrapper.text()).toContain('DelayedDir')
    wrapper.unmount()
  })
})
