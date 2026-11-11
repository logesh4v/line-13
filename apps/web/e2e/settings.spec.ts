import { expect, test } from '@playwright/test';

import {
  CALLERS,
  ENDING_FIRST,
  answer,
  cleanNight,
  jack,
  press,
  reachEnding,
  route,
  routeCaller,
  skipIntro,
  statusLine,
  watchErrors,
} from './helpers.ts';

const sw = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('switch', { name });

test.describe('settings and input modes', () => {
  test('mute: the SOUND switch cuts sound, captions carry cues, the game completes', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await skipIntro(page);
    const sound = sw(page, 'Cut all exchange sound');
    await expect(sound).toHaveAttribute('aria-checked', 'false');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-checked', 'true');
    await expect(sound).toContainText('CUT');
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
    expect(errors).toEqual([]);
  });

  test('mute: a crossed line is announced as a caption, not only a sound', async ({ page }) => {
    await skipIntro(page);
    await sw(page, 'Cut all exchange sound').click();
    await answer(page, 'caller-ruth');
    await route(page, 'caller-ruth', 'destination-morgue', { reject: true });
    await expect(page.locator('.rail-glass')).toContainText(/\S/);
  });

  test('reduced motion: switch holds the room still and the night completes', async ({ page }) => {
    await skipIntro(page);
    await sw(page, 'Hold the room still').click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'held');
    await cleanNight(page);
    await reachEnding(page);
    // the sigil strokes must not be animating
    const animated = await page.evaluate(() =>
      [...document.querySelectorAll('.sigil *')].filter(
        (element) => getComputedStyle(element).animationName !== 'none',
      ).length,
    );
    expect(animated).toBe(0);
  });

  test('reduced motion: the OS preference is honoured from first paint, entrance is static', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'held');
    await expect(page.locator('.entrance')).toHaveAttribute('data-still', 'true');
    await page.keyboard.press('Escape');
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
    await context.close();
  });

  test('high contrast: switch sets the contrast mode and all three states stay readable', async ({
    page,
  }) => {
    await skipIntro(page);
    await sw(page, 'Raise panel contrast').click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await expect(statusLine(page)).toBeVisible();
    await cleanNight(page);
    await reachEnding(page);
    await expect(page.locator('.ending h2')).toBeVisible();
  });

  test('high contrast: the OS preference is honoured from first paint', async ({ page }) => {
    await page.emulateMedia({ contrast: 'more' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  });

  test('subtitles can be switched off and on', async ({ page }) => {
    await skipIntro(page);
    const subtitles = sw(page, 'Print spoken lines on the ticket rail');
    await expect(subtitles).toHaveAttribute('aria-checked', 'true');
    await subtitles.click();
    await expect(subtitles).toHaveAttribute('aria-checked', 'false');
  });

  test('keyboard only: Tab/arrows/Enter/Space reach an ending, with no pointer', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Escape');
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
    // focus is handed to the first operable jack when the entrance ends
    await expect(page.locator('button.jack:not(:disabled)').first()).toBeFocused();

    async function focusJack(id: string): Promise<void> {
      const target = jack(page, id);
      for (let step = 0; step < 14; step += 1) {
        if (await target.evaluate((element) => element === document.activeElement)) {
          return;
        }
        await page.keyboard.press('ArrowRight');
      }
      throw new Error(`could not reach ${id} by keyboard`);
    }

    for (const id of CALLERS) {
      await focusJack(id);
      await page.keyboard.press('Enter'); // answer
      await expect(jack(page, id)).toHaveAttribute('data-lamp', 'holding');
      await page.keyboard.press('Enter'); // lift the cord
      const destination = {
        'caller-ruth': 'destination-bell-tower',
        'caller-amos': 'destination-orchard',
        'caller-tobias': 'destination-cistern',
        'caller-ines': 'destination-morgue',
      }[id] as string;
      await focusJack(destination);
      await page.keyboard.press('Space'); // plug
      const close = page.getByRole('button', { name: 'Close the circuit' });
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(jack(page, id)).toHaveAttribute('data-lamp', 'steady');
      await page.locator('button.jack:not(:disabled)').first().focus();
    }
    await expect(jack(page, 'line-13')).toHaveAttribute('data-lamp', 'ringing');
    await jack(page, 'line-13').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ending h2')).toContainText(ENDING_FIRST);
    await expect(page.locator('.ending h2')).toBeFocused();
    await page.getByRole('button', { name: 'Take another shift' }).focus();
    await page.keyboard.press('Enter');
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
  });

  test('every interactive control has an accessible name and a 44px touch target', async ({
    page,
  }) => {
    await skipIntro(page);
    await answer(page, 'caller-ruth');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button:not(:disabled), [role="switch"]')]
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '',
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        })
        .filter((entry) => entry.name === '' || entry.height < 44 || entry.width < 44),
    );
    expect(small).toEqual([]);
  });

  test('touch: the whole night plays by tap', async ({ browser, browserName }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      ...(browserName === 'firefox' ? {} : { isMobile: true }),
    });
    const page = await context.newPage();
    const errors = watchErrors(page);
    await skipIntro(page);
    for (const id of CALLERS) {
      await routeCaller(page, id, { input: 'touch' });
    }
    expect(await reachEnding(page, 'touch')).toContain(ENDING_FIRST);
    await press(page.getByRole('button', { name: 'Take another shift' }), 'touch');
    await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
    expect(errors).toEqual([]);
    await context.close();
  });
});
