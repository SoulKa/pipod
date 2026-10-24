import { expect, test } from '@playwright/test'
import { uniqueName } from '../../support/api'

test('a tournament created in the admin console shows up on the viewer', async ({ page }) => {
  const name = uniqueName('Console')

  await page.goto('/admin')
  // Enter submits, so the on-screen keyboard that opens with the field can't cover the button.
  const field = page.getByPlaceholder('Name des neuen Turniers')
  await field.fill(name)
  await field.press('Enter')
  await expect(page.getByRole('heading', { name })).toBeVisible()

  // `/` follows the newest tournament while none is active — the one just created.
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByText('Live-Feed')).toBeVisible()
})
