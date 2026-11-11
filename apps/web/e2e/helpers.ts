import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** The one solution of "The Night Roll" (proved by the graph solver). */
export const SOLUTION: Readonly<Record<string, string>> = {
  'caller-ruth': 'destination-bell-tower',
  'caller-amos': 'destination-orchard',
  'caller-tobias': 'destination-cistern',
  'caller-ines': 'destination-morgue',
};
export const CALLERS = Object.keys(SOLUTION);
export const DESTINATIONS = [
  'destination-bell-tower',
  'destination-orchard',
  'destination-morgue',
  'destination-chapel',
  'destination-cistern',
];

export const ENDING_FIRST = 'The First Connection';
export const ENDING_CROSSED = 'The Crossed Line';
export const ENDING_THIRTEENTH = 'The Thirteenth Operator';

export const jack = (page: Page, id: string): Locator => page.locator(`[data-jack-id="${id}"]`);
export const statusLine = (page: Page): Locator => page.locator('.status-line');

export type Input = 'mouse' | 'touch';

/** Collects page errors so every test can assert a clean console. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

export async function press(locator: Locator, input: Input): Promise<void> {
  if (input === 'touch') {
    await locator.tap();
  } else {
    await locator.click();
  }
}

/** Skip the entrance (Escape) and wait for the first ringing lamp. */
export async function skipIntro(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'LINE 13 opening sequence' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(jack(page, 'caller-ruth')).toHaveAttribute('data-lamp', 'ringing');
}

export async function answer(page: Page, callerId: string, input: Input = 'mouse'): Promise<void> {
  await press(jack(page, callerId), input);
  await expect(jack(page, callerId)).toHaveAttribute('data-lamp', 'holding');
}

/** Lift the cord from a held caller, plug into a destination, close or pull. */
export async function route(
  page: Page,
  callerId: string,
  destinationId: string,
  options: { input?: Input; reject?: boolean } = {},
): Promise<void> {
  const input = options.input ?? 'mouse';
  await press(jack(page, callerId), input);
  await press(jack(page, destinationId), input);
  await press(page.getByRole('button', { name: 'Close the circuit' }), input);
  if (options.reject === true) {
    await expect(jack(page, callerId)).toHaveAttribute('data-lamp', 'flicker');
    await expect(statusLine(page)).toContainText('CROSSED LINE');
    await press(page.getByRole('button', { name: 'Pull the cord' }), input);
  } else {
    await expect(jack(page, callerId)).toHaveAttribute('data-lamp', 'steady');
  }
}

export async function routeCaller(
  page: Page,
  callerId: string,
  options: { input?: Input; reject?: boolean } = {},
): Promise<void> {
  await answer(page, callerId, options.input);
  await route(page, callerId, SOLUTION[callerId] as string, options);
}

/** Answer LINE 13 once the last circuit is closed; returns the ending heading. */
export async function reachEnding(page: Page, input: Input = 'mouse'): Promise<string> {
  await expect(jack(page, 'line-13')).toHaveAttribute('data-lamp', 'ringing');
  await press(jack(page, 'line-13'), input);
  const heading = page.locator('.ending h2');
  await expect(heading).toBeVisible();
  return (await heading.innerText()).trim();
}

export async function cleanNight(page: Page, input: Input = 'mouse'): Promise<void> {
  for (const id of CALLERS) {
    await routeCaller(page, id, { input });
  }
}

/** Cross `wrong` lines on Ruth, then close her correctly and route the rest. */
export async function crossedNight(
  page: Page,
  wrong: number,
  input: Input = 'mouse',
): Promise<void> {
  await answer(page, 'caller-ruth', input);
  const wrongs = DESTINATIONS.filter((id) => id !== SOLUTION['caller-ruth']).slice(0, wrong);
  for (const destination of wrongs) {
    await route(page, 'caller-ruth', destination, { input, reject: true });
  }
  await route(page, 'caller-ruth', SOLUTION['caller-ruth'] as string, { input });
  for (const id of CALLERS.slice(1)) {
    await routeCaller(page, id, { input });
  }
}

export async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}
