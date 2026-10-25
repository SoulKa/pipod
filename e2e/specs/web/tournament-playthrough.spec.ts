import { expect, test, type Locator, type Page } from '@playwright/test'
import { uniqueName } from '../../support/api'
import { waitUntilArmed } from '../../support/board'
import { BOARD_URL } from '../../support/stack'

// The whole tournament through the real UIs: set up and started in the admin console, every
// leg scored by tapping on a board, followed on the viewer. The results are scripted, so the
// test can say exactly how the table, the bracket and the champion must come out. Every tap
// that changes the board's screen bounces (see `bouncyTap`), so a bounce that got through —
// a skipped intro, a starter picked for the players, a stray dart — breaks the script.
const PLAYERS = ['Anna', 'Ben', 'Cem']

/**
 * Who wins each group match, keyed by its two players in name order. Cem tops the table
 * though he was added last, so a table that merely kept the roster order would fail.
 */
const GROUP_WINNERS: Record<string, string> = {
  'Anna Cem': 'Cem',
  'Ben Cem': 'Cem',
  'Anna Ben': 'Anna',
}
const TABLE = ['Cem', 'Anna', 'Ben']

/** The top two meet in a best-of-3 final, which the runner-up takes 2–1. */
const FINAL_LEGS = ['Anna', 'Cem', 'Anna']
const CHAMPION = 'Anna'

/** The Pi's portrait touchscreen; in a landscape viewport the board's lower half is cut off. */
const BOARD_VIEWPORT = { width: 720, height: 1280 }

