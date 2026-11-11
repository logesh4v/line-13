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
const ALL = ['destination-bell-tower', 'destination-orchard', 'destination-morgue', 'destination-chapel', 'destination-cistern'];

const results = [];
const log = (m) => { console.log(m); results.push(m); };

async function open(browser, { w, h, touch = false, reduced = false, contrast = false }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    forcedColors: 'none',
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  return { ctx, page, errors };
}

const jack = (page, id) => page.locator(`[data-jack-id="${id}"]`);
async function tap(page, id, touch) {
  const l = jack(page, id);
  if (touch) await l.tap(); else await l.click();
}
async function skipIntro(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="ringing"]', { timeout: 4000 });
}
async function answer(page, id, touch) {
  await tap(page, id, touch);
  await page.waitForSelector(`[data-jack-id="${id}"][data-lamp="holding"]`, { timeout: 3000 });
}
async function route(page, id, dest, touch, { expectRejected = false } = {}) {
  await tap(page, id, touch);
  await tap(page, dest, touch);
  await page.getByRole('button', { name: 'Close the circuit' }).click();
  const state = expectRejected ? 'flicker' : 'steady';
  await page.waitForSelector(`[data-jack-id="${id}"][data-lamp="${state}"]`, { timeout: 3000 });
  if (expectRejected) await page.getByRole('button', { name: 'Pull the cord' }).click();
}
async function status(page) { return (await page.locator('.status-line').innerText()).trim(); }
async function shot(page, name) { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: name.startsWith('mobile') }); log(`screenshot ${name}.png`); }

async function finish(page, touch, name, prefix) {
  await page.waitForSelector('[data-jack-id="line-13"][data-lamp="ringing"]', { timeout: 4000 });
  await page.waitForTimeout(3600); // let the sigil finish drawing
  await shot(page, `${prefix}-sigil`);
  await tap(page, 'line-13', touch);
  await page.waitForSelector('.ending', { timeout: 3000 });
  const heading = (await page.locator('.ending h2').innerText()).trim();
  const transition = await page.locator('.ending').getAttribute('data-transition');
  await page.waitForTimeout(2800);
  await shot(page, `${prefix}-ending`);
  log(`${name}: ending="${heading}" transition=${transition}`);
  return heading;
}

const browser = await chromium.launch({ executablePath: EXE });
try {
  // 1. CLEAN ending, desktop, mouse. Includes a quick look at the entrance.
  {
    const { ctx, page, errors } = await open(browser, { w: 1440, h: 900 });
    await page.waitForTimeout(1500);
    await shot(page, 'desktop-entrance');
    await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="ringing"]', { timeout: 9000 });
    log('entrance finished by itself within 9s (6s timeline)');
    await shot(page, 'desktop-first-ring');
    for (const id of ORDER) {
      await answer(page, id, false);
      if (id === 'caller-amos') await shot(page, 'desktop-two-callers');
      await route(page, id, SOL[id], false);
    }
    await shot(page, 'desktop-all-routed');
    const h = await finish(page, false, 'clean', 'desktop-ending-1-clean');
    if (!h.includes('First Connection')) throw new Error('clean ending wrong: ' + h);
    log(`clean errors=${errors.length}`);
    await ctx.close();
  }

  // 2. CROSSED ending: wrong route FIRST, one crossing; desktop.
  {
    const { ctx, page, errors } = await open(browser, { w: 1440, h: 900 });
    await skipIntro(page);
    await answer(page, 'caller-ruth', false);
    await route(page, 'caller-ruth', 'destination-morgue', false, { expectRejected: true });
    log('crossed: wrong-route-first status after pull = ' + (await status(page)));
    await tap(page, 'caller-ruth', false); // lift again
    await tap(page, 'destination-bell-tower', false);
    await page.getByRole('button', { name: 'Close the circuit' }).click();
    await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="steady"]');
    for (const id of ORDER.slice(1)) {
      await answer(page, id, false);
      await route(page, id, SOL[id], false);
    }
    const h = await finish(page, false, 'crossed', 'desktop-ending-2-crossed');
    if (!h.includes('Crossed Line')) throw new Error('crossed ending wrong: ' + h);
    log(`crossed errors=${errors.length}`);
    await ctx.close();
  }

  // 3. POSSESSED ending: all-wrong then recovery for every caller, mobile 390 touch.
  {
    const { ctx, page, errors } = await open(browser, { w: 390, h: 844, touch: true });
    await page.waitForTimeout(1500);
    await shot(page, 'mobile-390-entrance');
    await page.waitForSelector('[data-jack-id="caller-ruth"][data-lamp="ringing"]', { timeout: 9000 });
    await shot(page, 'mobile-390-first-ring');
    await answer(page, 'caller-ruth', true);
    let n = 0;
    for (const wrong of ALL.filter((d) => d !== SOL['caller-ruth'])) {
      await route(page, 'caller-ruth', wrong, true, { expectRejected: true });
      n += 1;
      if (n === 1) await shot(page, 'mobile-390-crossed-1');
      if (n === 2) await shot(page, 'mobile-390-line13-listening');
      if (n === 4) await shot(page, 'mobile-390-line13-takes-line');
    }
    log('possessed: room data-haunt = ' + (await page.locator('.room').getAttribute('data-haunt')));
    await route(page, 'caller-ruth', SOL['caller-ruth'], true);
    for (const id of ORDER.slice(1)) {
      await answer(page, id, true);
      await route(page, id, SOL[id], true);
    }
    await shot(page, 'mobile-390-all-routed');
    const h = await finish(page, true, 'possessed', 'mobile-390-ending-3-possessed');
    if (!h.includes('Thirteenth Operator')) throw new Error('possessed ending wrong: ' + h);
    // horizontal overflow check
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log(`mobile 390 horizontal overflow px=${overflow}`);
    log(`possessed errors=${errors.length}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('---DONE---');
