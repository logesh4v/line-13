import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePublicationGate } from '../src/publication/gate.ts';
import {
  APPROVED_VOICE_IDS,
  isApprovedVoiceId,
  planSpeechSynthesis,
} from '../src/publication/speech.ts';
import { buildDraftRequest } from '../src/publication/draft-model.ts';
import { nodeSha256Hasher } from '../src/integrity/hasher.ts';
import { sealManifest } from '../src/integrity/manifest-integrity.ts';
import { loadPublishableEpisode } from './support/fixtures.ts';
import type { ReviewRecord } from '../src/publication/gate.ts';
import type { EpisodeManifestV1 } from '../src/contracts.ts';

const HASHER = nodeSha256Hasher;

const APPROVED: ReviewRecord = {
  safetyReviewPassed: true,
  approvedBy: 'reviewer-01',
  approvedAt: '2026-11-03T18:00:00.000Z',
  ambiguityIsAuthored: false,
};

/** Mutate the episode, then re-seal, so only the intended rule is under test. */
function sealed(mutate: (base: EpisodeManifestV1) => EpisodeManifestV1): EpisodeManifestV1 {
  return sealManifest(mutate(loadPublishableEpisode()), HASHER);
}

function blockersOf(candidate: unknown, review: ReviewRecord = APPROVED): readonly string[] {
  const decision = evaluatePublicationGate(candidate, review, HASHER);
  return decision.ok ? [] : decision.blockers;
}

test('a verified, sealed, reviewed and approved episode passes the gate', () => {
  const decision = evaluatePublicationGate(loadPublishableEpisode(), APPROVED, HASHER);

  assert.equal(decision.ok, true);
  assert.equal(decision.ok && decision.manifest.episodeId, 'first-ring');
  assert.equal(
    decision.ok && decision.manifestHash,
    loadPublishableEpisode().integrity.manifestHash,
  );
});

test('a candidate that is not a manifest is blocked on schema alone', () => {
  for (const candidate of [null, 7, 'manifest', [], {}, { schemaVersion: '0.9.0' }]) {
    assert.deepEqual(blockersOf(candidate), ['SCHEMA_INVALID']);
  }
});

test('a draft solver proof blocks publication', () => {
  const draft = sealed((base) => ({
    ...base,
    solverProof: { ...base.solverProof, status: 'draft' },
  }));

  assert.deepEqual(blockersOf(draft), ['SOLVER_NOT_VERIFIED']);
});

test('an episode with no solution is blocked (R4.3)', () => {
  const unsolvable = sealed((base) => ({
    ...base,
    solverProof: { ...base.solverProof, solutionCount: 0 },
  }));

  assert.deepEqual(blockersOf(unsolvable), ['NO_SOLUTION']);
});

test('unintended multiple solutions are blocked unless the author declared them (R4.4)', () => {
  const ambiguous = sealed((base) => ({
    ...base,
    solverProof: { ...base.solverProof, solutionCount: 3 },
  }));

  assert.deepEqual(blockersOf(ambiguous), ['UNINTENDED_MULTIPLE_SOLUTIONS']);
  assert.deepEqual(blockersOf(ambiguous, { ...APPROVED, ambiguityIsAuthored: true }), []);
});

test('unreachable nodes block publication (R4.5)', () => {
  const stranded = sealed((base) => ({
    ...base,
    solverProof: { ...base.solverProof, unreachableNodeIds: ['destination-orchard'] },
  }));

  assert.deepEqual(blockersOf(stranded), ['UNREACHABLE_NODES']);
});

test('an unsealed manifest is blocked', () => {
  const base = loadPublishableEpisode();
  const unsealed: EpisodeManifestV1 = {
    ...base,
    integrity: { algorithm: 'SHA-256', manifestHash: '0'.repeat(64) },
  };

  assert.deepEqual(blockersOf(unsealed), ['INTEGRITY_UNSEALED']);
});

test('content edited after sealing is caught by the gate', () => {
  const tampered: EpisodeManifestV1 = {
    ...loadPublishableEpisode(),
    title: 'Edited After Review',
  };

  assert.ok(blockersOf(tampered).includes('INTEGRITY_UNSEALED'));
});

test('a caller with no subtitle blocks publication (R6.4)', () => {
  const silent = sealed((base) => ({
    ...base,
    callers: base.callers.map((caller) => ({ ...caller, subtitle: '   ' })),
  }));

  assert.deepEqual(blockersOf(silent), ['SUBTITLE_MISSING']);
});

