import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTEGRITY_ALGORITHM,
  computeManifestHash,
  integrityPayload,
  sealManifest,
  verifyManifestIntegrity,
} from '../src/integrity/manifest-integrity.ts';
import { isSha256Hex, nodeSha256Hasher, timingSafeEqualHex } from '../src/integrity/hasher.ts';
import { loadMinimalEpisode, loadPublishableEpisode } from './support/fixtures.ts';
import type { EpisodeManifestV1 } from '../src/contracts.ts';

const HASHER = nodeSha256Hasher;
const ZERO_HASH = '0'.repeat(64);

test('sealing a manifest produces a manifest that verifies', () => {
  const sealed = sealManifest(loadMinimalEpisode(), HASHER);

  assert.equal(sealed.integrity.algorithm, INTEGRITY_ALGORITHM);
  assert.ok(isSha256Hex(sealed.integrity.manifestHash));

  const result = verifyManifestIntegrity(sealed, HASHER);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.manifestHash, sealed.integrity.manifestHash);
});

test('the hash covers every field except the integrity block itself', () => {
  const sealed = loadPublishableEpisode();
  const payload = integrityPayload(sealed);

  assert.equal('integrity' in payload, false);
  assert.equal(payload['episodeId'], sealed.episodeId);
  assert.equal(computeManifestHash(sealed, HASHER), sealed.integrity.manifestHash);
});

test('re-sealing an already sealed manifest is idempotent', () => {
  const once = loadPublishableEpisode();
  const twice = sealManifest(once, HASHER);

  assert.equal(twice.integrity.manifestHash, once.integrity.manifestHash);
});

test('the hash ignores key insertion order but not content', () => {
  const sealed = loadPublishableEpisode();
  const { integrity, title, ...rest } = sealed;
  const reordered = JSON.parse(
    JSON.stringify({
      integrity,
      title,
      ...rest,
    }),
  ) as EpisodeManifestV1;

  assert.equal(computeManifestHash(reordered, HASHER), sealed.integrity.manifestHash);
});

test('changing any covered field changes the hash', () => {
  const sealed = loadPublishableEpisode();
  const baseline = sealed.integrity.manifestHash;

  const mutations: readonly EpisodeManifestV1[] = [
    { ...sealed, title: `${sealed.title} ` },
    { ...sealed, seed: 'line-13-other-seed' },
    { ...sealed, publishedAt: '2026-11-04T18:09:00.000Z' },
    { ...sealed, callers: sealed.callers.slice(0, 0) },
    {
      ...sealed,
      destinations: [...sealed.destinations].reverse(),
    },
    {
      ...sealed,
      solverProof: { ...sealed.solverProof, solutionCount: 2 },
    },
  ];

  for (const mutated of mutations) {
    assert.notEqual(computeManifestHash(mutated, HASHER), baseline);
  }
});

test('a tampered body is rejected as an embedded hash mismatch', () => {
  const sealed = loadPublishableEpisode();
  const tampered: EpisodeManifestV1 = { ...sealed, title: 'Another Exchange' };

  const result = verifyManifestIntegrity(tampered, HASHER);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'EMBEDDED_HASH_MISMATCH');
});

test('a manifest whose hash disagrees with the catalogue is rejected', () => {
  const sealed = loadPublishableEpisode();

  const result = verifyManifestIntegrity(sealed, HASHER, { catalogueHash: ZERO_HASH });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'CATALOGUE_HASH_MISMATCH');
});

test('a matching catalogue hash passes the three-way check', () => {
  const sealed = loadPublishableEpisode();

  const result = verifyManifestIntegrity(sealed, HASHER, {
    catalogueHash: sealed.integrity.manifestHash,
  });
  assert.equal(result.ok, true);
});

test('an unsupported algorithm is rejected before any hashing', () => {
  const sealed = loadPublishableEpisode();
  const wrongAlgorithm = {
    ...sealed,
    integrity: { algorithm: 'MD5', manifestHash: sealed.integrity.manifestHash },
  } as unknown as EpisodeManifestV1;

  const result = verifyManifestIntegrity(wrongAlgorithm, HASHER);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'ALGORITHM_UNSUPPORTED');
});

test('a malformed hash is rejected rather than compared', () => {
  const sealed = loadPublishableEpisode();

  for (const malformed of ['', 'pending-publication', 'ABC', `${'a'.repeat(63)}`, `${'a'.repeat(65)}`, 'A'.repeat(64)]) {
    const result = verifyManifestIntegrity(
      { ...sealed, integrity: { algorithm: INTEGRITY_ALGORITHM, manifestHash: malformed } },
      HASHER,
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, 'HASH_MALFORMED');
  }
});

test('a malformed catalogue hash is rejected rather than compared', () => {
  const sealed = loadPublishableEpisode();

  const result = verifyManifestIntegrity(sealed, HASHER, { catalogueHash: 'pending' });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'HASH_MALFORMED');
});

test('the shipped minimal fixture is not publishable as it stands', () => {
  // The fixture carries placeholder integrity and a draft solver proof on
  // purpose: it is the bundled episode, not a published one. If this ever
  // starts verifying, the fixture has been sealed by something it should not
  // have been.
  const fixture = loadMinimalEpisode();

  const result = verifyManifestIntegrity(fixture, HASHER);
  assert.equal(result.ok, false);
});

test('hash comparison is length-safe and value-exact', () => {
  assert.equal(timingSafeEqualHex(ZERO_HASH, ZERO_HASH), true);
  assert.equal(timingSafeEqualHex(ZERO_HASH, `${ZERO_HASH}0`), false);
  assert.equal(timingSafeEqualHex(ZERO_HASH, `${'0'.repeat(63)}1`), false);
  assert.equal(timingSafeEqualHex('', ''), true);
});

test('the hasher is a plain SHA-256 over UTF-8 bytes', () => {
  // Known vector: SHA-256 of the empty string.
  assert.equal(
    HASHER.hashHex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    HASHER.hashHex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
