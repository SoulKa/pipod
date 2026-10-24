import { createTournament, uniqueName } from '../../support/api'
import { SERVER_PORT } from '../../support/stack'
import { expect, test } from '../../fixtures/launcher'

test('the tournament board finds the server on the LAN and joins it with a tap', async ({
  launcher,
  request,
}) => {
  const tournament = await createTournament(request, uniqueName('Discovery'))

  // Inside the launcher the wizard opens on the server list, filled over UDP broadcast through
  // the launcher's streaming `/.launcher/discover` — the suite's server answers on its port.
  const board = await launcher.open('Tournament Board', 'board-tournament')
  const server = board.getByRole('button', { name: `:${SERVER_PORT}` })
  await expect(server.first()).toBeVisible()

  await server.first().click()
  await expect(board.getByRole('button', { name: tournament.name })).toBeVisible()
})
