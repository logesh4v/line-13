#!/usr/bin/env node
/**
 * Exercise the episode-validation hook against every nearby input and print
 * the captured result (what Kiro would hand back to the agent).
 *
 *   node scripts/hook-demo.mjs
 *
 * Each case is copied to packages/contracts/fixtures/__hook-demo.json (a path the
 * hook's matcher accepts), the PostFileSave hooks are fired for it, then the file
 * is removed. Cases that need gate flags (--recovery-limit, --allow-ambiguity) cannot be
 * expressed through the hook's fixed command, so those run the gate directly.
 */
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CASES, writeCases } from './episode-cases.mjs';
import { fire } from './run-hook.mjs';

const dir = mkdtempSync(join(tmpdir(), 'line13-demo-'));
writeCases(dir);
const target = 'packages/contracts/fixtures/__hook-demo.json';

for (const c of CASES) {
  console.log(`\n=== ${c.name}${c.args ? `  (${c.args.join(' ')})` : ''}`);
  if (c.args) {
    const r = spawnSync('node', ['scripts/episode-check.mjs', ...c.args, join(dir, c.name)], { encoding: 'utf8' });
    console.log(`gate exit=${r.status}`);
    console.log((r.stdout + r.stderr).trimEnd().replaceAll(dir, '<tmp>'));
    continue;
  }
  copyFileSync(join(dir, c.name), target);
  try {
    const results = fire('PostFileSave', target);
    for (const r of results) {
      console.log(`hook "${r.hook}" exit=${r.status}`);
      console.log((r.stdout + r.stderr).trimEnd());
    }
  } finally {
    rmSync(target, { force: true });
  }
}
rmSync(dir, { recursive: true, force: true });
