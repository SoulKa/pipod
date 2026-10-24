import { expect, test } from '@playwright/test'
import { createFloor, createTournament, uniqueName } from '../../support/api'
import { BOARD_URL } from '../../support/stack'

// The Pi's portrait touchscreen. The board is a fixed frame of exactly this size with its
// overflow hidden, so in a landscape desktop viewport its lower half is unreachable.
test.use({ viewport: { width: 720, height: 1280 } })

test('a board joins a tournament floor by typing the server IP', async ({ page, request }) => {
  const tournament = await createTournament(request, uniqueName('Board join'))
  const floor = await createFloor(request, tournament.id, uniqueName('Feld'))

  // A plain browser has no launcher to search the LAN with, so the wizard opens on the keypad.
  await page.goto(`${BOARD_URL}/?mode=tournament`)
  await expect(page.getByText('IP des Turnier-Servers eingeben')).toBeVisible()
  // A bare IP means the server's default port, which is where the suite runs it.
  for (const key of '127.0.0.1') await page.getByRole('button', { name: key, exact: true }).click()
  await page.getByRole('button', { name: 'Verbinden' }).click()

  await page.getByRole('button', { name: tournament.name }).click()
  await page.getByRole('button', { name: floor.name }).click()

  await expect(page.getByRole('heading', { name: 'Board verbunden' })).toBeVisible()
})
