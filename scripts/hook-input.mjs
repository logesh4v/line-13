/**
 * Shared helpers for scripts run from Kiro hooks.
 *
 * Kiro passes hook event data as JSON on STDIN (kiro.dev/docs/hooks/actions).
 * The documented examples show `prompt` and `tool_input`; the file-event payload
 * field names are not documented, so the saved path is looked up under every
 * plausible key. Unknown payload => null, and callers fall back to a full check
 * instead of silently doing nothing.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PATH_KEYS = ['file_path', 'filePath', 'path', 'file', 'filename'];

function pick(obj) {
  if (obj === null || typeof obj !== 'object') return [];
  const found = [];
  for (const key of PATH_KEYS) {
    if (typeof obj[key] === 'string') found.push(obj[key]);
  }
  for (const key of ['files', 'paths', 'file_paths']) {
    if (Array.isArray(obj[key])) found.push(...obj[key].filter((v) => typeof v === 'string'));
  }
  return found;
}

/** Paths named by the hook payload on STDIN, or null when STDIN is a TTY / empty / unparseable. */
export function filesFromHookInput() {
  if (process.stdin.isTTY) return null;
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8').trim();
  } catch {
    return null;
  }
  if (raw === '') return null;
  try {
    const payload = JSON.parse(raw);
    const paths = [...pick(payload), ...pick(payload.tool_input), ...pick(payload.event)];
    return paths.length > 0 ? [...new Set(paths)] : null;
  } catch {
    return null;
  }
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.pbt']);

export function walk(dir, accept, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, accept, out);
    else if (accept(relative(process.cwd(), full))) out.push(full);
  }
  return out;
}

/** Every shipped episode JSON: `fixtures/` or `episodes/` directories (not deliberate bad cases). */
export const EPISODE_PATH = /(^|\/)(fixtures|episodes)\/[^/]+\.json$/;

export function episodeFilesInRepo() {
  return walk('.', (p) => EPISODE_PATH.test(p));
}
