#!/usr/bin/env node
/**
 * Episode gate: JSON parse -> contract schema -> solver proof.
 *
 *   node scripts/episode-check.mjs [--allow-ambiguity] [--recovery-limit N] [--json] <file.json>...
 *   node scripts/episode-check.mjs            # no files: every episode JSON in the repo
 *
 * Exit 0 only when every file parses, satisfies the EpisodeManifestV1 contract and
 * is `verified` by @line-13/graph (exactly one solution, intended route valid,
 * every reachable state recoverable). Any other outcome exits 1 with the reasons
 * on stderr, which Kiro feeds back to the agent when run from a hook.
 *
 * Kiro hook mode: with no file arguments and a JSON payload on STDIN, the saved
 * file path is read from the payload (see scripts/hook-input.mjs).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { validateEpisodeManifest } from '@line-13/contracts';
import { computeProofReport } from '@line-13/graph';
import { episodeFilesInRepo, filesFromHookInput } from './hook-input.mjs';

const args = process.argv.slice(2);
const flags = { allowAmbiguity: false, json: false, recoveryLimit: undefined };
const files = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--allow-ambiguity') flags.allowAmbiguity = true;
  else if (arg === '--json') flags.json = true;
  else if (arg === '--recovery-limit') flags.recoveryLimit = Number(args[++i]);
  else files.push(arg);
}

const targets = files.length > 0 ? files : (filesFromHookInput() ?? episodeFilesInRepo());

function check(file) {
  const rel = relative(process.cwd(), resolve(file)) || file;
  if (!existsSync(file)) {
    return { file: rel, ok: false, problems: ['file not found'], summary: null };
  }
  let value;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { file: rel, ok: false, problems: [`MALFORMED_JSON: ${error.message}`], summary: null };
  }
  const schema = validateEpisodeManifest(value);
  if (!schema.ok) {
    return {
      file: rel,
      ok: false,
      problems: schema.issues.map((i) => `SCHEMA ${i.code} at ${i.path}: ${i.message}`),
      summary: null,
    };
  }
  const options = { allowAmbiguity: flags.allowAmbiguity };
  if (flags.recoveryLimit !== undefined) options.recoveryStateLimit = flags.recoveryLimit;
  const report = computeProofReport(schema.value, options);
  const summary = {
    status: report.status,
    solutionCount: report.solutionCount,
    statesChecked: report.recoverability.statesChecked,
    failingSeed: report.failingSeed,
  };
  if (report.status !== 'verified') {
    return {
      file: rel,
      ok: false,
      problems: report.issues.map((i) => `SOLVER ${i.code} at ${i.path}: ${i.message}`),
      summary,
    };
  }
  return { file: rel, ok: true, problems: [], summary };
}

const results = targets.map(check);
if (flags.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    if (r.ok) {
      console.log(`PASS ${r.file}  solutions=${r.summary.solutionCount} recoveryStates=${r.summary.statesChecked}`);
    } else {
      console.error(`FAIL ${r.file}${r.summary?.failingSeed ? `  failingSeed=${r.summary.failingSeed}` : ''}`);
      for (const p of r.problems) console.error(`  - ${p}`);
    }
  }
}
if (results.length === 0) {
  console.error('FAIL no episode files found to check');
  process.exit(1);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
