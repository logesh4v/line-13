import { expect, test } from '@playwright/test';

import {
  CALLERS,
  ENDING_CROSSED,
  ENDING_FIRST,
  ENDING_THIRTEENTH,
  answer,
  cleanNight,
  crossedNight,
  jack,
  noHorizontalOverflow,
  reachEnding,
  route,
  routeCaller,
  skipIntro,
  statusLine,
  watchErrors,
} from './helpers.ts';

test.describe('core playthrough', () => {
  test('the entrance ends by itself and lands on a ringing line', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'LINE 13 opening sequence' })).toBeVisible();
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing', {
      timeout: 12_000,
    });
    await expect(page.getByRole('dialog', { name: 'LINE 13 opening sequence' })).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('intro skip: Escape, the skip button and a click all skip', async ({ page }) => {
    await skipIntro(page);
    await expect(statusLine(page)).toContainText('RINGING');

    await page.goto('/');
    await page.locator('.entrance-skip').click();
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');

    await page.goto('/');
    await page.locator('.entrance').click({ position: { x: 5, y: 5 } });
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
  });

  test('first paint shows the room and the status words, never a blank page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.room')).toBeVisible();
    await expect(statusLine(page)).not.toHaveText('');
    await expect(page.locator('.entrance-skip')).toBeVisible();
    expect('DELIBERATELY BROKEN (throwaway CI check)').toBe('green');
  });

  test('correct route: First Connection, no crossed lines', async ({ page }) => {
    const errors = watchErrors(page);
    await skipIntro(page);
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
    await expect(page.locator('.ending')).toContainText('You crossed no lines.');
    expect(errors).toEqual([]);
  });

  test('wrong-route recovery: status names the crossing, pulling the cord recovers', async ({
    page,
  }) => {
    await skipIntro(page);
    await answer(page, 'caller-ruth');
    await route(page, 'caller-ruth', 'destination-morgue', { reject: true });
    await expect(statusLine(page)).toContainText('LINE 03 HOLDING');
    await expect(page.locator('.room')).toHaveAttribute('data-haunt', '1');
    await route(page, 'caller-ruth', 'destination-bell-tower');
    for (const id of CALLERS.slice(1)) {
      await routeCaller(page, id);
    }
    expect(await reachEnding(page)).toContain(ENDING_CROSSED);
  });

  test('ending 2: one to three crossed lines is The Crossed Line', async ({ page }) => {
    await skipIntro(page);
    await crossedNight(page, 3);
    expect(await reachEnding(page)).toContain(ENDING_CROSSED);
  });

  test('ending 3: four crossed lines is The Thirteenth Operator, haunt reaches 4', async ({
    page,
  }) => {
    await skipIntro(page);
    await crossedNight(page, 4);
    await expect(page.locator('.room')).toHaveAttribute('data-haunt', '4');
    expect(await reachEnding(page)).toContain(ENDING_THIRTEENTH);
  });

  test('reopen frees a closed circuit and the night still completes', async ({ page }) => {
    await skipIntro(page);
    await routeCaller(page, 'caller-ruth');
    await page.getByRole('button', { name: /^Reopen circuit: Ruth Bell/ }).click();
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'holding');
    await route(page, 'caller-ruth', 'destination-bell-tower');
    for (const id of CALLERS.slice(1)) {
      await routeCaller(page, id);
    }
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
  });

  test('replay: Take another shift restarts at a ringing line with a clean state', async ({
    page,
  }) => {
    await skipIntro(page);
    await crossedNight(page, 1);
    await reachEnding(page);
    await page.getByRole('button', { name: 'Take another shift' }).click();
    await expect(page.locator('.ending')).toBeHidden();
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
    await expect(page.locator('.room')).toHaveAttribute('data-haunt', '0');
    // and the second shift can earn a different ending
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
    await page.getByRole('button', { name: 'Take another shift' }).click();
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
  });

  test('ending panel takes focus and lists all three endings', async ({ page }) => {
    await skipIntro(page);
    await cleanNight(page);
    await reachEnding(page);
    await expect(page.locator('.ending h2')).toBeFocused();
    await expect(page.locator('.ending-ledger li')).toHaveCount(3);
  });

  test('no horizontal overflow on the board, in play and at the end', async ({ page }) => {
    await skipIntro(page);
    await noHorizontalOverflow(page);
    await answer(page, 'caller-ruth');
    await noHorizontalOverflow(page);
    await route(page, 'caller-ruth', 'destination-bell-tower');
    for (const id of CALLERS.slice(1)) {
      await routeCaller(page, id);
    }
    await reachEnding(page);
    await noHorizontalOverflow(page);
  });
});
