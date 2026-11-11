import { chromium } from 'playwright-core';

const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const OUT = '/Users/logesh/workplace/line-13-episode/docs/evidence/screens';
const URL = 'http://127.0.0.1:5199/';
const SOL = {
  'caller-ruth': 'destination-bell-tower',
  'caller-amos': 'destination-orchard',
  'caller-tobias': 'destination-cistern',
  'caller-ines': 'destination-morgue',
};
const ORDER = Object.keys(SOL);
const log = (m) => console.log(m);

async function open(browser, opts) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w, height: opts.h },
    hasTouch: !!opts.touch, isMobile: !!opts.touch,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  return { ctx, page, errors };
}
const focusedId = (page) => page.evaluate(() => document.activeElement?.dataset?.jackId ?? null);
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');

// keyboard-only primitives
async function kbJack(page, id) {
  for (let i = 0; i < 30; i += 1) {
    if ((await focusedId(page)) === id) { await page.keyboard.press('Enter'); return; }
    // arrows walk operable jacks when focus is inside the field, Tab otherwise
    const inField = await page.evaluate(() => !!document.activeElement?.closest('.jack-field'));
    await page.keyboard.press(inField ? 'ArrowRight' : 'Tab');
  }
  throw new Error('could not reach ' + id + ' by keyboard');
}
async function kbButton(page, name) {
  for (let i = 0; i < 40; i += 1) {
    if ((await focusedText(page)).startsWith(name)) { await page.keyboard.press('Enter'); return; }
    await page.keyboard.press('Tab');
  }
  throw new Error('could not reach button ' + name);
}
async function kbRoute(page, id, dest) {
  await kbJack(page, id);   // lift
  await kbJack(page, dest); // plug
  await kbButton(page, 'Close the circuit');
  await page.waitForSelector(`[data-jack-id="${id}"][data-lamp="steady"]`, { timeout: 3000 });
}

const mouse = async (page, id) => jackLoc(page, id).click();
const jackLoc = (page, id) => page.locator(`[data-jack-id="${id}"]`);
async function mouseRoute(page, id, dest, touch) {
  const t = (x) => (touch ? jackLoc(page, x).tap() : jackLoc(page, x).click());
  await t(id); await t(dest);
  await page.getByRole('button', { name: 'Close the circuit' }).click();
  await page.waitForSelector(`[data-jack-id="${id}"][data-lamp="steady"]`, { timeout: 3000 });
}
async function shot(page, name, full = false) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  log('screenshot ' + name + '.png');
}

