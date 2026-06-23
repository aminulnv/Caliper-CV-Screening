import { test, expect } from '@playwright/test'

test.describe('Caliper smoke', () => {
  test('jobs page loads', async ({ page }) => {
    await page.goto('/jobs')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  })
})
