import { onScopeDispose, ref, type Ref } from 'vue'

/** Whether a CSS media query matches, kept current as the window is resized. */
export function useMediaQuery(query: string): Ref<boolean> {
  const list = window.matchMedia(query)
  const matches = ref(list.matches)
  const update = (e: MediaQueryListEvent) => (matches.value = e.matches)
  list.addEventListener('change', update)
  onScopeDispose(() => list.removeEventListener('change', update))
  return matches
}
