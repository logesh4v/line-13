#!/usr/bin/env node
// Build the web client, upload it with cache headers, invalidate CloudFront.
// Uses the AWS CLI and its default profile/region. Idempotent: it also creates
// or updates the hosting stack first.
//
//   npm run deploy            # stack name line-13-prod-site
//   STACK_NAME=x npm run deploy
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/web/dist');
const stack = process.env['STACK_NAME'] ?? 'line-13-prod-site';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' });
const aws = (args, opts) => run('aws', args, opts);

run('npm', ['run', 'build', '-w', '@line-13/web']);

aws([
  'cloudformation', 'deploy',
  '--template-file', 'infra/cloudformation/web-hosting.yaml',
  '--stack-name', stack,
  '--no-fail-on-empty-changeset',
]);

const out = JSON.parse(
  aws(['cloudformation', 'describe-stacks', '--stack-name', stack, '--query', 'Stacks[0].Outputs', '--output', 'json'], { capture: true }),
);
const output = (key) => out.find((o) => o.OutputKey === key).OutputValue;
const bucket = output('WebBucketName');
const distribution = output('DistributionId');

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=60';

// 1. Content-hashed files: assets/*.js|css and audio/voices/<sha256>.mp3. Forever.
aws([
  's3', 'sync', dist, `s3://${bucket}/`, '--only-show-errors',
  '--exclude', '*', '--include', 'assets/*', '--include', 'audio/voices/*.mp3',
  '--exclude', '*.map',
  '--cache-control', IMMUTABLE,
]);
// 2. Everything else (index.html, voices manifest.json): short cache, uploaded
//    last so a visitor never gets an index.html that points at a missing asset.
aws([
  's3', 'sync', dist, `s3://${bucket}/`, '--only-show-errors', '--delete',
  '--exclude', 'assets/*', '--exclude', 'audio/voices/*.mp3', '--exclude', '*.map',
  '--cache-control', SHORT,
]);
// --delete above only prunes the short-cache set; stale hashed files are harmless
// (immutable, unreferenced) and cost cents.

aws(['cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', '/*', '--query', 'Invalidation.Id', '--output', 'text']);
console.log(`\nLive: ${output('SiteUrl')}`);
