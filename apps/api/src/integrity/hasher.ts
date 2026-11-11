import { createHash } from 'node:crypto';

/**
 * Hashing is a port so the integrity logic stays pure and testable. The only
 * implementation uses the Node runtime's own crypto module, which is present in
 * the `nodejs22.x` Lambda runtime with no package to install.
 */
export interface Sha256Hasher {
  hashHex(utf8Text: string): string;
}

export const nodeSha256Hasher: Sha256Hasher = Object.freeze({
  hashHex(utf8Text: string): string {
    return createHash('sha256').update(utf8Text, 'utf8').digest('hex');
  },
});

const HEX_64 = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: string): boolean {
  return HEX_64.test(value);
}

/** Length-independent comparison for hash equality. */
export function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
