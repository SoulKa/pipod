// Driving the darts board, whose screens ignore taps for a moment after they appear.
import { expect, type Page } from '@playwright/test'

/**
 * Wait until the board takes taps again. Every screen the board shows — including the first
 * one after a page load — is tap-guarded as it appears, and Playwright's own click checks
 * don't know that, so a deliberate tap must wait here first or be silently swallowed.
 */
export async function waitUntilArmed(board: Page): Promise<void> {
  await expect(board.locator('[data-tap-guard]')).toHaveCount(0)
}
