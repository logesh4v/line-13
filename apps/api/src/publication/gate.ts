import { validateEpisodeManifest } from '../contracts.ts';
import { verifyManifestIntegrity } from '../integrity/manifest-integrity.ts';
import type { EpisodeManifestV1 } from '../contracts.ts';
import type { Sha256Hasher } from '../integrity/hasher.ts';

/**
 * The publication gate.
 *
 * Model-produced episode content must pass schema validation, solver
 * validation, safety review and human approval before publication (R6.3). This
 * function is that rule as code: it returns every blocker at once, so a content
 * pack is never published because one check was forgotten, and a draft pack
 * cannot be promoted by accident.
 *
 * It is deliberately a pure function over a manifest plus a review record. It
 * performs no I/O, so it is the same decision in a test, in CI and in the
 * publication pipeline.
 */

export type PublicationBlocker =
  | 'SCHEMA_INVALID'
  | 'SOLVER_NOT_VERIFIED'
  | 'NO_SOLUTION'
  | 'UNINTENDED_MULTIPLE_SOLUTIONS'
  | 'UNREACHABLE_NODES'
  | 'INTEGRITY_UNSEALED'
  | 'SUBTITLE_MISSING'
  | 'AUDIO_TRANSCRIPT_MISMATCH'
  | 'THIRD_PARTY_VOICE_ENGINE'
  | 'SAFETY_REVIEW_MISSING'
  | 'HUMAN_APPROVAL_MISSING';

export interface ReviewRecord {
  readonly safetyReviewPassed: boolean;
  /** Reviewer's own identifier from the content pipeline, never a player. */
  readonly approvedBy: string;
  readonly approvedAt: string;
  /** Set when the author intends more than one legal solution. */
  readonly ambiguityIsAuthored: boolean;
}

export type PublicationDecision =
  | { readonly ok: true; readonly manifest: EpisodeManifestV1; readonly manifestHash: string }
  | { readonly ok: false; readonly blockers: readonly PublicationBlocker[] };

export function evaluatePublicationGate(
  candidate: unknown,
  review: ReviewRecord,
  hasher: Sha256Hasher,
): PublicationDecision {
  const schema = validateEpisodeManifest(candidate);
  if (!schema.ok) {
    return { ok: false, blockers: ['SCHEMA_INVALID'] };
  }

  const manifest = schema.value;
  const blockers: PublicationBlocker[] = [];
  const proof = manifest.solverProof;

  if (proof.status !== 'verified') {
    blockers.push('SOLVER_NOT_VERIFIED');
  }
  if (proof.solutionCount < 1) {
    blockers.push('NO_SOLUTION');
  }
  if (proof.solutionCount > 1 && !review.ambiguityIsAuthored) {
    blockers.push('UNINTENDED_MULTIPLE_SOLUTIONS');
  }
  if (proof.unreachableNodeIds.length > 0) {
    blockers.push('UNREACHABLE_NODES');
  }

  const integrity = verifyManifestIntegrity(manifest, hasher);
  if (!integrity.ok) {
    blockers.push('INTEGRITY_UNSEALED');
  }

  for (const caller of manifest.callers) {
    if (caller.subtitle.trim().length === 0) {
      blockers.push('SUBTITLE_MISSING');
      break;
    }
  }

  for (const asset of manifest.assets) {
    if (asset.kind !== 'audio') {
      continue;
    }
    if (asset.voiceEngine !== 'polly-neural' && asset.voiceEngine !== 'polly-generative' && asset.voiceEngine !== 'original') {
      blockers.push('THIRD_PARTY_VOICE_ENGINE');
      break;
    }
    if (asset.transcript.trim().length === 0) {
      blockers.push('AUDIO_TRANSCRIPT_MISMATCH');
      break;
    }
  }

  if (!review.safetyReviewPassed) {
    blockers.push('SAFETY_REVIEW_MISSING');
  }
  if (review.approvedBy.trim().length === 0 || Number.isNaN(Date.parse(review.approvedAt))) {
    blockers.push('HUMAN_APPROVAL_MISSING');
  }

  if (blockers.length > 0) {
    return { ok: false, blockers };
  }

  return { ok: true, manifest, manifestHash: integrity.ok ? integrity.manifestHash : '' };
}
