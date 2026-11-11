/**
 * Deliberately bad (and one good) episode inputs, written to a directory so the
 * hooks, CI gate and tests all run against the same files.
 *
 * Each case lists the exit code `scripts/episode-check.mjs` must return and the
 * issue code it must name. Run directly to print the files into a directory:
 *   node scripts/episode-cases.mjs <dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fourCallerEpisode,
  minimalEpisode,
  multiSolutionEpisode,
  noSolutionEpisode,
  zeroSolutionEpisode,
} from '../packages/graph/test/fixtures.ts';

// Two callers both pinned to the bell tower, with no distinct-destination rule. The switchboard
// lets only one caller hold a destination, so this episode cannot be finished.
const sharedDestination = {
  ...noSolutionEpisode,
  episodeId: 'shared-destination',
  seed: 'line-13-shared-destination-v1',
  constraints: noSolutionEpisode.constraints.filter((c) => c.kind === 'required-route'),
};

/** @type {{name: string, text: string, args?: string[], exit: 0 | 1, expect: string}[]} */
export const CASES = [
  { name: 'good-minimal.json', text: JSON.stringify(minimalEpisode, null, 2), exit: 0, expect: 'PASS' },
  { name: 'zero-solution.json', text: JSON.stringify(zeroSolutionEpisode, null, 2), exit: 1, expect: 'EMPTY_DOMAIN' },
  { name: 'no-solution.json', text: JSON.stringify(noSolutionEpisode, null, 2), exit: 1, expect: 'NO_SOLUTION' },
  { name: 'two-solution.json', text: JSON.stringify(multiSolutionEpisode, null, 2), exit: 1, expect: 'MULTIPLE_SOLUTIONS' },
  {
    name: 'two-solution-declared-authored.json',
    text: JSON.stringify(multiSolutionEpisode, null, 2),
    args: ['--allow-ambiguity'],
    exit: 0,
    expect: 'PASS',
  },
  {
    // A recovery sweep that cannot finish proves nothing about the unvisited states.
    name: 'trap-unproven.json',
    text: JSON.stringify(fourCallerEpisode, null, 2),
    args: ['--recovery-limit', '200'],
    exit: 1,
    expect: 'RECOVERY_PROOF_INCOMPLETE',
  },
  { name: 'four-callers-full-proof.json', text: JSON.stringify(fourCallerEpisode, null, 2), exit: 0, expect: 'PASS' },
  {
    name: 'shared-destination-unwinnable.json',
    text: JSON.stringify(sharedDestination, null, 2),
    exit: 1,
    expect: 'NO_SOLUTION',
  },
  { name: 'malformed.json', text: '{ "schemaVersion": "1.0.0", "episodeId": ', exit: 1, expect: 'MALFORMED_JSON' },
  {
    name: 'schema-wrong-version.json',
    text: JSON.stringify({ ...minimalEpisode, schemaVersion: '9.9.9' }, null, 2),
    exit: 1,
    expect: 'SCHEMA INVALID_VALUE',
  },
  { name: 'not-an-object.json', text: '[]', exit: 1, expect: 'SCHEMA INVALID_TYPE' },
];

export function writeCases(dir) {
  mkdirSync(dir, { recursive: true });
  for (const c of CASES) writeFileSync(join(dir, c.name), c.text);
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2]) {
  writeCases(process.argv[2]);
  console.log(`wrote ${CASES.length} cases to ${process.argv[2]}`);
}
