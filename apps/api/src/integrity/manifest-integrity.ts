import { canonicalJson } from './canonical-json.ts';
import { isSha256Hex, timingSafeEqualHex } from './hasher.ts';
import type { Sha256Hasher } from './hasher.ts';
import type { EpisodeIntegrity, EpisodeManifestV1 } from '../contracts.ts';

/**
 * Episode manifest integrity.
 *
 * The hash covers the canonical serialization of every manifest field except
 * `integrity` itself, so the publisher can embed the result without creating a
 * self-referential hash. Verification is a three-way agreement:
 *
 *   1. the hash the manifest carries in `integrity.manifestHash`,
 *   2. the hash recorded in the catalogue when the episode was published,
 *   3. the hash recomputed from the bytes actually fetched.
 *
 * Any disagreement rejects the episode. The API never serves a manifest it
 * could not verify and never repairs one, because a half-trusted puzzle is
 * worse than no puzzle: the client has a complete bundled episode to fall back
 * to (R8.1, R8.3).
 */

export const INTEGRITY_ALGORITHM = 'SHA-256';

export type IntegrityFailureReason =
  | 'ALGORITHM_UNSUPPORTED'
  | 'HASH_MALFORMED'
  | 'EMBEDDED_HASH_MISMATCH'
  | 'CATALOGUE_HASH_MISMATCH';

export type IntegrityResult =
  | { readonly ok: true; readonly manifestHash: string }
  | { readonly ok: false; readonly reason: IntegrityFailureReason };

/** The manifest minus its own integrity block, which is what gets hashed. */
export function integrityPayload(manifest: EpisodeManifestV1): Record<string, unknown> {
  const { integrity: _omitted, ...rest } = manifest as EpisodeManifestV1 & {
    readonly integrity: EpisodeIntegrity;
  };
  void _omitted;
  return rest as unknown as Record<string, unknown>;
}

export function computeManifestHash(manifest: EpisodeManifestV1, hasher: Sha256Hasher): string {
  return hasher.hashHex(canonicalJson(integrityPayload(manifest)));
}

export interface VerifyOptions {
  /** Hash recorded in the published-episode catalogue, when one is known. */
  readonly catalogueHash?: string | undefined;
}

export function verifyManifestIntegrity(
  manifest: EpisodeManifestV1,
  hasher: Sha256Hasher,
  options: VerifyOptions = {},
): IntegrityResult {
  if (manifest.integrity.algorithm !== INTEGRITY_ALGORITHM) {
    return { ok: false, reason: 'ALGORITHM_UNSUPPORTED' };
  }

  const embedded = manifest.integrity.manifestHash;
  if (!isSha256Hex(embedded)) {
    return { ok: false, reason: 'HASH_MALFORMED' };
  }

  const computed = computeManifestHash(manifest, hasher);
  if (!timingSafeEqualHex(computed, embedded)) {
    return { ok: false, reason: 'EMBEDDED_HASH_MISMATCH' };
  }

  const catalogueHash = options.catalogueHash;
  if (catalogueHash !== undefined) {
    if (!isSha256Hex(catalogueHash)) {
      return { ok: false, reason: 'HASH_MALFORMED' };
    }
    if (!timingSafeEqualHex(computed, catalogueHash)) {
      return { ok: false, reason: 'CATALOGUE_HASH_MISMATCH' };
    }
  }

  return { ok: true, manifestHash: computed };
}

/**
 * Publication helper: returns the manifest with a correct integrity block.
 * Used by the publication pipeline, never by a request handler.
 */
export function sealManifest(
  manifest: EpisodeManifestV1,
  hasher: Sha256Hasher,
): EpisodeManifestV1 {
  const manifestHash = computeManifestHash(manifest, hasher);
  return {
    ...manifest,
    integrity: { algorithm: INTEGRITY_ALGORITHM, manifestHash },
  };
}
