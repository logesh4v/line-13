/**
 * Complete-solution enumeration.
 *
 * A solution is a destination for every caller that satisfies every
 * required-route, forbidden-route, distinct-destination and same-destination
 * constraint. Ordering constraints do not multiply solutions: they are a
 * partial order over callers, already cycle-checked and linearized into
 * `model.canonicalOrder`, so each destination assignment carries exactly one
 * canonical play order. That keeps `solutionCount` a statement about routing
 * truth (R4.3, R4.4) rather than about permutations.
 */

import type { EntityId, IntendedRoute } from '@line-13/contracts';
import type {
  DerivedConstraint,
  GraphModel,
  RouteAssignment,
  Solution,
  SolutionSet,
} from './types.ts';

export const DEFAULT_SOLUTION_LIMIT = 64;

export interface EnumerateOptions {
  readonly limit?: number;
  /** Assignments held fixed, e.g. routes the player already confirmed. */
  readonly fixed?: ReadonlyMap<EntityId, EntityId>;
}

interface PairConstraint {
  readonly kind: 'distinct-destination' | 'same-destination';
  readonly other: EntityId;
  readonly constraint: DerivedConstraint;
}

function buildPairIndex(model: GraphModel): ReadonlyMap<EntityId, readonly PairConstraint[]> {
  const index = new Map<EntityId, PairConstraint[]>();
  const add = (callerId: EntityId, entry: PairConstraint): void => {
    const existing = index.get(callerId);
    if (existing === undefined) {
      index.set(callerId, [entry]);
      return;
    }
    existing.push(entry);
  };
  for (const constraint of model.constraints) {
    if (constraint.kind !== 'distinct-destination' && constraint.kind !== 'same-destination') {
      continue;
    }
    const other = constraint.relatedCallerId;
    if (other === null) {
      continue;
    }
    add(constraint.callerId, { kind: constraint.kind, other, constraint });
    add(other, { kind: constraint.kind, other: constraint.callerId, constraint });
  }
  return index;
}

function compareIds(left: EntityId, right: EntityId): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function toSolution(
  model: GraphModel,
  assignment: ReadonlyMap<EntityId, EntityId>,
): Solution {
  const assignments: RouteAssignment[] = [...assignment.entries()]
    .map(([callerId, destinationId]) => ({ callerId, destinationId }))
    .sort((left, right) => compareIds(left.callerId, right.callerId));
  const order = model.canonicalOrder.filter((callerId) => assignment.has(callerId));
  const routes: IntendedRoute[] = order.map((callerId, index) => ({
    callerId,
    destinationId: assignment.get(callerId) ?? '',
    order: index + 1,
  }));
  return { assignments, order, routes };
}

/**
 * Every constraint violated by a complete or partial assignment. Pair
 * constraints are only judged once both callers are assigned, so this is safe
 * to call mid-play.
 */
export function constraintViolations(
  model: GraphModel,
  assignment: ReadonlyMap<EntityId, EntityId>,
): readonly DerivedConstraint[] {
  const violations: DerivedConstraint[] = [];
  for (const constraint of model.constraints) {
    const assigned = assignment.get(constraint.callerId);
    switch (constraint.kind) {
      case 'required-route': {
        if (assigned !== undefined && assigned !== constraint.destinationId) {
          violations.push(constraint);
        }
        break;
      }
      case 'forbidden-route': {
        if (assigned !== undefined && assigned === constraint.destinationId) {
          violations.push(constraint);
        }
        break;
      }
      case 'distinct-destination':
      case 'same-destination': {
        if (constraint.relatedCallerId === null) {
          break;
        }
        const other = assignment.get(constraint.relatedCallerId);
        if (assigned === undefined || other === undefined) {
          break;
        }
        const equal = assigned === other;
        if (constraint.kind === 'same-destination' ? !equal : equal) {
          violations.push(constraint);
        }
        break;
      }
      case 'ordering':
        break;
      default:
        break;
    }
  }
  return violations;
}

/** True when `assignment` breaks no constraint it is already able to break. */
export function satisfiesConstraints(
  model: GraphModel,
  assignment: ReadonlyMap<EntityId, EntityId>,
): boolean {
  return constraintViolations(model, assignment).length === 0;
}

