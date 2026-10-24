import { expect, test } from '../../fixtures/launcher'

test('installs the seeded apps on first start and lists them on the home screen', async ({
  launcher,
}) => {
  const { home } = launcher

  for (const tile of ['Darts Board', 'Tournament Board', 'Dashboard']) {
    await expect(home.getByRole('button', { name: tile })).toBeVisible()
  }
})

test('opens an app from its tile, served over piapp://', async ({ launcher }) => {
  const board = await launcher.open('Darts Board', 'board')

  // The local scorer starts on its player setup.
  await expect(board.getByRole('button', { name: 'Spieler hinzufügen' })).toBeVisible()
})
