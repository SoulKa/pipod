import type { Directive } from 'vue'

/** Long enough to outlast a touch-panel bounce or a reflexive double tap, short enough
 *  that nobody reading the new screen notices it. */
export const TAP_GUARD_MS = 400

const guards = new WeakMap<Element, () => void>()

function swallow(event: Event) {
  event.preventDefault()
  event.stopImmediatePropagation()
}

/**
 * Ignore clicks on `el` (and everything inside it) for `TAP_GUARD_MS`, for elements that
 * appear on their own while a finger may still be bouncing on the glass. Guarding an element
 * again restarts its guard.
 *
 * The click is swallowed in the capture phase rather than via `pointer-events: none`, which
 * would let the tap fall through to whatever sits underneath. While pending, the element
 * carries `data-tap-guard` so apps can show it as not-yet-ready.
 */
export function guardTaps(el: Element): void {
  guards.get(el)?.()
  el.setAttribute('data-tap-guard', '')
  el.addEventListener('click', swallow, true)
  const release = () => {
    clearTimeout(timer)
    el.removeEventListener('click', swallow, true)
    el.removeAttribute('data-tap-guard')
    guards.delete(el)
  }
  const timer = setTimeout(release, TAP_GUARD_MS)
  guards.set(el, release)
}

/** `v-tap-guard`: `guardTaps` from the moment the element mounts. */
export const vTapGuard: Directive<Element> = {
  mounted(el) {
    guardTaps(el)
  },
  beforeUnmount(el) {
    guards.get(el)?.()
  },
}
