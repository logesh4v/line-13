/**
 * Deterministic, dependency-free digests for proof reports and replay checks.
 *
 * FNV-1a 64 is a checksum, not a cryptographic hash: it detects drift between
 * two validator runs. Publication integrity (`EpisodeIntegrity.manifestHash`,
 * SHA-256) stays with the publishing pipeline, outside the graph engine, so that
 * this package keeps running unchanged in a browser with no crypto import.
 */

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function mixByte(hash: bigint, byte: number): bigint {
  return ((hash ^ BigInt(byte & 0xff)) * FNV_PRIME) & MASK_64;
}

/** 16-character lowercase hex FNV-1a 64 digest of `input`. */
export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    const unit = input.charCodeAt(index);
    hash = mixByte(hash, unit);
    hash = mixByte(hash, unit >>> 8);
  }
  return hash.toString(16).padStart(16, '0');
}

export type StableValue =
  | string
  | number
  | boolean
  | null
  | readonly StableValue[]
  | { readonly [key: string]: StableValue };

/**
 * Canonical JSON serialization: object keys sorted, arrays order-preserving,
 * no whitespace. Two structurally equal values always serialize identically.
 */
export function stableStringify(value: StableValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as { readonly [key: string]: StableValue };
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const entry = record[key];
    if (entry === undefined) {
      continue;
    }
    parts.push(`${JSON.stringify(key)}:${stableStringify(entry)}`);
  }
  return `{${parts.join(',')}}`;
}

/** Digest of the canonical serialization of `value`. */
export function stableHash(value: StableValue): string {
  return fnv1a64(stableStringify(value));
}
