#!/usr/bin/env node
/**
 * Repository lint (no ESLint dependency: the rules here are the ones this project
 * actually writes down).
 *   1. every .kiro/hooks/*.json has a valid hook shape and existing scripts
 *   2. every .kiro/steering/*.md front matter, when present, is a valid inclusion mode
 *   3. steering guard over apps/ and packages/ source (no injected HTML, no emoji icons ...)
 *   4. every shipped episode passes the schema + solver gate
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkShape } from './run-hook.mjs';

const problems = checkShape();

const MODES = new Set(['always', 'fileMatch', 'manual', 'auto']);
for (const name of readdirSync('.kiro/steering').filter((n) => n.endsWith('.md'))) {
  const text = readFileSync(join('.kiro/steering', name), 'utf8');
  if (!text.startsWith('---\n')) continue; // no front matter = always included
  const end = text.indexOf('\n---', 4);
  if (end < 0) {
    problems.push(`.kiro/steering/${name}: front matter is not closed`);
    continue;
  }
  const front = text.slice(4, end);
  const mode = /^inclusion:\s*(\S+)/m.exec(front)?.[1];
  if (mode === undefined || !MODES.has(mode)) problems.push(`.kiro/steering/${name}: inclusion must be one of ${[...MODES]}`);
  if (mode === 'fileMatch' && !/^fileMatchPattern:/m.test(front)) problems.push(`.kiro/steering/${name}: fileMatch needs fileMatchPattern`);
  if (mode === 'auto' && !(/^name:/m.test(front) && /^description:/m.test(front))) problems.push(`.kiro/steering/${name}: auto needs name and description`);
}

for (const problem of problems) console.error(`FAIL ${problem}`);
let status = problems.length === 0 ? 0 : 1;
for (const script of ['scripts/steering-guard.mjs', 'scripts/episode-check.mjs']) {
  const run = spawnSync('node', [script], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (run.status !== 0) status = 1;
}
process.exit(status);