/**
 * Enumerate complete solutions by backtracking over callers in seeded order,
 * branching over each caller's seeded domain. Stops once `limit` solutions are
 * found and reports `truncated`, so a pathological episode cannot hang a
 * validator run.
 */
export function enumerateSolutions(
  model: GraphModel,
  options?: EnumerateOptions,
): SolutionSet {
  const limit = options?.limit ?? DEFAULT_SOLUTION_LIMIT;
  const fixed = options?.fixed;
  const pairIndex = buildPairIndex(model);
  const solutions: Solution[] = [];
  const assignment = new Map<EntityId, EntityId>();
  let truncated = false;

  // Search for one more than asked, so `truncated` means "solutions exist
  // beyond the limit" rather than "the limit was exactly reached".
  const searchCeiling = limit + 1;
  if (limit <= 0) {
    return { solutions: [], truncated: true };
  }

  if (fixed !== undefined) {
    for (const [callerId, destinationId] of fixed) {
      const domain = model.domains.get(callerId);
      if (domain === undefined || !domain.includes(destinationId)) {
        return { solutions: [], truncated: false };
      }
      assignment.set(callerId, destinationId);
    }
    if (!satisfiesConstraints(model, assignment)) {
      return { solutions: [], truncated: false };
    }
  }

  const open = model.callerOrder.filter((callerId) => !assignment.has(callerId));

  const consistent = (callerId: EntityId, destinationId: EntityId): boolean => {
    for (const constraint of model.constraints) {
      if (constraint.callerId !== callerId) {
        continue;
      }
      if (constraint.kind === 'required-route' && destinationId !== constraint.destinationId) {
        return false;
      }
      if (constraint.kind === 'forbidden-route' && destinationId === constraint.destinationId) {
        return false;
      }
    }
    // A destination holds one caller (moves.ts rejects a second as 'occupied'), so an
    // assignment that shares one is not a route the player can ever complete.
    for (const [otherId, taken] of assignment) {
      if (otherId !== callerId && taken === destinationId) {
        return false;
      }
    }
    for (const pair of pairIndex.get(callerId) ?? []) {
      const other = assignment.get(pair.other);
      if (other === undefined) {
        continue;
      }
      const equal = other === destinationId;
      if (pair.kind === 'same-destination' ? !equal : equal) {
        return false;
      }
    }
    return true;
  };

  const search = (depth: number): void => {
    if (truncated) {
      return;
    }
    if (depth === open.length) {
      solutions.push(toSolution(model, new Map(assignment)));
      if (solutions.length >= searchCeiling) {
        truncated = true;
      }
      return;
    }
    const callerId = open[depth];
    if (callerId === undefined) {
      return;
    }
    for (const destinationId of model.domains.get(callerId) ?? []) {
      if (!consistent(callerId, destinationId)) {
        continue;
      }
      assignment.set(callerId, destinationId);
      search(depth + 1);
      assignment.delete(callerId);
      if (truncated) {
        return;
      }
    }
  };

  search(0);
  return { solutions: solutions.slice(0, limit), truncated };
}

/** Canonical key for a solution; equal keys mean equal routing truth. */
export function solutionKey(solution: Solution): string {
  return solution.assignments
    .map((assignment) => `${assignment.callerId}=>${assignment.destinationId}`)
    .join('|');
}

/** The manifest's authored solution expressed as a solution, or null if absent. */
export function intendedSolution(model: GraphModel): Solution | null {
  if (model.intendedRoutes.length !== model.callerOrder.length) {
    return null;
  }
  const assignment = new Map<EntityId, EntityId>();
  for (const route of model.intendedRoutes) {
    assignment.set(route.callerId, route.destinationId);
  }
  if (assignment.size !== model.callerOrder.length) {
    return null;
  }
  return toSolution(model, assignment);
}

/** Destination ids used by no enumerated solution: the authored decoys. */
export function unusedDestinationIds(
  model: GraphModel,
  solutions: readonly Solution[],
): readonly EntityId[] {
  const used = new Set<EntityId>();
  for (const solution of solutions) {
    for (const assignment of solution.assignments) {
      used.add(assignment.destinationId);
    }
  }
  return model.destinationOrder
    .filter((destinationId) => !used.has(destinationId))
    .slice()
    .sort(compareIds);
}
