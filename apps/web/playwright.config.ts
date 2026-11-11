import { defineConfig, devices } from '@playwright/test';

/**
 * Cross-browser matrix: three engines x three widths = nine projects, all
 * against the production build served by `vite preview`.
 *
 * `E2E_PROJECT_FILTER` (a regex, e.g. "chromium") narrows the matrix on a
 * memory-tight machine; CI runs every project.
 */
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
] as const;

const ENGINES = [
  { name: 'chromium', device: devices['Desktop Chrome'] },
  { name: 'webkit', device: devices['Desktop Safari'] },
  { name: 'firefox', device: devices['Desktop Firefox'] },
] as const;

const filter = process.env['E2E_PROJECT_FILTER'];
/** BASE_URL points the suite at an already-deployed site and skips the local server. */
const liveUrl = process.env['BASE_URL'];
const projects = ENGINES.flatMap((engine) =>
  WIDTHS.map(({ width, height }) => ({
    name: `${engine.name}-${width}`,
    use: {
      ...engine.device,
      viewport: { width, height },
      // Touch is emulated at phone and tablet widths. isMobile is left off:
      // Firefox does not support it.
      hasTouch: width < 1000,
      // Tests never play sound out loud. WebKit has no mute flag, so run it only
      // with audio output stubbed (shortcut: not wired here; use chromium).
      ...(engine.name === 'chromium' ? { launchOptions: { args: ['--mute-audio'] } } : {}),
    },
  })),
).filter((project) => filter === undefined || new RegExp(filter).test(project.name));

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env['CI'] ? 2 : 2,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['github']] : [['list']],
  projects,
  use: {
    baseURL: liveUrl ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: liveUrl
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
});
