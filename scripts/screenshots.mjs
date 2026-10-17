#!/usr/bin/env node
/**
 * Capture the README screenshots from the Trailhead demo.
 *
 *   docker compose up --build                   # the demo, on http://localhost:8200
 *   npm install && npx playwright install chromium   # once, from the repository root
 *   npm run screenshots
 *
 * Signs in as the demo reviewer (and the demo admin for the setup page), opens each screen at
 * the same size and saves it to docs/images/. It only looks: nothing is approved or delivered,
 * so it can run any number of times. For the screens to match the README, run it on a fresh
 * demo (docker compose down -v, then up). Options: --url (default http://localhost:8200),
 * --out (default docs/images), --chromium (a Chromium to use instead of Playwright's own).
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8200' },
    out: { type: 'string', default: 'docs/images' },
    chromium: { type: 'string' },
  },
})

const PASSWORD = 'trailhead-demo'
const REVIEWER = 'reviewer@trailhead.example'
const ADMIN = 'admin@trailhead.example'
const FRENCH = '/review/trailhead/fr'

// 1440 by 900 at twice the pixels: sharp on high-resolution screens, readable when GitHub scales it down.
const VIEWPORT = { width: 1440, height: 900 }

async function signIn(browser, email) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(args.url + '/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  return page
}

async function open(page, address) {
  await page.goto(args.url + address)
  await settle(page)
}

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0) // no hover effects in the picture
}

/**
 * fit: crop below the last content (pages shorter than the window).
 * full: the whole page, however tall (pages longer than the window).
 */
async function shot(page, name, caption, { fit = false, full = false } = {}) {
  const file = path.join(args.out, `${name}.png`)
  let clip
  if (fit) {
    const bottom = await page.evaluate(() =>
      Math.max(...[...document.querySelectorAll('main *')].map((e) => e.getBoundingClientRect().bottom)),
    )
    clip = { x: 0, y: 0, width: VIEWPORT.width, height: Math.min(VIEWPORT.height, Math.ceil(bottom) + 48) }
  }
  await page.screenshot({ path: file, clip, fullPage: full })
  console.log(`${file}  ${caption}`)
}

await mkdir(args.out, { recursive: true })
const browser = await chromium.launch(args.chromium ? { executablePath: args.chromium } : {})
try {
  const reviewer = await signIn(browser, REVIEWER)

  await open(reviewer, '/')
  await shot(reviewer, '01-projects', 'Projects and languages, with review progress', { fit: true })

  await open(reviewer, `${FRENCH}?view=list&status=all`)
  await shot(reviewer, '02-list', 'French in the list view: status, quality warnings, character counts')

  await open(reviewer, `${FRENCH}?view=single&key=nav.trails`)
  await shot(reviewer, '03-edited', 'A reviewer edit, with the word diff against DeepL')

  await open(reviewer, `${FRENCH}?view=single&key=auth.welcome`)
  await shot(reviewer, '04-qa-error', 'A missing placeholder: the quality check blocks approval')

  await open(reviewer, `${FRENCH}?view=list&status=review`)
  await reviewer.getByRole('checkbox', { name: 'Select all shown strings' }).check()
  await settle(reviewer)
  await shot(reviewer, '05-bulk', 'Bulk approve: strings with errors are skipped')
  await reviewer.keyboard.press('Escape')

  await open(reviewer, `${FRENCH}?view=list&status=all`)
  await reviewer.getByRole('button', { name: /^Deliver \d/ }).click()
  await reviewer.getByRole('dialog').waitFor()
  await settle(reviewer)
  await shot(reviewer, '06-deliver', 'Deliver: what the next deepl sync pull will bring')
  await reviewer.keyboard.press('Escape')

  await open(reviewer, `${FRENCH}?view=single&key=trail.share`)
  await reviewer.keyboard.press('Control+/')
  await reviewer.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
  await settle(reviewer)
  await shot(reviewer, '07-shortcuts', 'Phrase-style keyboard shortcuts, with their reference')

  const admin = await signIn(browser, ADMIN)
  await open(admin, '/admin/projects/trailhead')
  await shot(admin, '08-setup', 'A project as the admin sees it: languages, API keys, setup steps', { full: true })
} finally {
  await browser.close()
}
