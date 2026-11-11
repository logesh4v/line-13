/**
 * Seeded deterministic randomness.
 *
 * Every ordering decision in the graph engine consumes an explicit seed so that
 * a given episode seed always yields the same caller order, destination order
 * and canonical solution order (requirement R4.2, architecture steering rule
 * "make random behavior consume an explicit seed").
 */

export interface Rng {
  /** Next value in [0, 1). */
  next(): number;
}

/** FNV-1a 32-bit digest of a seed string, used as the PRNG state. */
export function seedToUint32(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index) & 0xffff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, fully deterministic for a given seed string. */
export function createRng(seed: string): Rng {
  let state = seedToUint32(seed);
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1) >>> 0;
      value = (value ^ (value + Math.imul(value ^ (value >>> 7), value | 61))) >>> 0;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/**
 * Deterministic shuffle. Items are keyed, drawn against a seeded PRNG and
 * tie-broken by key, so the result depends only on `(items, seed)` and never on
 * input order or host collation.
 */
export function seededOrder<T>(
  items: readonly T[],
  seed: string,
  key: (item: T) => string,
): readonly T[] {
  const rng = createRng(seed);
  const decorated = items.map((item) => ({ item, key: key(item), draw: rng.next() }));
  decorated.sort((left, right) => {
    if (left.draw !== right.draw) {
      return left.draw - right.draw;
    }
    return compareStrings(left.key, right.key);
  });
  return decorated.map((entry) => entry.item);
}