test('an audio asset with no transcript blocks publication (R6.4)', () => {
  const untranscribed = sealed((base) => ({
    ...base,
    assets: [
      {
        kind: 'audio',
        id: 'audio-ruth',
        source: 'audio/first-ring/abc.mp3',
        sha256: 'b'.repeat(64),
        transcript: '',
        voiceEngine: 'polly-neural',
      },
    ],
  }));

  assert.deepEqual(blockersOf(untranscribed), ['AUDIO_TRANSCRIPT_MISMATCH']);
});

test('an audio asset from a third-party voice engine blocks publication (R6.6)', () => {
  const foreign = sealed((base) => ({
    ...base,
    assets: [
      {
        kind: 'audio',
        id: 'audio-ruth',
        source: 'audio/first-ring/abc.mp3',
        sha256: 'b'.repeat(64),
        transcript: 'Operator, put me through.',
        voiceEngine: 'some-other-vendor-tts',
      },
    ],
  }) as unknown as EpisodeManifestV1);

  assert.deepEqual(blockersOf(foreign), ['THIRD_PARTY_VOICE_ENGINE']);
});

test('an approved Polly audio asset passes', () => {
  for (const voiceEngine of ['polly-neural', 'polly-generative', 'original'] as const) {
    const ok = sealed((base) => ({
      ...base,
      assets: [
        {
          kind: 'audio',
          id: 'audio-ruth',
          source: 'audio/first-ring/abc.mp3',
          sha256: 'b'.repeat(64),
          transcript: 'Operator, put me through.',
          voiceEngine,
        },
      ],
    }));

    assert.deepEqual(blockersOf(ok), [], voiceEngine);
  }
});

test('a missing safety review or human approval blocks publication (R6.3)', () => {
  const episode = loadPublishableEpisode();

  assert.deepEqual(
    blockersOf(episode, { ...APPROVED, safetyReviewPassed: false }),
    ['SAFETY_REVIEW_MISSING'],
  );
  assert.deepEqual(blockersOf(episode, { ...APPROVED, approvedBy: '   ' }), [
    'HUMAN_APPROVAL_MISSING',
  ]);
  assert.deepEqual(blockersOf(episode, { ...APPROVED, approvedAt: 'soon' }), [
    'HUMAN_APPROVAL_MISSING',
  ]);
});

test('the gate reports every blocker at once rather than the first', () => {
  const broken = sealed((base) => ({
    ...base,
    solverProof: {
      ...base.solverProof,
      status: 'draft',
      solutionCount: 0,
      unreachableNodeIds: ['destination-orchard'],
    },
    callers: base.callers.map((caller) => ({ ...caller, subtitle: '' })),
  }));

  const blockers = blockersOf(broken, {
    safetyReviewPassed: false,
    approvedBy: '',
    approvedAt: 'never',
    ambiguityIsAuthored: false,
  });

  for (const expected of [
    'SOLVER_NOT_VERIFIED',
    'NO_SOLUTION',
    'UNREACHABLE_NODES',
    'SUBTITLE_MISSING',
    'SAFETY_REVIEW_MISSING',
    'HUMAN_APPROVAL_MISSING',
  ]) {
    assert.ok(blockers.includes(expected), expected);
  }
});

test('the gate is a pure decision: the same inputs give the same answer', () => {
  const episode = loadPublishableEpisode();
  const first = evaluatePublicationGate(episode, APPROVED, HASHER);
  const second = evaluatePublicationGate(episode, APPROVED, HASHER);

  assert.deepEqual(first, second);
});

test('speech is synthesized from the subtitle itself, so the two cannot drift', () => {
  const episode = loadPublishableEpisode();
  const plan = planSpeechSynthesis(
    episode,
    { engine: 'neural', voiceByCallerId: { 'caller-ruth': 'Ruth' } },
    HASHER,
  );

  assert.equal(plan.ok, true);
  if (!plan.ok) {
    return;
  }
  assert.equal(plan.requests.length, episode.callers.length);
  const request = plan.requests[0]!;
  assert.equal(request.text, episode.callers[0]!.subtitle);
  assert.equal(request.voiceId, 'Ruth');
  assert.equal(request.engine, 'neural');
  assert.equal(request.outputFormat, 'mp3');
  assert.equal(request.textType, 'text');
  assert.match(request.outputKey, /^audio\/first-ring\/[0-9a-f]{64}\.mp3$/);
});

