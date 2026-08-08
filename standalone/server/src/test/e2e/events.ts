// Buffers every inbound socket event from the moment a client connects, so a test can
// await an event that already arrived. Without this, anything the server pushes between
// `emit` and the test attaching a listener would be lost — and dispatch is that fast.
import type { ServerToClientEvents } from '@pipod/shared'

export type ServerEvent = keyof ServerToClientEvents
export type PayloadOf<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>[0]

interface Entry {
  event: string
  payload: unknown
}

interface Waiter {
  event: string
  predicate?: (payload: never) => boolean
  settle: (payload: unknown) => void
}

export interface WaitOptions<E extends ServerEvent> {
  predicate?: (payload: PayloadOf<E>) => boolean
  timeoutMs?: number
}

export class EventRecorder {
  private readonly entries: Entry[] = []
  /** Indices already handed to a waiter, so successive waits return successive events. */
  private readonly consumed = new Set<number>()
  private waiters: Waiter[] = []

  record(event: string, payload: unknown): void {
    this.entries.push({ event, payload })
    this.settle()
  }

  /** Every payload received for an event, including ones already awaited. */
  all<E extends ServerEvent>(event: E): PayloadOf<E>[] {
    return this.entries.filter((e) => e.event === event).map((e) => e.payload as PayloadOf<E>)
  }

  last<E extends ServerEvent>(event: E): PayloadOf<E> | undefined {
    return this.all(event).at(-1)
  }

  /** Await the next unconsumed matching event, rejecting on timeout. */
  async wait<E extends ServerEvent>(event: E, opts: WaitOptions<E> = {}): Promise<PayloadOf<E>> {
    const payload = await this.waitOptional(event, opts)
    if (payload === null) {
      throw new Error(
        `timed out waiting for "${event}" — received: ${this.entries.map((e) => e.event).join(', ') || '(nothing)'}`,
      )
    }
    return payload
  }

  /** Same as `wait`, but resolves null on timeout — for "expect nothing more" polling. */
  waitOptional<E extends ServerEvent>(
    event: E,
    opts: WaitOptions<E> = {},
  ): Promise<PayloadOf<E> | null> {
    const immediate = this.take(event, opts.predicate)
    if (immediate !== null) return Promise.resolve(immediate)

    return new Promise((resolve) => {
      const waiter: Waiter = {
        event,
        predicate: opts.predicate as Waiter['predicate'],
        settle: (payload) => {
          clearTimeout(timer)
          resolve(payload as PayloadOf<E>)
        },
      }
      this.waiters.push(waiter)
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter)
        resolve(null)
      }, opts.timeoutMs ?? 4000)
      timer.unref?.()
    })
  }

  private take<E extends ServerEvent>(
    event: E,
    predicate?: (payload: PayloadOf<E>) => boolean,
  ): PayloadOf<E> | null {
    for (let i = 0; i < this.entries.length; i++) {
      if (this.consumed.has(i)) continue
      const entry = this.entries[i]!
      if (entry.event !== event) continue
      if (predicate && !predicate(entry.payload as PayloadOf<E>)) continue
      this.consumed.add(i)
      return entry.payload as PayloadOf<E>
    }
    return null
  }

  private settle(): void {
    for (const waiter of [...this.waiters]) {
      const payload = this.take(waiter.event as ServerEvent, waiter.predicate as never)
      if (payload === null) continue
      this.waiters = this.waiters.filter((w) => w !== waiter)
      waiter.settle(payload)
    }
  }
}
