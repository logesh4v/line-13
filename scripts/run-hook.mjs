#!/usr/bin/env node
/**
 * Local harness that fires .kiro/hooks/*.json the way Kiro documents it, so hooks
 * can be exercised in CI and from a terminal without the IDE:
 *   - hook file schema: version "v1", hooks[] with name / trigger / matcher / action
 *   - matcher: unanchored regex against the file path (file events)
 *   - command action: run in the project root, event JSON on STDIN, exit 0 = ok
 *
 *   node scripts/run-hook.mjs <Trigger> <file>     fire matching hooks, print result, exit 1 if any failed
 *   node scripts/run-hook.mjs --check              validate every hook file's shape
 *
 * Shortcut: this reproduces the documented contract, not Kiro's runner. The file-event
 * STDIN field names are undocumented, so we send file_path (the scripts accept several).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HOOK_DIR = '.kiro/hooks';
export const TRIGGERS = new Set([
  'PostFileCreate', 'PostFileSave', 'PostFileDelete', 'PreToolUse', 'PostToolUse',
  'UserPromptSubmit', 'SessionStart', 'Stop', 'PreTaskExec', 'PostTaskExec',
]);

export function loadHooks(dir = HOOK_DIR) {
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    out.push({ file: join(dir, name), config: JSON.parse(readFileSync(join(dir, name), 'utf8')) });
  }
  return out;
}

export function checkShape(dir = HOOK_DIR) {
  const problems = [];
  for (const { file, config } of loadHooks(dir)) {
    if (config.version !== 'v1') problems.push(`${file}: version must be "v1"`);
    if (!Array.isArray(config.hooks) || config.hooks.length === 0) problems.push(`${file}: hooks must be a non-empty array`);
    for (const hook of config.hooks ?? []) {
      const tag = `${file} [${hook.name}]`;
      if (!hook.name) problems.push(`${tag}: name required`);
      if (!TRIGGERS.has(hook.trigger)) problems.push(`${tag}: unknown trigger ${hook.trigger}`);
      if (hook.matcher !== undefined) {
        try { new RegExp(hook.matcher); } catch { problems.push(`${tag}: matcher is not a valid regex`); }
      }
      if (hook.action?.type === 'command') {
        if (!hook.action.command) problems.push(`${tag}: command required`);
        for (const script of String(hook.action.command).match(/scripts\/[\w.-]+\.mjs/g) ?? []) {
          if (!existsSync(script)) problems.push(`${tag}: ${script} does not exist`);
        }
      } else if (hook.action?.type !== 'agent') {
        problems.push(`${tag}: action.type must be command or agent`);
      }
    }
  }
  return problems;
}

export function fire(trigger, file, dir = HOOK_DIR) {
  const results = [];
  for (const { file: hookFile, config } of loadHooks(dir)) {
    for (const hook of config.hooks) {
      if (hook.enabled === false || hook.trigger !== trigger || hook.action?.type !== 'command') continue;
      if (hook.matcher !== undefined && !new RegExp(hook.matcher).test(file)) continue;
      const payload = JSON.stringify({ hook_event_name: trigger, cwd: process.cwd(), file_path: file });
      const run = spawnSync('sh', ['-c', hook.action.command], {
        input: payload,
        encoding: 'utf8',
        timeout: (hook.timeout ?? 60) * 1000 || undefined,
      });
      results.push({ hook: hook.name, hookFile, status: run.status, stdout: run.stdout, stderr: run.stderr });
    }
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [first, second] = process.argv.slice(2);
  if (first === '--check') {
    const problems = checkShape();
    for (const p of problems) console.error(`FAIL ${p}`);
    console.log(problems.length === 0 ? `hooks ok: ${loadHooks().length} file(s)` : '');
    process.exit(problems.length === 0 ? 0 : 1);
  }
  const results = fire(first, second);
  if (results.length === 0) {
    console.log(`no hook matched ${first} ${second}`);
  }
  for (const r of results) {
    console.log(`HOOK "${r.hook}" (${r.hookFile}) exit=${r.status}`);
    if (r.stdout.trim()) console.log(r.stdout.trimEnd().replace(/^/gm, '  | '));
    if (r.stderr.trim()) console.log(r.stderr.trimEnd().replace(/^/gm, '  ! '));
  }
  process.exit(results.some((r) => r.status !== 0) ? 1 : 0);
}
