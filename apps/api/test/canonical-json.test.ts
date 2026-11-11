import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CanonicalJsonError, canonicalJson } from '../src/integrity/canonical-json.ts';

/**
 * Canonical serialization is the foundation of every integrity claim in the
 * package: if the publisher and the API can disagree about the bytes, the hash
 * means nothing. These tests pin the three properties the hash depends on --
 * key order is irrelevant, array order is not, and anything that cannot
 * round-trip is rejected rather than coerced.
 */

test('object key order does not change the serialization', () => {
  const left = { alpha: 1, beta: 2, gamma: 3 };
  const right = { gamma: 3, alpha: 1, beta: 2 };

  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(canonicalJson(left), '{"alpha":1,"beta":2,"gamma":3}');
});

test('nested object keys are sorted at every depth', () => {
  const value = { b: { d: 1, c: { f: 2, e: 3 } }, a: 0 };

  assert.equal(canonicalJson(value), '{"a":0,"b":{"c":{"e":3,"f":2},"d":1}}');
});

test('array order is preserved because routing order is meaningful', () => {
  assert.equal(canonicalJson(['b', 'a', 'c']), '["b","a","c"]');
  assert.notEqual(canonicalJson(['a', 'b']), canonicalJson(['b', 'a']));
});

test('keys are sorted by UTF-16 code unit, so sorting is locale independent', () => {
  const value = { Z: 1, a: 2, A: 3, z: 4 };

  assert.equal(canonicalJson(value), '{"A":3,"Z":1,"a":2,"z":4}');
});

test('primitives serialize the way JSON does', () => {
  assert.equal(canonicalJson(null), 'null');
  assert.equal(canonicalJson(true), 'true');
  assert.equal(canonicalJson(false), 'false');
  assert.equal(canonicalJson(0), '0');
  assert.equal(canonicalJson(-0), '0');
  assert.equal(canonicalJson(1.5), '1.5');
  assert.equal(canonicalJson('line 13'), '"line 13"');
});

test('strings needing escapes stay stable', () => {
  assert.equal(canonicalJson('quote " backslash \\ newline \n'), '"quote \\" backslash \\\\ newline \\n"');
  assert.equal(canonicalJson('operator \u2014 night'), '"operator \u2014 night"');
});

test('non-finite numbers are rejected instead of becoming null', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => canonicalJson({ seed: value }),
      (thrown: unknown) =>
        thrown instanceof CanonicalJsonError &&
        thrown.reason === 'NON_FINITE_NUMBER' &&
        thrown.path === '$.seed',
    );
  }
});

test('undefined properties are rejected instead of being dropped', () => {
  assert.throws(
    () => canonicalJson({ episodeId: 'first-ring', title: undefined }),
    (thrown: unknown) =>
      thrown instanceof CanonicalJsonError &&
      thrown.reason === 'UNSUPPORTED_TYPE' &&
      thrown.path === '$.title',
  );
});

test('functions, symbols and bigints are rejected', () => {
  const cases: readonly unknown[] = [() => 1, Symbol('x'), 10n];

  for (const value of cases) {
    assert.throws(
      () => canonicalJson({ field: value }),
      (thrown: unknown) =>
        thrown instanceof CanonicalJsonError && thrown.reason === 'UNSUPPORTED_TYPE',
    );
  }
});

test('cycles are reported with the path that closed them', () => {
  const node: Record<string, unknown> = { id: 'a' };
  node['self'] = node;

  assert.throws(
    () => canonicalJson(node),
    (thrown: unknown) =>
      thrown instanceof CanonicalJsonError &&
      thrown.reason === 'CYCLIC_REFERENCE' &&
      thrown.path === '$.self',
  );
});

test('a value repeated without a cycle is not mistaken for one', () => {
  const shared = { id: 'destination-bell-tower' };

  assert.equal(
    canonicalJson({ first: shared, second: shared }),
    '{"first":{"id":"destination-bell-tower"},"second":{"id":"destination-bell-tower"}}',
  );
});

test('serialization is byte-identical across repeated calls', () => {
  const value = { b: [3, 2, 1], a: { z: null, y: 'x' } };
  const first = canonicalJson(value);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    assert.equal(canonicalJson(value), first);
  }
});
