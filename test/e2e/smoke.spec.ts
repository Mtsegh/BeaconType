import { _electron, expect, test } from '@playwright/test'
import path from 'node:path'

// Smoke test against the built app (run `npm run pretest` first).
// Launches real Electron, picks the seeded home-row lesson and types it out.
const ROOT = path.resolve(import.meta.dirname, '..', '..')

test('lesson flow: choose -> type -> results -> saved', async () => {
  const app = await _electron.launch({
    args: ['dist-electron/main/index.js'],
    cwd: ROOT,
  })

  try {
    const page = await app.firstWindow()

    // A truly fresh database lands on onboarding; existing test databases
    // have sessions and are treated as onboarded.
    const welcome = page.getByRole('heading', { name: 'Welcome to Beacon Type' })
    await expect(
      welcome.or(page.getByRole('heading', { name: 'Beacon Type', exact: true })),
    ).toBeVisible({ timeout: 15000 })
    if (await welcome.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Skip for now' }).click()
    }
    await expect(page.getByRole('heading', { name: 'Beacon Type', exact: true })).toBeVisible()

    // Phase-2 coach UI: recommendation, why-reason and the seeded lessons.
    await expect(page.getByText('Recommended next')).toBeVisible()
    await expect(page.getByText('Why this lesson?')).toBeVisible()
    await expect(page.getByText("Today's goal")).toBeVisible()
    await expect(page.getByRole('button', { name: /punctuation/ })).toBeVisible()

    // Phase-4 shadow comparison section renders regardless of training state.
    const shadowRegion = page.getByRole('region', { name: 'Adaptive coach (shadow)' })
    await expect(shadowRegion).toBeVisible()

    // Phase-3 experience layer: achievements + settings panel.
    await expect(page.getByText('Achievements')).toBeVisible()
    await expect(page.getByText('First transmission')).toBeVisible()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Keyboard during lessons')).toBeVisible()
    // Phase-4: adaptive coach is opt-in, default off.
    await expect(page.getByText('Adaptive Coach (shadow model)')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Keyboard during lessons')).toBeHidden()

    await page.getByRole('button', { name: /home-row/ }).click()
    await expect(page.locator('.passage')).toBeVisible()

    // Beacon, finger guide and keyboard with the next key outlined.
    await expect(page.locator('[data-beacon]')).toBeVisible()
    await expect(page.locator('.finger').first()).toBeVisible()
    await expect(page.locator('.kbd').first()).toBeVisible()
    await expect(page.locator('.kbd-target')).toBeVisible()

    const passage = (await page.locator('.passage').innerText()).trim()
    expect(passage.length).toBeGreaterThan(0)

    await page.keyboard.type(passage)

    await expect(page.getByRole('heading', { name: 'Transmission complete' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Session saved locally')).toBeVisible({ timeout: 10000 })

    // Constellation of mastery on the results screen.
    await expect(page.getByText('Constellation')).toBeVisible()

    // The coach recomputes after the save and offers a different lesson.
    await expect(page.getByText('Next mission')).toBeVisible({ timeout: 10000 })

    // Back on the select screen the shadow log has an entry for this
    // session; its outcome stays pending until a later session follows it.
    await page.getByRole('button', { name: 'Back to lessons' }).click()
    await expect(shadowRegion).toBeVisible()
    await expect(shadowRegion.getByText('pending').first()).toBeVisible()

    await page.getByRole('button', { name: 'Start recommended lesson' }).click()
    await expect(page.locator('.passage')).toBeVisible()
  } finally {
    await app.close()
  }
})
