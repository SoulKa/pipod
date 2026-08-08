// The keyboard is fixed to the bottom of the viewport, so it covers whatever sits there. While
// it is open it publishes its own height as this custom property on <html>; views that scroll
// (e.g. the dashboard settings sheet) reserve room with `padding-bottom: var(--pipod-kb-height)`
// so the field being typed into — and any results below it — stay reachable.
export const KEYBOARD_HEIGHT_VAR = '--pipod-kb-height'

export function publishKeyboardHeight(px: number): void {
  document.documentElement.style.setProperty(KEYBOARD_HEIGHT_VAR, `${px}px`)
}

export function clearKeyboardHeight(): void {
  document.documentElement.style.removeProperty(KEYBOARD_HEIGHT_VAR)
}
