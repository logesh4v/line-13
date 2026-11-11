import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/check-kiro.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'line13-kiro-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const REQUIRED_TREE = ['.kiro', 'packages/contracts/fixtures', 'packages/contracts/src', 'apps/web/src/episode', 'docs/submission'];

/** A throwaway git repo holding just the files the gate requires, all committed. */
function fixtureRepo(name) {
  const dir = join(tmp, name);
  mkdirSync(dir);
  for (const sub of REQUIRED_TREE) {
    mkdirSync(join(dir, dirname(sub)), { recursive: true });
    cpSync(join(ROOT, sub), join(dir, sub), { recursive: true });
  }
  cpSync(join(ROOT, 'LICENSE'), join(dir, 'LICENSE'));
  for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']]) {
    assert.equal(spawnSync('git', args, { cwd: dir }).status, 0);
  }
  return dir;
}
const run = (dir) => spawnSync('node', [SCRIPT, '--root', dir], { encoding: 'utf8' });

describe('check-kiro gate', () => {
  it('passes on this repository checkout layout', () => {
    const r = run(fixtureRepo('good'));
    assert.equal(r.status, 0, r.stderr);
  });

  it('fails when .kiro is listed in .gitignore', () => {
    const dir = fixtureRepo('ignored');
    appendFileSync(join(dir, '.gitignore'), '\n.kiro/\n');
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /\.gitignore:\d+ lists \.kiro/);
  });

  it('fails when a new .kiro file is untracked', () => {
    const dir = fixtureRepo('untracked');
    writeFileSync(join(dir, '.kiro/hooks/new-hook.json'), '{}');
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /untracked file under \.kiro/);
  });

  it('fails when .kiro is not committed at all', () => {
    const dir = fixtureRepo('uncommitted');
    assert.equal(spawnSync('git', ['rm', '-rq', '--cached', '.kiro'], { cwd: dir }).status, 0);
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no tracked files|untracked/);
  });

  it('fails when a required fixture is missing', () => {
    const dir = fixtureRepo('missing-fixture');
    rmSync(join(dir, 'packages/contracts/fixtures/minimal-episode.json'));
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /missing required path: packages\/contracts\/fixtures\/minimal-episode\.json/);
  });

  it('fails when the .kiro directory is gone', () => {
    const dir = fixtureRepo('no-kiro');
    rmSync(join(dir, '.kiro'), { recursive: true });
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /\.kiro directory is missing/);
  });

  it('this repository .gitignore does not list .kiro', () => {
    const active = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    assert.ok(!active.some((l) => l.includes('.kiro')));
  });
});