const browser = await chromium.launch({ executablePath: EXE });
try {
  // A. keyboard-only, muted from the start (SOUND switch via keyboard), clean night
  {
    const { ctx, page, errors } = await open(browser, { w: 1280, h: 800 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="ringing"]');
    // mute with the keyboard
    await page.getByRole('switch', { name: 'Cut all exchange sound' }).focus();
    await page.keyboard.press('Space');
    log('muted switch aria-checked=' + (await page.getByRole('switch', { name: 'Cut all exchange sound' }).getAttribute('aria-checked')));
    for (const id of ORDER) {
      await kbJack(page, id); // answer
      await page.waitForSelector(`[data-jack-id="${id}"][data-lamp="holding"]`);
      if (id === 'caller-ruth') await shot(page, 'keyboard-muted-captions');
      await kbRoute(page, id, SOL[id]);
    }
    await page.waitForSelector('[data-jack-id="line-13"][data-lamp="ringing"]');
    await kbJack(page, 'line-13');
    await page.waitForSelector('.ending');
    log('keyboard-only muted: ending=' + (await page.locator('.ending h2').innerText()));
    log('ending heading focused=' + (await page.evaluate(() => document.activeElement?.tagName)));
    log('keyboard/muted errors=' + errors.length);
    await ctx.close();
  }

  // B. reduced motion + high contrast: sigil is static, still readable, ending reachable
  {
    const { ctx, page, errors } = await open(browser, { w: 1280, h: 800, reduced: true });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="ringing"]');
    await page.getByRole('switch', { name: /contrast/i }).click();
    log('contrast=' + (await page.evaluate(() => document.documentElement.dataset.contrast)) + ' motion=' + (await page.evaluate(() => document.documentElement.dataset.motion)));
    // one wrong route first so the haunt shows under both settings
    await jackLoc(page, 'caller-ruth').click();
    await jackLoc(page, 'caller-ruth').click();
    await jackLoc(page, 'destination-morgue').click();
    await page.getByRole('button', { name: 'Close the circuit' }).click();
    await page.getByRole('button', { name: 'Pull the cord' }).click();
    await jackLoc(page, 'caller-ruth').click();
    await jackLoc(page, 'destination-orchard').click();
    await page.getByRole('button', { name: 'Close the circuit' }).click();
    await page.getByRole('button', { name: 'Pull the cord' }).click();
    await shot(page, 'reduced-motion-high-contrast-crossed');
    await mouseRoute(page, 'caller-ruth', SOL['caller-ruth']);
    for (const id of ORDER.slice(1)) {
      await jackLoc(page, id).click();
      await page.waitForSelector(`[data-jack-id="${id}"][data-lamp="holding"]`);
      await mouseRoute(page, id, SOL[id]);
    }
    await page.waitForSelector('[data-jack-id="line-13"][data-lamp="ringing"]');
    const anim = await page.evaluate(() => {
      const s = document.querySelector('.sigil-stroke');
      const cs = getComputedStyle(s);
      return { name: cs.animationName, offset: cs.strokeDashoffset, duration: cs.animationDuration };
    });
    log('reduced-motion sigil stroke: ' + JSON.stringify(anim));
    await shot(page, 'reduced-motion-high-contrast-sigil');
    await jackLoc(page, 'line-13').click();
    await page.waitForSelector('.ending');
    await shot(page, 'reduced-motion-high-contrast-ending');
    log('reduced/contrast: ending=' + (await page.locator('.ending h2').innerText()));
    log('reduced/contrast errors=' + errors.length);
    await ctx.close();
  }

  // C. tablet touch, 820x1180
  {
    const { ctx, page, errors } = await open(browser, { w: 820, h: 1180, touch: true });
    await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="ringing"]', { timeout: 9000 });
    for (const id of ORDER) {
      await jackLoc(page, id).tap();
      await page.waitForSelector(`[data-jack-id="${id}"][data-lamp="holding"]`);
      if (id === 'caller-tobias') await shot(page, 'tablet-820-routing', true);
      await mouseRoute(page, id, SOL[id], true);
    }
    await page.waitForSelector('[data-jack-id="line-13"][data-lamp="ringing"]');
    await page.waitForTimeout(3500);
    await shot(page, 'tablet-820-sigil', true);
    await jackLoc(page, 'line-13').tap();
    await page.waitForSelector('.ending');
    await shot(page, 'tablet-820-ending');
    log('tablet touch: ending=' + (await page.locator('.ending h2').innerText()));
    log('tablet overflow px=' + (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)));
    log('tablet errors=' + errors.length);
    await ctx.close();
  }

  // D. 320px phone: touch drag from line to jack, then clean night, no overflow, tap targets >= 44
  {
    const { ctx, page, errors } = await open(browser, { w: 320, h: 640, touch: true });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="ringing"]');
    await jackLoc(page, 'caller-ruth').tap();
    await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="holding"]');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter((b) => !b.disabled).map((b) => {
        const r = b.getBoundingClientRect();
        return { t: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) };
      }).filter((b) => b.w < 44 || b.h < 44));
    log('320px enabled buttons under 44px: ' + JSON.stringify(small));
    await shot(page, 'mobile-320-holding', true);
    await mouseRoute(page, 'caller-ruth', SOL['caller-ruth'], true);
    for (const id of ORDER.slice(1)) {
      await jackLoc(page, id).tap();
      await page.waitForSelector(`[data-jack-id="${id}"][data-lamp="holding"]`);
      await mouseRoute(page, id, SOL[id], true);
    }
    await page.waitForSelector('[data-jack-id="line-13"][data-lamp="ringing"]');
    await page.waitForTimeout(3500);
    await shot(page, 'mobile-320-sigil', true);
    await jackLoc(page, 'line-13').tap();
    await page.waitForSelector('.ending');
    await shot(page, 'mobile-320-ending', true);
    log('320 overflow px=' + (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)));
    log('320 errors=' + errors.length);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('---DONE---');