test('the output key is content-addressed, so republication is a no-op', () => {
  const episode = loadPublishableEpisode();
  const options = { engine: 'neural', voiceByCallerId: { 'caller-ruth': 'Ruth' } } as const;

  const first = planSpeechSynthesis(episode, options, HASHER);
  const second = planSpeechSynthesis(episode, options, HASHER);
  assert.equal(first.ok && second.ok, true);
  assert.equal(
    first.ok && second.ok && first.requests[0]!.outputKey,
    second.ok && second.requests[0]!.outputKey,
  );

  // A changed line, a changed voice, or a changed engine all move the key, so a
  // published manifest can never have its asset overwritten in place.
  const changedLine = planSpeechSynthesis(
    { ...episode, callers: episode.callers.map((c) => ({ ...c, subtitle: 'Different line.' })) },
    options,
    HASHER,
  );
  const changedVoice = planSpeechSynthesis(
    episode,
    { engine: 'neural', voiceByCallerId: { 'caller-ruth': 'Danielle' } },
    HASHER,
  );
  const changedEngine = planSpeechSynthesis(
    episode,
    { engine: 'generative', voiceByCallerId: { 'caller-ruth': 'Ruth' } },
    HASHER,
  );

  const baseline = first.ok ? first.requests[0]!.outputKey : '';
  for (const other of [changedLine, changedVoice, changedEngine]) {
    assert.ok(other.ok);
    assert.notEqual(other.ok && other.requests[0]!.outputKey, baseline);
  }
});

test('an unapproved or missing voice fails the plan rather than guessing', () => {
  const episode = loadPublishableEpisode();

  for (const voiceByCallerId of [
    {},
    { 'caller-ruth': 'Joanna' },
    { 'caller-ruth': 'some-third-party-voice' },
    { 'caller-other': 'Ruth' },
  ]) {
    const plan = planSpeechSynthesis(episode, { engine: 'neural', voiceByCallerId }, HASHER);
    assert.equal(plan.ok, false, JSON.stringify(voiceByCallerId));
    assert.equal(plan.ok === false && plan.failures[0]!.reason, 'VOICE_NOT_APPROVED');
  }
});

test('an empty subtitle fails the plan', () => {
  const episode = loadPublishableEpisode();
  const silent = {
    ...episode,
    callers: episode.callers.map((caller) => ({ ...caller, subtitle: '  ' })),
  };

  const plan = planSpeechSynthesis(
    silent,
    { engine: 'neural', voiceByCallerId: { 'caller-ruth': 'Ruth' } },
    HASHER,
  );

  assert.equal(plan.ok, false);
  assert.equal(plan.ok === false && plan.failures[0]!.reason, 'SUBTITLE_EMPTY');
});

test('only the approved Amazon Polly voices are accepted', () => {
  for (const voice of APPROVED_VOICE_IDS) {
    assert.equal(isApprovedVoiceId(voice), true, voice);
  }
  for (const voice of ['Joanna', 'ruth', '', 'Ruth ', 'Brian']) {
    assert.equal(isApprovedVoiceId(voice), false, voice);
  }
});

test('a draft request is reproducible and bounded', () => {
  const request = buildDraftRequest({
    modelId: 'amazon.nova-pro-v1:0',
    taskKind: 'caller-history',
    instruction: 'Draft a 1931 switchboard operator biography.',
    seed: 13,
  });

  assert.equal(request.temperature, 0);
  assert.equal(request.seed, 13);
  assert.equal(request.modelId, 'amazon.nova-pro-v1:0');
  assert.ok(request.maxOutputTokens > 0 && request.maxOutputTokens <= 1024);
});

test('a draft request clamps the output budget in both directions', () => {
  const base = {
    modelId: 'amazon.nova-lite-v1:0',
    taskKind: 'clue-variation',
    instruction: 'Rephrase the clue.',
    seed: 1,
  } as const;

  assert.equal(buildDraftRequest({ ...base, maxOutputTokens: 100_000 }).maxOutputTokens, 1024);
  assert.equal(buildDraftRequest({ ...base, maxOutputTokens: 0 }).maxOutputTokens, 1);
  assert.equal(buildDraftRequest({ ...base, maxOutputTokens: -5 }).maxOutputTokens, 1);
  assert.equal(buildDraftRequest({ ...base, maxOutputTokens: 256 }).maxOutputTokens, 256);
});
