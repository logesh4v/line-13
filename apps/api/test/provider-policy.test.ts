import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APPROVED_MODEL_ID_PREFIX,
  UnapprovedModelError,
  assertApprovedModelId,
  isApprovedModelId,
} from '../src/publication/draft-model.ts';
import { buildDraftRequest } from '../src/publication/draft-model.ts';

/**
 * R6.1 and R6.6: only Amazon first-party foundation models reached through
 * Amazon Bedrock may produce project content, and no third-party model API may
 * be present in source, configuration, deployment or documentation.
 *
 * The first half of that is an allowlist in code. The second half is a claim
 * about the whole tree, so it is checked by scanning the tree: the owned source
 * and the owned infrastructure are read and matched against a list of vendor
 * names and endpoints. This test directory is excluded, because it is the one
 * place those names legitimately appear -- here, as the thing being prohibited.
 */

const API_ROOT = fileURLToPath(new URL('..', import.meta.url));
const INFRA_ROOT = fileURLToPath(new URL('../../../infra', import.meta.url));

const FORBIDDEN_VENDOR_TOKENS: readonly string[] = [
  'openai',
  'api.openai.com',
  'anthropic',
  'claude',
  'gemini',
  'vertexai',
  'mistral',
  'cohere',
  'ai21',
  'llama',
  'deepseek',
  'huggingface',
  'elevenlabs',
  'replicate.com',
  'perplexity',
  'stability.ai',
  'gpt-3',
  'gpt-4',
  'gpt-5',
];

const FORBIDDEN_SECRET_TOKENS: readonly string[] = [
  'akia',
  'asia',
  'aws_secret_access_key',
  'aws_session_token',
  'begin rsa private key',
  'begin private key',
];

const SCANNED_EXTENSIONS: readonly string[] = ['.ts', '.json', '.md', '.yaml', '.yml'];

function filesUnder(root: string, skipDirectories: readonly string[] = []): readonly string[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (skipDirectories.includes(entry) || entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path, skipDirectories));
    } else if (SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      found.push(path);
    }
  }
  return found;
}

test('only Amazon Nova model ids are approved', () => {
  for (const modelId of [
    'amazon.nova-pro-v1:0',
    'amazon.nova-lite-v1:0',
    'amazon.nova-micro-v1:0',
    'amazon.nova-premier-v1:0',
  ]) {
    assert.equal(isApprovedModelId(modelId), true, modelId);
  }
});

test('every non-Amazon model id is rejected by default, not by blocklist', () => {
  for (const modelId of [
    '',
    'amazon',
    'amazon.',
    APPROVED_MODEL_ID_PREFIX,
    'amazon.titan-text-express-v1',
    'AMAZON.NOVA-PRO-V1:0',
    ' amazon.nova-pro-v1:0',
    'arn:aws:bedrock:::foundation-model/amazon.nova-pro-v1:0',
    'a-vendor-nobody-has-heard-of-yet.model-v1',
  ]) {
    assert.equal(isApprovedModelId(modelId), false, JSON.stringify(modelId));
  }
});

test('an unapproved model id throws rather than falling back', () => {
  assert.throws(
    () => assertApprovedModelId('some-other-vendor.model-v1'),
    (thrown: unknown) => thrown instanceof UnapprovedModelError,
  );
  assert.throws(
    () => buildDraftRequest({
      modelId: 'some-other-vendor.model-v1',
      taskKind: 'dialogue-line',
      instruction: 'Draft a line.',
      seed: 1,
    }),
    (thrown: unknown) => thrown instanceof UnapprovedModelError,
  );
});

test('the error message names the policy rather than the rejected vendor', () => {
  const error = new UnapprovedModelError();

  assert.equal(error.name, 'UnapprovedModelError');
  assert.match(error.message, /Amazon first-party Nova models/);
});

test('no third-party model vendor appears anywhere in the owned source', () => {
  const files = filesUnder(API_ROOT, ['test']);
  assert.ok(files.length > 0, 'the scan found no source files, so it proves nothing');

  const offenders: string[] = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8').toLowerCase();
    for (const token of FORBIDDEN_VENDOR_TOKENS) {
      if (text.includes(token)) {
        offenders.push(`${path}: ${token}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('no third-party model vendor appears anywhere in the owned infrastructure', () => {
  const files = filesUnder(INFRA_ROOT);
  assert.ok(files.length > 0, 'the infra scan found no files, so it proves nothing');

  const offenders: string[] = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8').toLowerCase();
    for (const token of FORBIDDEN_VENDOR_TOKENS) {
      if (text.includes(token)) {
        offenders.push(`${path}: ${token}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('no credential material appears in source or infrastructure', () => {
  const files = [...filesUnder(API_ROOT, ['test']), ...filesUnder(INFRA_ROOT)];

  const offenders: string[] = [];
  for (const path of files) {
    const text = readFileSync(path, 'utf8').toLowerCase();
    for (const token of FORBIDDEN_SECRET_TOKENS) {
      if (text.includes(token)) {
        offenders.push(`${path}: ${token}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('nothing in the request path can reach a model at all', () => {
  // R6.5: no model invocation is required during the judge's playthrough. The
  // structural guarantee is that the three handlers and their ports name no
  // model client, so there is nothing to call even if a bug tried to.
  const requestPathFiles = [
    ...filesUnder(join(API_ROOT, 'src', 'handlers')),
    ...filesUnder(join(API_ROOT, 'src', 'ports')),
    ...filesUnder(join(API_ROOT, 'src', 'runtime')),
    ...filesUnder(join(API_ROOT, 'src', 'http')),
  ];
  assert.ok(requestPathFiles.length > 0);

  for (const path of requestPathFiles) {
    const text = readFileSync(path, 'utf8').toLowerCase();
    for (const token of ['bedrock', 'invokemodel', 'polly', 'synthesizespeech', 'draftmodel']) {
      assert.equal(text.includes(token), false, `${path}: ${token}`);
    }
  }
});
