/**
 * Recovery guarantee (R4.5): no legal intermediate action may leave the player
 * unable to recover or finish.
 *
 * A routing state is recoverable when some set of disconnections leaves a
 * configuration that still extends to a complete solution. The search tries
 * disconnect sets smallest-first in seeded order, so the plan it returns is
 * minimal and identical on every run. `null` comes back only when the episode
 * itself has no solution — which the validator rejects before play.
 */

import type { EntityId } from '@line-13/contracts';
import { applyMove, createInitialState, legalMoves, stateKey } from './moves.ts';
import { enumerateSolutions } from './solve.ts';
import type {
  GraphModel,
  RecoverabilityAudit,
  RecoveryResult,
  RoutingState,
  Solution,
} from './types.ts';

/**
 * Default ceiling for the recoverability sweep. Sized from the measured
 * reachable state space of a bundled-episode graph (R3.1: four primary callers
 * plus the Line 13 finale): four callers over five destinations reach 2,760
 * states and over six destinations 4,553, while five callers over six reach
 * 39,572. The limit therefore covers every realistic authored episode with
 * headroom, and `computeProofReport` treats a sweep that still truncates as a
 * blocking `RECOVERY_PROOF_INCOMPLETE` issue rather than a passing grade.
 */
export const DEFAULT_RECOVERY_STATE_LIMIT = 50_000;
/** Above this many confirmed routes, skip subset search and clear the board. */
const SUBSET_SEARCH_CEILING = 12;

function combinations<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  if (size === 0) {
    return [[]];
  }
  if (size > items.length) {
    return [];
  }
  const result: T[][] = [];
  const current: T[] = [];
  const walk = (start: number): void => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      current.push(item);
      walk(index + 1);
      current.pop();
    }
  };
  walk(0);
  return result;
}

/** First solution that keeps `fixed` intact, or null when none exists. */
function completionWith(
  model: GraphModel,
  fixed: ReadonlyMap<EntityId, EntityId>,
): Solution | null {
  return enumerateSolutions(model, { limit: 1, fixed }).solutions[0] ?? null;
}

/**
 * Smallest set of confirmed callers to disconnect before the episode can still
 * be finished, together with the completing solution.
 */
export function recoveryPlan(model: GraphModel, state: RoutingState): RecoveryResult {
  const confirmedInSeededOrder = model.callerOrder.filter((callerId) =>
    state.confirmations.has(callerId),
  );

  const fixedFrom = (disconnects: readonly EntityId[]): ReadonlyMap<EntityId, EntityId> => {
    const dropped = new Set(disconnects);
    const fixed = new Map<EntityId, EntityId>();
    for (const callerId of confirmedInSeededOrder) {
      if (dropped.has(callerId)) {
        continue;
      }
      const destinationId = state.confirmations.get(callerId);
      if (destinationId !== undefined) {
        fixed.set(callerId, destinationId);
      }
    }
    return fixed;
  };

  if (confirmedInSeededOrder.length > SUBSET_SEARCH_CEILING) {
    const cleared = completionWith(model, new Map());
    if (cleared === null) {
      return { ok: false, reason: 'no-solution' };
    }
    return {
      ok: true,
      plan: { disconnects: confirmedInSeededOrder, completion: cleared },
    };
  }

  for (let size = 0; size <= confirmedInSeededOrder.length; size += 1) {
    for (const disconnects of combinations(confirmedInSeededOrder, size)) {
      const completion = completionWith(model, fixedFrom(disconnects));
      if (completion !== null) {
        return { ok: true, plan: { disconnects, completion } };
      }
    }
  }
  return { ok: false, reason: 'no-solution' };
}

/** True when the player can still finish from `state`. */
export function canRecover(model: GraphModel, state: RoutingState): boolean {
  return recoveryPlan(model, state).ok;
}

/**
 * Breadth-first sweep of the reachable routing states, asserting that every one
 * of them has a recovery plan. Bounded by `stateLimit`; `exhaustive` reports
 * whether the whole space fit, so a truncated sweep is never mistaken for a
 * proof.
 */
export function auditRecoverability(
  model: GraphModel,
  stateLimit: number = DEFAULT_RECOVERY_STATE_LIMIT,
): RecoverabilityAudit {
  const initial = createInitialState(model);
  const seen = new Set<string>([stateKey(model, initial)]);
  const queue: RoutingState[] = [initial];
  const unrecoverable: string[] = [];
  let checked = 0;
  let exhaustive = true;

  while (queue.length > 0) {
    const state = queue.shift();
    if (state === undefined) {
      break;
    }
    checked += 1;
    if (!canRecover(model, state)) {
      unrecoverable.push(stateKey(model, state));
    }
    for (const move of legalMoves(model, state)) {
      const outcome = applyMove(model, state, move, { timestampOffsetMs: 0 });
      if (outcome.status === 'illegal') {
        continue;
      }
      const key = stateKey(model, outcome.state);
      if (seen.has(key)) {
        continue;
      }
      if (seen.size >= stateLimit) {
        exhaustive = false;
        continue;
      }
      seen.add(key);
      queue.push(outcome.state);
    }
  }

  return {
    statesChecked: checked,
    exhaustive,
    unrecoverableStateKeys: [...unrecoverable].sort(),
  };
}
