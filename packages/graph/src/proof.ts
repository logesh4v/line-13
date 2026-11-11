/**
 * Machine-readable proof report (R4.6) and the episode gate (R4.3, R4.4, R4.5).
 *
 * An episode is `verified` only when it builds, has exactly one complete
 * solution (or declares its ambiguity), that solution is the authored one, and
 * every reachable routing state still has a recovery plan. Anything else is
 * `rejected` and carries the seed needed to reproduce it.
 */

import type { EntityId, EpisodeManifestV1 } from '@line-13/contracts';
import { stableHash } from './hash.ts';
import { buildGraphModel } from './model.ts';
import { auditRecoverability, DEFAULT_RECOVERY_STATE_LIMIT } from './recovery.ts';
import {
  DEFAULT_SOLUTION_LIMIT,
  enumerateSolutions,
  intendedSolution,
  solutionKey,
  unusedDestinationIds,
} from './solve.ts';
import type {
  Difficulty,
  EpisodeValidation,
  GraphIssue,
  GraphModel,
  ProofReport,
  RecoverabilityAudit,
  Solution,
  ValidateOptions,
} from './types.ts';

export const VALIDATOR_VERSION = '0.1.0';

function emptyAudit(): RecoverabilityAudit {
  return { statesChecked: 0, exhaustive: false, unrecoverableStateKeys: [] };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Difficulty from the three inputs the spec names: solution length, clue
 * dependencies and decoy destinations (tasks milestone 3).
 */
export function computeDifficulty(
  solutionLength: number,
  clueDependencyCount: number,
  decoyDestinationCount: number,
): Difficulty {
  const score = clamp(
    Math.round(solutionLength * 10 + clueDependencyCount * 6 + decoyDestinationCount * 4),
    0,
    100,
  );
  return { score, solutionLength, clueDependencyCount, decoyDestinationCount };
}

function hashReport(report: Omit<ProofReport, 'proofHash'>): string {
  return stableHash({
    validatorVersion: report.validatorVersion,
    episodeId: report.episodeId,
    seed: report.seed,
    status: report.status,
    solutionCount: report.solutionCount,
    solutionsTruncated: report.solutionsTruncated,
    shortestSolutionLength: report.shortestSolutionLength,
    unreachableNodeIds: [...report.unreachableNodeIds],
    failingSeed: report.failingSeed,
    intendedSolutionMatches: report.intendedSolutionMatches,
    difficulty: {
      score: report.difficulty.score,
      solutionLength: report.difficulty.solutionLength,
      clueDependencyCount: report.difficulty.clueDependencyCount,
      decoyDestinationCount: report.difficulty.decoyDestinationCount,
    },
    recoverability: {
      statesChecked: report.recoverability.statesChecked,
      exhaustive: report.recoverability.exhaustive,
      unrecoverableStateKeys: [...report.recoverability.unrecoverableStateKeys],
    },
    issues: report.issues.map((issue) => `${issue.code}@${issue.path}:${issue.message}`),
  });
}

function finalize(report: Omit<ProofReport, 'proofHash'>): ProofReport {
  return { ...report, proofHash: hashReport(report) };
}

function unreachableNodes(model: GraphModel, solutions: readonly Solution[]): readonly EntityId[] {
  const nodes = new Set<EntityId>(unusedDestinationIds(model, solutions));
  for (const callerId of model.callerOrder) {
    if ((model.domains.get(callerId) ?? []).length === 0) {
      nodes.add(callerId);
    }
  }
  return [...nodes].sort();
}

/**
 * Validate an episode and produce its proof report. Pure: the same manifest and
 * options always yield the same report, including `proofHash`.
 */
export function computeProofReport(
  manifest: EpisodeManifestV1,
  options?: ValidateOptions,
): ProofReport {
  const solutionLimit = options?.solutionLimit ?? DEFAULT_SOLUTION_LIMIT;
  const recoveryStateLimit = options?.recoveryStateLimit ?? DEFAULT_RECOVERY_STATE_LIMIT;
  const allowAmbiguity = options?.allowAmbiguity ?? false;

  const built = buildGraphModel(manifest);
  if (!built.ok) {
    return finalize({
      validatorVersion: VALIDATOR_VERSION,
      episodeId: manifest.episodeId,
      seed: manifest.seed,
      status: 'rejected',
      solutionCount: 0,
      solutionsTruncated: false,
      shortestSolutionLength: 0,
      unreachableNodeIds: [],
      failingSeed: manifest.seed,
      intendedSolutionMatches: false,
      difficulty: computeDifficulty(0, 0, 0),
      recoverability: emptyAudit(),
      issues: built.issues,
    });
  }

  const model = built.model;
  const issues: GraphIssue[] = [...built.issues];
  const { solutions, truncated } = enumerateSolutions(model, { limit: solutionLimit });

  if (solutions.length === 0) {
    issues.push({
      code: 'NO_SOLUTION',
      path: '$.constraints',
      message: 'No assignment of destinations satisfies every constraint.',
    });
  } else if ((solutions.length > 1 || truncated) && !allowAmbiguity) {
    issues.push({
      code: 'MULTIPLE_SOLUTIONS',
      path: '$.constraints',
      message:
        `Episode has ${solutions.length}${truncated ? '+' : ''} complete solutions; ` +
        'declare authored ambiguity or tighten the constraints.',
    });
  }

  const authored = intendedSolution(model);
  let intendedSolutionMatches = false;
  if (authored === null) {
    issues.push({
      code: 'INTENDED_SOLUTION_INVALID',
      path: '$.intendedRoutes',
      message: 'intendedRoutes do not assign exactly one destination to every caller.',
    });
  } else {
    const authoredKey = solutionKey(authored);
    intendedSolutionMatches = solutions.some(
      (solution) => solutionKey(solution) === authoredKey,
    );
    if (!intendedSolutionMatches) {
      issues.push({
        code: 'INTENDED_SOLUTION_INVALID',
        path: '$.intendedRoutes',
        message: 'The authored intended routes are not a complete solution of the graph.',
      });
    }
  }

  const recoverability =
    solutions.length === 0 ? emptyAudit() : auditRecoverability(model, recoveryStateLimit);
  if (recoverability.unrecoverableStateKeys.length > 0) {
    issues.push({
      code: 'UNRECOVERABLE_STATE',
      path: '$.constraints',
      message:
        `${recoverability.unrecoverableStateKeys.length} reachable states cannot be recovered ` +
        'from; a legal action would dead-end the player.',
    });
  }
  if (solutions.length > 0 && !recoverability.exhaustive) {
    // A truncated sweep proves nothing about the states it never visited, so it
    // must not read as a verified R4.5 guarantee (architecture steering: make
    // failures explicit; never silently substitute a different puzzle state).
    issues.push({
      code: 'RECOVERY_PROOF_INCOMPLETE',
      path: '$.constraints',
      message:
        `Recovery sweep stopped after ${recoverability.statesChecked} states without covering ` +
        'the whole reachable space, so the recovery guarantee is unproven; raise ' +
        'recoveryStateLimit or reduce the branching of the graph.',
    });
  }

  const lengths = solutions.map((solution) => solution.routes.length);
  const shortestSolutionLength = lengths.length === 0 ? 0 : Math.min(...lengths);
  const unreachableNodeIds = unreachableNodes(model, solutions);
  const decoyDestinationCount = unusedDestinationIds(model, solutions).length;
  const difficulty = computeDifficulty(
    shortestSolutionLength,
    model.clueDependencyCount,
    decoyDestinationCount,
  );

  const blocking = issues.filter((issue) => issue.code !== 'INVALID_VALUE');
  const status = blocking.length === 0 ? 'verified' : 'rejected';

  return finalize({
    validatorVersion: VALIDATOR_VERSION,
    episodeId: manifest.episodeId,
    seed: manifest.seed,
    status,
    solutionCount: solutions.length,
    solutionsTruncated: truncated,
    shortestSolutionLength,
    unreachableNodeIds,
    failingSeed: status === 'rejected' ? manifest.seed : null,
    intendedSolutionMatches,
    difficulty,
    recoverability,
    issues,
  });
}

/** `computeProofReport` plus the built model when the episode is playable. */
export function validateEpisode(
  manifest: EpisodeManifestV1,
  options?: ValidateOptions,
): EpisodeValidation {
  const report = computeProofReport(manifest, options);
  if (report.status === 'rejected') {
    return { ok: false, report };
  }
  const built = buildGraphModel(manifest);
  if (!built.ok) {
    return { ok: false, report };
  }
  return { ok: true, model: built.model, report };
}
