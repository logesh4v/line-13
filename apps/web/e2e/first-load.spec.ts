import { expect, test } from '@playwright/test';

import { jack } from './helpers.ts';

test.describe('first load', () => {
  test('a slow script never leaves a blank page: the boot plate paints first', async ({ page }) => {
    await page.route('**/assets/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.getByRole('status')).toContainText('warming up');
    await expect(page.locator('.entrance-skip')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('warming up')).toHaveCount(0);
  });

  test('a script that fails to load leaves words, not a blank page', async ({ page }) => {
    await page.route('**/assets/*.js', (route) => route.abort());
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('body')).toContainText('LINE 13');
  });

  test('the production bundle stays inside its budget', async ({ page }) => {
    let jsBytes = 0;
    page.on('response', async (response) => {
      if (response.url().endsWith('.js')) {
        jsBytes += (await response.body()).length;
      }
    });
    await page.goto('/');
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing', {
      timeout: 12_000,
    });
    // shortcut: raw (uncompressed) JS budget of 400 kB; tighten if a dependency is added.
    expect(jsBytes).toBeGreaterThan(0);
    expect(jsBytes).toBeLessThan(400_000);
  });
});
