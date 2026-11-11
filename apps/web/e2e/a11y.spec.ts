import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  CALLERS,
  answer,
  jack,
  reachEnding,
  route,
  routeCaller,
  skipIntro,
} from './helpers.ts';

const BLOCKING = ['serious', 'critical'];

async function scan(page: Page, screen: string): Promise<void> {
  // Measure contrast against the final paint, not a mid-fade frame: jump every
  // one-shot dissolve, sigil stroke and transition to its end state. A fixed
  // wait was too short on slow CI runners (the ending fades in over 2.4 s).
  // Looping effects (the ringing pulse) have no end and are left running. The
  // app has no animationend/transitionend handlers, so this changes paint only.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getComputedTiming().iterations !== Infinity) {
        animation.finish();
      }
    }
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const blocking = results.violations
    .filter((violation) => BLOCKING.includes(violation.impact ?? ''))
    .map((violation) => ({
      screen,
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
    }));
  expect(blocking, `axe serious/critical on "${screen}"`).toEqual([]);
}

/** Walk every screen of one night: entrance, each board state, line 13, ending. */
async function everyScreen(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'LINE 13 opening sequence' })).toBeVisible();
  await scan(page, 'entrance');
  await page.keyboard.press('Escape');
  await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
  await scan(page, 'board: first ring');

  await answer(page, 'caller-ruth');
  await scan(page, 'board: call held');

  await jack(page, 'caller-ruth').click();
  await scan(page, 'board: cord in hand');

  await jack(page, 'destination-morgue').click();
  await scan(page, 'board: patched, awaiting close');

  await page.getByRole('button', { name: 'Close the circuit' }).click();
  await expect(page.locator('.status-line')).toContainText('CROSSED LINE');
  await scan(page, 'board: crossed line');
  await page.getByRole('button', { name: 'Pull the cord' }).click();

  await route(page, 'caller-ruth', 'destination-bell-tower');
  await scan(page, 'board: first circuit closed (reopen offered)');
  for (const id of CALLERS.slice(1)) {
    await routeCaller(page, id);
  }
  await expect(jack(page, 'line-13')).toHaveAttribute('data-lamp', 'ringing');
  await scan(page, 'line 13 ringing + sigil');
  await reachEnding(page);
  await scan(page, 'ending');
}

test.describe('axe-core: no serious or critical violations on any screen', () => {
  test('default settings', async ({ page }) => {
    await everyScreen(page);
  });

  test('high contrast and held motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
    await everyScreen(page);
  });
});
