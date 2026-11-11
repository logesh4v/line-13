#!/usr/bin/env node
/**
 * Run the tests of the workspace package that owns a saved source/test file.
 *
 * Kiro hook mode: path comes from the STDIN payload. CLI: node scripts/test-affected.mjs <file>
 * Exit code is the test runner's, so a red test fails the hook and its stderr/stdout reaches the agent.
 */
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { filesFromHookInput } from './hook-input.mjs';

const given = process.argv.slice(2);
const files = given.length > 0 ? given : (filesFromHookInput() ?? []);
const packages = new Set();
for (const file of files) {
  const match = /^(apps|packages)\/([^/]+)\//.exec(relative(process.cwd(), resolve(file)));
  if (match) packages.add(`${match[1]}/${match[2]}`);
}
if (packages.size === 0) {
  console.error('test-affected: no workspace package found for', files.join(', ') || '(no path in payload)');
  process.exit(1);
}
let status = 0;
for (const dir of packages) {
  console.log(`test-affected: npm test -w ${dir}`);
  const run = spawnSync('npm', ['test', '-w', dir], { stdio: 'inherit' });
  if (run.status !== 0) status = run.status ?? 1;
}
process.exit(status);
