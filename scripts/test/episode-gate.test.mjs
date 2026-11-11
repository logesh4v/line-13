/**
 * The episode gate (scripts/episode-check.mjs) and the Kiro hooks must fail on a
 * bad episode and pass on a good one. Both directions, real child processes.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, after } from 'node:test';

import { CASES, writeCases } from '../episode-cases.mjs';
import { checkShape, fire } from '../run-hook.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
process.chdir(ROOT); // hooks run in the project root, as in Kiro
const work = mkdtempSync(join(tmpdir(), 'line13-gate-'));
after(() => rmSync(work, { recursive: true, force: true }));
writeCases(work);

function gate(file, args = []) {
  return spawnSync('node', ['scripts/episode-check.mjs', ...args, file], { cwd: ROOT, encoding: 'utf8' });
}

describe('episode gate CLI', () => {
  for (const c of CASES) {
    it(`${c.name} -> exit ${c.exit} (${c.expect})`, () => {
      const run = gate(join(work, c.name), c.args);
      assert.equal(run.status, c.exit, run.stdout + run.stderr);
      assert.ok((run.stdout + run.stderr).includes(c.expect), run.stdout + run.stderr);
    });
  }

  it('fails when a file does not exist', () => {
    assert.equal(gate(join(work, 'missing.json')).status, 1);
  });

  it('checks the whole repo when no file is given and passes on the bundled episode', () => {
    const run = spawnSync('node', ['scripts/episode-check.mjs'], { cwd: ROOT, encoding: 'utf8', input: '' });
    assert.equal(run.status, 0, run.stderr);
  });
});

describe('Kiro hook definitions', () => {
  it('every hook file has a valid shape and existing scripts', () => {
    assert.deepEqual(checkShape(ROOT + '/.kiro/hooks'), []);
  });

  it('validate-episode hook blocks a bad episode and passes a good one', () => {
    const dir = join(ROOT, 'packages/contracts/fixtures');
    const bad = join(dir, '__hook-test-bad.json');
    writeFileSync(bad, readFileSync(join(work, 'two-solution.json')));
    try {
      const results = fire('PostFileSave', 'packages/contracts/fixtures/__hook-test-bad.json', ROOT + '/.kiro/hooks');
      assert.equal(results.length, 1);
      assert.equal(results[0].status, 1);
      assert.match(results[0].stderr, /MULTIPLE_SOLUTIONS/);
    } finally {
      rmSync(bad, { force: true });
    }
    const good = fire('PostFileSave', 'packages/contracts/fixtures/minimal-episode.json', ROOT + '/.kiro/hooks');
    assert.equal(good.length, 1);
    assert.equal(good[0].status, 0, good[0].stderr);
  });

  it('hooks do not fire for unrelated paths', () => {
    assert.deepEqual(fire('PostFileSave', 'README.md', ROOT + '/.kiro/hooks'), []);
  });
});

describe('steering guard', () => {
  it('rejects injected HTML, a native tooltip and an emoji icon; accepts clean source', () => {
    const dir = join(ROOT, 'apps/web/src/__guard_tmp__');
    mkdirSync(dir, { recursive: true });
    const bad = join(dir, 'Bad.tsx');
    const good = join(dir, 'Good.tsx');
    writeFileSync(bad, 'export const A = () => <div title="why" dangerouslySetInnerHTML={{__html: x}}>\u{1F47B}</div>;\n');
    writeFileSync(good, 'export const B = () => <div aria-label="ok">text</div>;\n');
    try {
      const badRun = spawnSync('node', ['scripts/steering-guard.mjs', bad], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(badRun.status, 1);
      for (const rule of ['no-injected-html', 'no-native-tooltip', 'no-emoji-icon']) {
        assert.ok(badRun.stderr.includes(rule), badRun.stderr);
      }
      const goodRun = spawnSync('node', ['scripts/steering-guard.mjs', good], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(goodRun.status, 0, goodRun.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
