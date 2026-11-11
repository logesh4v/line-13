#!/usr/bin/env node
/**
 * Steering guard: turns written steering rules into a failing check.
 *
 *   architecture.md  "Render episode content as text, never injected HTML."
 *   architecture.md  "Keep AWS credentials outside source ... browser bundles"
 *   visual-language  "Native browser tooltips for important explanations" is forbidden
 *   visual-language  "Emoji used as production icons" is forbidden
 *   aws-only.md      no non-AWS model/voice SDKs
 *
 * Usage: node scripts/steering-guard.mjs [file...]   (no files: all of apps/ and packages/ source)
 * Kiro hook mode: file path comes from the STDIN payload.
 * Exit 1 lists every violation as `file:line rule: excerpt`.
 */
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { filesFromHookInput, walk } from './hook-input.mjs';

const SOURCE = /^(apps|packages)\/[^/]+\/src\/.*\.(ts|tsx|css)$/;
const TEST_FILE = /\.test\.tsx?$/;

const RULES = [
  { id: 'no-injected-html', re: /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/, ext: /tsx?$/ },
  { id: 'no-native-tooltip', re: /<[A-Za-z][^>]*\stitle=\{?["'`]/, ext: /tsx$/ },
  { id: 'no-emoji-icon', re: /\p{Extended_Pictographic}/u, ext: /tsx?$/ },
  { id: 'no-credentials-in-source', re: /AKIA[0-9A-Z]{16}|aws_secret_access_key|-----BEGIN [A-Z ]*PRIVATE KEY-----/i, ext: /./ },
  { id: 'aws-only-models', re: /from ['"](openai|@anthropic-ai\/sdk|@google\/generative-ai|elevenlabs)['"]/, ext: /tsx?$/ },
];

const given = process.argv.slice(2);
const files = given.length > 0 ? given : (filesFromHookInput() ?? walk('.', (p) => SOURCE.test(p)));

const violations = [];
for (const file of files) {
  const rel = relative(process.cwd(), resolve(file));
  if (!SOURCE.test(rel) || TEST_FILE.test(rel)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, index) => {
    for (const rule of RULES) {
      if (rule.ext.test(rel) && rule.re.test(line)) {
        violations.push(`${rel}:${index + 1} ${rule.id}: ${line.trim().slice(0, 100)}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Steering violations (see .kiro/steering/):');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`steering-guard: ${files.length} file(s) checked, no violations`);
