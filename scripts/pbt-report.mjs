#!/usr/bin/env node
/**
 * Property-test run ledger.
 *
 *   node scripts/pbt-report.mjs          print the seed summary of the last run (.pbt/last-run.json)
 *
 * packages/graph/test/pbt.test.ts calls `writeRun()` after every fast-check run,
 * pass or fail, so the seed, case count, outcome breakdown and (on failure) the
 * minimized counterexample and replay command are always on disk.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', '.pbt');
const FILE = join(DIR, 'last-run.json');

export function writeRun(record) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(record, null, 2)}\n`);
}

export function formatRun(run) {
  const lines = [
    `property suite   : ${run.suite}`,
    `result           : ${run.failed ? 'FAILED' : 'passed'}`,
    `cases generated  : ${run.numRuns} (requested ${run.requestedRuns})`,
    `seed             : ${run.seed}`,
    `duration         : ${run.durationMs} ms`,
    'outcomes         :',
    ...Object.entries(run.stats).map(([k, v]) => `  ${k.padEnd(28)} ${v}`),
    `replay           : ${run.replay}`,
  ];
  if (run.failed) {
    lines.push(`shrinks          : ${run.numShrinks}`, 'minimized counterexample:', run.counterexample);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(FILE)) {
    console.error('no PBT run recorded; run `npm run pbt` first');
    process.exit(1);
  }
  const run = JSON.parse(readFileSync(FILE, 'utf8'));
  console.log(formatRun(run));
  process.exit(run.failed ? 1 : 0);
}