test('a tournament set up in the console is played to its champion on a board', async ({
  page: admin,
  browser,
}) => {
  // Six legs of taps, each waiting on a round trip through the server.
  test.slow()
  const name = uniqueName('Playthrough')
  const floorName = uniqueName('Feld')

  await admin.goto('/admin')
  // Enter submits every field, so the on-screen keyboard never covers a button.
  await submit(admin.getByPlaceholder('Name des neuen Turniers'), name)
  await expect(admin.getByRole('heading', { name })).toBeVisible()
  for (const player of PLAYERS) {
    await submit(admin.getByPlaceholder('Spielername'), player)
    await expect(admin.locator('.players').getByText(player, { exact: true })).toBeVisible()
  }
  await submit(admin.getByPlaceholder('Feldname'), floorName)
  await expect(admin.locator('.floor-list').getByText(floorName)).toBeVisible()

  // Short legs: 301 single-out. Group matches are a single leg; the final is best of 3.
  await admin.getByLabel('Anzahl der Gruppen').selectOption('1')
  await admin.getByLabel('Qualifikanten pro Gruppe').selectOption('2')
  for (const [phase, bestOf] of [
    ['Gruppenphase', '1'],
    ['K.-o.-Phase', '3'],
  ] as const) {
    await admin.getByLabel(`Best of ${phase}`).selectOption(bestOf)
    await admin.getByLabel(`Startpunktzahl ${phase}`).selectOption('301')
    await admin.getByLabel(`Checkout-Modus ${phase}`).selectOption('single')
  }

  const viewerPath = await admin
    .getByRole('link', { name: /Übersicht öffnen/ })
    .getAttribute('href')
  const viewer = await admin.context().newPage()
  await viewer.goto(viewerPath!)
  await expect(viewer.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(viewer.getByText('Warte auf das erste Match…')).toBeVisible()

  const boardContext = await browser.newContext({ viewport: BOARD_VIEWPORT })
  const board = await boardContext.newPage()
  await joinFloor(board, name, floorName)

  await admin.getByRole('button', { name: 'Turnier starten', exact: true }).click()
  // Starting moves the console to the running tournament; auto-fill hands every ready match to
  // the board as soon as it is free.
  await admin.getByLabel('Automatisch nachfüllen').check()

  // Group phase: everyone plays everyone once, while the bracket waits for the final table.
  const bracketPending = viewer.getByText('Wird nach der Gruppenphase aus der Tabelle ausgelost.')
  await expect(bracketPending).toBeVisible()
  const played = new Set<string>()
  for (let match = 0; match < 3; match++) {
    played.add(await playMatch(board, viewer, (pair) => [GROUP_WINNERS[pair]!]))
  }
  expect([...played].sort()).toEqual(Object.keys(GROUP_WINNERS).sort())

  // Only group matches are completed yet — the final is live at most — so this is the
  // group table: two points per win.
  const rows = viewer.locator('.standings-panel tbody tr')
  await expect(rows.locator('td:first-child')).toHaveText(TABLE)
  await expect(rows.locator('td.points')).toHaveText(['4', '2', '0'])

  // The last group result drew the final from that table on its own: first against second.
  await expect(bracketPending).toBeHidden()
  const final = await playMatch(board, viewer, () => FINAL_LEGS)
  expect(final).toBe('Anna Cem')

  const finalSides = viewer.locator('.bracket .side')
  await expect(finalSides).toHaveText([/Cem\s*1/, /Anna\s*2/])
  await expect(viewer.locator('.bracket .side.win')).toHaveText(new RegExp(CHAMPION))
  await expect(viewer.locator('.completed-chip')).toContainText(`Sieger: ${CHAMPION}`)
  await expect(viewer.getByText('Turnier beendet.')).toBeVisible()
  await expect(admin.getByText('Alle geplanten Matches sind abgeschlossen.')).toBeVisible()
  await expect(board.getByRole('heading', { name: 'Board verbunden' })).toBeVisible()

  await boardContext.close()
})

async function submit(field: Locator, value: string): Promise<void> {
  await field.fill(value)
  await field.press('Enter')
}

/** Join the floor by typing the server IP — a plain browser has no launcher to search the LAN. */
async function joinFloor(board: Page, tournament: string, floor: string): Promise<void> {
  await board.goto(`${BOARD_URL}/?mode=tournament`)
  await waitUntilArmed(board)
  for (const key of '127.0.0.1') await board.getByRole('button', { name: key, exact: true }).click()
  await board.getByRole('button', { name: 'Verbinden' }).click()
  await board.getByRole('button', { name: tournament }).click()
  await board.getByRole('button', { name: floor }).click()
}

/**
 * Play the match the board was just handed, leg by leg, with the winners `legWinners` picks
 * for its pairing, and report every leg. Returns the pairing as its names in name order.
 */
async function playMatch(
  board: Page,
  viewer: Page,
  legWinners: (pair: string) => string[],
): Promise<string> {
  await bouncyTap(board, board.getByRole('button', { name: 'Game on!' }))
  await expect(board.getByRole('heading', { name: 'Wer beginnt?' })).toBeVisible()
  const seats = (await board.locator('.starter .choice').allTextContents()).map((s) => s.trim())
  const pair = [...seats].sort().join(' ')
  // Seat 0 throws first in the first leg; the board alternates the throw from there.
  await bouncyTap(board, board.locator('.starter .choice').first())

  // The viewer shows the match live as soon as the board starts scoring it.
  await expect(viewer.locator('.live-card').getByText(seats[0]!)).toBeVisible()

  const report = board.getByRole('button', { name: /Ergebnis an Server melden/ })
  const winners = legWinners(pair)
  for (const [leg, winner] of winners.entries()) {
    await playLeg(board, seats[leg % 2] === winner)
    // The next leg (or the next match) starts once the server has acknowledged this one.
    await bouncyTap(board, report)
  }
  return pair
}

/**
 * Tap a button that changes the board's screen, then tap the same spot again the moment the
 * next screen is in the page — a bouncing touch panel or a reflexive double tap at its worst.
 * The bounce is a raw mouse click, so unlike a locator click it doesn't wait for the new
 * screen to accept input. A bounce that lands shows up as a broken script, not here.
 */
async function bouncyTap(board: Page, button: Locator): Promise<void> {
  await waitUntilArmed(board)
  await button.click({ trial: true })
  const box = (await button.boundingBox())!
  // The board's screen wrapper is replaced on every screen change. Track the element itself —
  // the report button merely relabels itself while in flight.
  const current = await board.locator('.screen').elementHandle()
  await button.click()
  await board.waitForFunction((el) => !el?.isConnected, current)
  await board.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/**
 * One 301 single-out leg the chosen player wins in two turns while the other misses:
 * 3×T19 leaves 130, 2×T19 leaves 16, then a single 16. T20s and bulls play a celebration
 * clip over the pad, so the legs stick to T19s.
 */
async function playLeg(board: Page, starterWins: boolean): Promise<void> {
  await waitUntilArmed(board)
  const tap = (key: string) => board.getByRole('button', { name: key, exact: true }).click()
  const triple19 = async () => {
    await tap('Triple')
    await tap('19')
  }
  const miss = async () => {
    for (let dart = 0; dart < 3; dart++) await tap('0')
  }

  if (!starterWins) await miss()
  for (let dart = 0; dart < 3; dart++) await triple19()
  await miss()
  await triple19()
  await triple19()
  await tap('16')
}
