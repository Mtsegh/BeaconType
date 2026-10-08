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

    await expect(page.locator('h1', { hasText: 'Beacon Type' })).toBeVisible({ timeout: 15000 })

    // Phase-2 coach UI: recommendation, why-reason and the seeded lessons.
    await expect(page.getByText('Recommended next')).toBeVisible()
    await expect(page.getByText('Why this lesson?')).toBeVisible()
    await expect(page.getByText("Today's goal")).toBeVisible()
    await expect(page.getByRole('button', { name: /punctuation/ })).toBeVisible()

    await page.getByRole('button', { name: /home-row/ }).click()
    await expect(page.locator('.passage')).toBeVisible()

    const passage = (await page.locator('.passage').innerText()).trim()
    expect(passage.length).toBeGreaterThan(0)

    await page.keyboard.type(passage)

    await expect(page.getByRole('heading', { name: 'Transmission complete' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Session saved locally')).toBeVisible({ timeout: 10000 })

    // The coach recomputes after the save and offers a different lesson.
    await expect(page.getByText('Next mission')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Start next lesson' }).click()
    await expect(page.locator('.passage')).toBeVisible()
  } finally {
    await app.close()
  }
})