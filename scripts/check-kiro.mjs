#!/usr/bin/env node
/**
 * Kiroween rule gate: .kiro must be present, tracked and not ignored, and the
 * files the build depends on must exist.
 *
 *   node scripts/check-kiro.mjs [--root <dir>]
 *
 * Fails (exit 1) when:
 *   - a required .kiro / fixture / asset file is missing
 *   - any file under .kiro is untracked or modified-but-unstaged state is irrelevant; only
 *     "not in git index" counts (git ls-files), so a fresh clone in CI sees what a judge sees
 *   - .gitignore, .git/info/exclude or a global ignore matches .kiro (git check-ignore)
 *   - .gitignore has an active (non-comment) line naming .kiro
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = rootIndex >= 0 ? args[rootIndex + 1] : process.cwd();

const REQUIRED = [
  '.kiro/specs/line-13/requirements.md',
  '.kiro/specs/line-13/design.md',
  '.kiro/specs/line-13/tasks.md',
  '.kiro/steering/architecture.md',
  '.kiro/steering/product.md',
  '.kiro/steering/visual-language.md',
  '.kiro/hooks',
  'packages/contracts/fixtures/minimal-episode.json',
  'packages/contracts/src/episode.schema.json',
  'apps/web/src/episode/bundled-episode.ts',
  'docs/submission/kiro-evidence.md',
  'LICENSE',
];

function git(...gitArgs) {
  return spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' });
}

const problems = [];
for (const file of REQUIRED) {
  if (!existsSync(join(root, file))) problems.push(`missing required path: ${file}`);
}

if (!existsSync(join(root, '.kiro'))) {
  problems.push('.kiro directory is missing');
} else {
  const tracked = git('ls-files', '--', '.kiro').stdout.split('\n').filter(Boolean);
  if (tracked.length === 0) problems.push('.kiro has no tracked files (not committed)');
  const onDisk = git('ls-files', '--cached', '--others', '--exclude-standard', '--', '.kiro')
    .stdout.split('\n')
    .filter(Boolean);
  const untracked = onDisk.filter((f) => !tracked.includes(f));
  for (const f of untracked) problems.push(`untracked file under .kiro: ${f}`);
  const ignored = git('ls-files', '--others', '--ignored', '--exclude-standard', '--', '.kiro')
    .stdout.split('\n')
    .filter(Boolean);
  for (const f of ignored) problems.push(`ignored file under .kiro: ${f}`);
  if (git('check-ignore', '-q', '.kiro/steering/architecture.md').status === 0) {
    problems.push('git ignores .kiro (check-ignore matched)');
  }
}

const ignorePath = join(root, '.gitignore');
if (existsSync(ignorePath)) {
  readFileSync(ignorePath, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const t = line.trim();
      if (t !== '' && !t.startsWith('#') && !t.startsWith('!') && /(^|\/)\.kiro(\/|\*|$)/.test(t)) {
        problems.push(`.gitignore:${i + 1} lists .kiro: ${t}`);
      }
    });
}

if (problems.length > 0) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log(`check-kiro: ${REQUIRED.length} required paths present; .kiro tracked and not ignored`);
