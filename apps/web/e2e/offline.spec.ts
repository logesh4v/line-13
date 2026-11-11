import { expect, test } from '@playwright/test';

import {
  ENDING_FIRST,
  cleanNight,
  reachEnding,
  skipIntro,
  statusLine,
  watchErrors,
} from './helpers.ts';

/**
 * The judge's core playthrough needs no login, no backend and no audio. The
 * shipped client makes no network call of its own, so these tests stand in for
 * a backend that is slow, broken or gone and assert the page neither asks for
 * it nor depends on it.
 */
test.describe('no backend, no audio', () => {
  test('API times out: the bundled episode plays, nothing waits on the network', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const apiCalls: string[] = [];
    await page.route('**/api/**', async (route) => {
      apiCalls.push(route.request().url());
      await route.abort('timedout');
    });
    await skipIntro(page);
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
    expect(apiCalls).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('API returns invalid JSON: the bundled episode plays, no notice, no error', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"episode": [oops' }),
    );
    await skipIntro(page);
    await expect(page.locator('.status-notice')).toHaveCount(0);
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
    expect(errors).toEqual([]);
  });

  test('network gone after load: the whole night still completes offline', async ({
    page,
    context,
  }) => {
    await skipIntro(page);
    await context.setOffline(true);
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
  });

  test('every request is same-origin: no third-party script, font or beacon', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith('http') && url.origin !== new URL(process.env['BASE_URL'] ?? 'http://127.0.0.1:4173').origin) {
        foreign.push(request.url());
      }
    });
    await skipIntro(page);
    await cleanNight(page);
    await reachEnding(page);
    expect(foreign).toEqual([]);
  });

  test('no Web Audio at all: the page says so and every state is still words', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined, configurable: true });
    });
    await skipIntro(page);
    await expect(page.getByText('No audio on this browser. Captions carry every cue.')).toBeVisible();
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
    expect(errors).toEqual([]);
  });

  test('an audio context that throws or never resumes does not stop play', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      class Broken {
        constructor() {
          throw new Error('audio refused');
        }
      }
      Object.defineProperty(window, 'AudioContext', { value: Broken, configurable: true });
    });
    await skipIntro(page);
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
    await expect(statusLine(page)).toContainText('NIGHT SHIFT ENDED');
    expect(errors.filter((message) => !message.includes('audio refused'))).toEqual([]);
  });

  test('no localStorage / cookies needed: storage blocked still plays', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage blocked');
        },
      });
    });
    const errors = watchErrors(page);
    await skipIntro(page);
    await cleanNight(page);
    expect(await reachEnding(page)).toContain(ENDING_FIRST);
    expect(errors).toEqual([]);
  });
});
