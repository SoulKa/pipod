// Small Home "notch" tab hanging from the top-centre edge over a running app. Its overlay
// WebContentsView is sized to exactly the tab so the rest of the app stays tappable.
export const HOME_NOTCH_WIDTH = 76
export const HOME_NOTCH_HEIGHT = 30

// Injected into every hosted app view (via webContents.insertCSS) so an app that renders its own
// Home button can get the default notch look for free with `class="piapp-home"` — while staying
// free to override any property or style it fully custom. Mirrors the overlay's `.home-notch`, but
// as a `position: fixed` tab in the app's own DOM (the app also hides the default overlay and
// wires the click to `fetch('/.launcher/home', { method: 'POST' })`).
export const HOME_BUTTON_CSS = `
.piapp-home {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  min-width: ${HOME_NOTCH_WIDTH}px;
  min-height: 44px;
  padding: 0 16px;
  /* tab hanging from the top edge: only the bottom corners are rounded */
  border-radius: 0 0 16px 16px;
  font-size: 18px;
  line-height: 1;
  color: #062c33;
  background: #22d3ee;
  border: none;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
  opacity: 0.85;
}
`
