/**
 * Episode manifest -> graph model.
 *
 * This is the boundary where generated or remote content is checked
 * (architecture steering: "validate all remote and generated content at the
 * boundary"). Every id reference is resolved, duplicates are reported, clues
 * are normalized into constraints, caller domains are narrowed and the ordering
 * graph is cycle-checked. Nothing here enumerates solutions.
 */

import type {
  Caller,
  Clue,
  Destination,
  EntityId,
  EpisodeManifestV1,
  RouteConstraint,
} from '@line-13/contracts';
import { seededOrder } from './rng.ts';
import type { BuildResult, DerivedConstraint, GraphIssue, GraphModel } from './types.ts';

function compareIds(left: EntityId, right: EntityId): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function collectDuplicates(
  ids: readonly EntityId[],
  path: string,
  issues: GraphIssue[],
): ReadonlySet<EntityId> {
  const seen = new Set<EntityId>();
  const duplicated = new Set<EntityId>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicated.add(id);
    }
    seen.add(id);
  }
  for (const id of [...duplicated].sort(compareIds)) {
    issues.push({ code: 'DUPLICATE_ID', path, message: `Duplicate id "${id}".` });
  }
  return seen;
}

function requireReference(
  id: EntityId,
  known: ReadonlySet<EntityId>,
  path: string,
  label: string,
  issues: GraphIssue[],
): boolean {
  if (known.has(id)) {
    return true;
  }
  issues.push({
    code: 'MISSING_REFERENCE',
    path,
    message: `Unknown ${label} reference "${id}".`,
  });
  return false;
}

function pushUnique(
  map: Map<EntityId, EntityId[]>,
  key: EntityId,
  value: EntityId,
): void {
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, [value]);
    return;
  }
  if (!existing.includes(value)) {
    existing.push(value);
  }
}

function derivedFromConstraint(
  constraint: RouteConstraint,
  index: number,
): DerivedConstraint | null {
  switch (constraint.kind) {
    case 'required-route':
      return {
        kind: 'required-route',
        source: 'constraint',
        sourceId: `constraints[${index}]`,
        callerId: constraint.callerId,
        relatedCallerId: null,
        destinationId: constraint.destinationId,
      };
    case 'forbidden-route':
      return {
        kind: 'forbidden-route',
        source: 'constraint',
        sourceId: `constraints[${index}]`,
        callerId: constraint.callerId,
        relatedCallerId: null,
        destinationId: constraint.destinationId,
      };
    case 'distinct-destination':
      return {
        kind: 'distinct-destination',
        source: 'constraint',
        sourceId: `constraints[${index}]`,
        callerId: constraint.callerIds[0],
        relatedCallerId: constraint.callerIds[1],
        destinationId: null,
      };
    case 'ordering':
      return {
        kind: 'ordering',
        source: 'constraint',
        sourceId: `constraints[${index}]`,
        callerId: constraint.beforeCallerId,
        relatedCallerId: constraint.afterCallerId,
        destinationId: null,
      };
    default:
      return null;
  }
}

/**
 * Clue-implied constraints. An exclusion clue removes destinations from the
 * caller that owns it; a relationship clue pairs or orders two callers. A clue
 * owned by no caller constrains nothing and is reported as unused.
 */
function derivedFromClue(
  clue: Clue,
  ownerCallerIds: readonly EntityId[],
  destinationIds: ReadonlySet<EntityId>,
  callerIds: ReadonlySet<EntityId>,
  issues: GraphIssue[],
): readonly DerivedConstraint[] {
  const derived: DerivedConstraint[] = [];
  if (clue.kind === 'text') {
    return derived;
  }

  if (ownerCallerIds.length === 0) {
    issues.push({
      code: 'INVALID_VALUE',
      path: `$.clues[id=${clue.id}]`,
      message: `Clue "${clue.id}" constrains routing but no caller lists it in clueIds.`,
    });
    return derived;
  }

  for (const ownerId of ownerCallerIds) {
    if (clue.kind === 'exclusion') {
      for (const destinationId of clue.excludedDestinationIds) {
        if (!requireReference(
          destinationId,
          destinationIds,
          `$.clues[id=${clue.id}].excludedDestinationIds`,
          'destination',
          issues,
        )) {
          continue;
        }
        derived.push({
          kind: 'forbidden-route',
          source: 'clue',
          sourceId: clue.id,
          callerId: ownerId,
          relatedCallerId: null,
          destinationId,
        });
      }
      continue;
    }

    if (!requireReference(
      clue.relatedCallerId,
      callerIds,
      `$.clues[id=${clue.id}].relatedCallerId`,
      'caller',
      issues,
    )) {
      continue;
    }
    if (clue.relatedCallerId === ownerId) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `$.clues[id=${clue.id}].relatedCallerId`,
        message: `Relationship clue "${clue.id}" relates caller "${ownerId}" to itself.`,
      });
      continue;
    }
    switch (clue.relation) {
      case 'same-destination':
        derived.push({
          kind: 'same-destination',
          source: 'clue',
          sourceId: clue.id,
          callerId: ownerId,
          relatedCallerId: clue.relatedCallerId,
          destinationId: null,
        });
        break;
      case 'different-destination':
        derived.push({
          kind: 'distinct-destination',
          source: 'clue',
          sourceId: clue.id,
          callerId: ownerId,
          relatedCallerId: clue.relatedCallerId,
          destinationId: null,
        });
        break;
      case 'before':
        derived.push({
          kind: 'ordering',
          source: 'clue',
          sourceId: clue.id,
          callerId: ownerId,
          relatedCallerId: clue.relatedCallerId,
          destinationId: null,
        });
        break;
      case 'after':
        derived.push({
          kind: 'ordering',
          source: 'clue',
          sourceId: clue.id,
          callerId: clue.relatedCallerId,
          relatedCallerId: ownerId,
          destinationId: null,
        });
        break;
      default:
        break;
    }
  }
  return derived;
}

/**
 * Kahn's algorithm with a seeded tie-break: among the callers whose
 * predecessors are all placed, the one earliest in the seeded caller order
 * wins. Returns null when the ordering constraints contain a cycle.
 */
function canonicalTopologicalOrder(
  callerOrder: readonly EntityId[],
  orderingBefore: ReadonlyMap<EntityId, readonly EntityId[]>,
): readonly EntityId[] | null {
  const placed = new Set<EntityId>();
  const result: EntityId[] = [];
  while (result.length < callerOrder.length) {
    let chosen: EntityId | null = null;
    for (const callerId of callerOrder) {
      if (placed.has(callerId)) {
        continue;
      }
      const predecessors = orderingBefore.get(callerId) ?? [];
      if (predecessors.every((predecessor) => placed.has(predecessor))) {
        chosen = callerId;
        break;
      }
    }
    if (chosen === null) {
      return null;
    }
    placed.add(chosen);
    result.push(chosen);
  }
  return result;
}

function validateCues(
  manifest: EpisodeManifestV1,
  assetIds: ReadonlySet<EntityId>,
  endingIds: ReadonlySet<EntityId>,
  issues: GraphIssue[],
): void {
  for (const cue of manifest.cues) {
    if (cue.channel === 'sound') {
      requireReference(cue.assetId, assetIds, `$.cues[id=${cue.id}].assetId`, 'asset', issues);
    }
    if (cue.channel === 'ending-transition') {
      requireReference(cue.endingId, endingIds, `$.cues[id=${cue.id}].endingId`, 'ending', issues);
    }
    if (cue.durationMs < 0) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `$.cues[id=${cue.id}].durationMs`,
        message: 'durationMs must not be negative.',
      });
    }
  }
}

function validateCallers(
  callers: readonly Caller[],
  clueIds: ReadonlySet<EntityId>,
  assetIds: ReadonlySet<EntityId>,
  issues: GraphIssue[],
): void {
  for (const caller of callers) {
    if (caller.initialLineId.length === 0) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `$.callers[id=${caller.id}].initialLineId`,
        message: 'initialLineId must be a non-empty line id.',
      });
    }
    if (caller.subtitle.length === 0) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `$.callers[id=${caller.id}].subtitle`,
        message: 'Every spoken caller line needs an exact subtitle (R6.4).',
      });
    }
    for (const clueId of caller.clueIds) {
      requireReference(clueId, clueIds, `$.callers[id=${caller.id}].clueIds`, 'clue', issues);
    }
    const voiceAssetId = caller.voiceAssetId;
    if (voiceAssetId !== undefined) {
      requireReference(
        voiceAssetId,
        assetIds,
        `$.callers[id=${caller.id}].voiceAssetId`,
        'asset',
        issues,
      );
    }
  }
}

function validateIntendedRoutes(
  manifest: EpisodeManifestV1,
  callerIds: ReadonlySet<EntityId>,
  destinationIds: ReadonlySet<EntityId>,
  issues: GraphIssue[],
): void {
  const seenCallers = new Set<EntityId>();
  const seenOrders = new Set<number>();
  for (const route of manifest.intendedRoutes) {
    requireReference(route.callerId, callerIds, '$.intendedRoutes[].callerId', 'caller', issues);
    requireReference(
      route.destinationId,
      destinationIds,
      '$.intendedRoutes[].destinationId',
      'destination',
      issues,
    );
    if (seenCallers.has(route.callerId)) {
      issues.push({
        code: 'DUPLICATE_ID',
        path: '$.intendedRoutes[].callerId',
        message: `Caller "${route.callerId}" has more than one intended route.`,
      });
    }
    seenCallers.add(route.callerId);
    if (!Number.isInteger(route.order) || route.order < 1) {
      issues.push({
        code: 'INVALID_VALUE',
        path: '$.intendedRoutes[].order',
        message: `Order must be an integer >= 1, received ${route.order}.`,
      });
    } else if (seenOrders.has(route.order)) {
      issues.push({
        code: 'INVALID_VALUE',
        path: '$.intendedRoutes[].order',
        message: `Duplicate intended order ${route.order}.`,
      });
    }
    seenOrders.add(route.order);
  }
  for (const callerId of [...callerIds].sort(compareIds)) {
    if (!seenCallers.has(callerId)) {
      issues.push({
        code: 'MISSING_REFERENCE',
        path: '$.intendedRoutes',
        message: `Caller "${callerId}" has no intended route.`,
      });
    }
  }
}

/**
 * Build the deterministic graph model for an episode.
 *
 * Returns `ok: false` when a reference, duplicate, empty domain or ordering
 * cycle makes the puzzle unrepresentable. Non-fatal observations (an unused
 * clue, a negative cue duration) come back alongside a usable model.
 */
export function buildGraphModel(manifest: EpisodeManifestV1): BuildResult {
  const issues: GraphIssue[] = [];

  const callerIds = collectDuplicates(
    manifest.callers.map((caller: Caller) => caller.id),
    '$.callers',
    issues,
  );
  const destinationIds = collectDuplicates(
    manifest.destinations.map((destination: Destination) => destination.id),
    '$.destinations',
    issues,
  );
  const clueIds = collectDuplicates(manifest.clues.map((clue: Clue) => clue.id), '$.clues', issues);
  const endingIds = collectDuplicates(
    manifest.endings.map((ending) => ending.id),
    '$.endings',
    issues,
  );
  const assetIds = collectDuplicates(
    manifest.assets.map((asset) => asset.id),
    '$.assets',
    issues,
  );

  if (callerIds.size === 0) {
    issues.push({ code: 'EMPTY_DOMAIN', path: '$.callers', message: 'An episode needs at least one caller.' });
  }
  if (destinationIds.size === 0) {
    issues.push({
      code: 'EMPTY_DOMAIN',
      path: '$.destinations',
      message: 'An episode needs at least one destination.',
    });
  }

  validateCallers(manifest.callers, clueIds, assetIds, issues);
  validateCues(manifest, assetIds, endingIds, issues);
  validateIntendedRoutes(manifest, callerIds, destinationIds, issues);

  for (const ending of manifest.endings) {
    if (ending.requiredEventTypes.length === 0) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `$.endings[id=${ending.id}].requiredEventTypes`,
        message: 'An ending needs at least one required event type.',
      });
    }
  }

  const constraints: DerivedConstraint[] = [];
  manifest.constraints.forEach((constraint: RouteConstraint, index: number) => {
    const derived = derivedFromConstraint(constraint, index);
    if (derived === null) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `$.constraints[${index}]`,
        message: 'Unrecognized constraint kind.',
      });
      return;
    }
    const callerOk = requireReference(
      derived.callerId,
      callerIds,
      `$.constraints[${index}].callerId`,
      'caller',
      issues,
    );
    let relatedOk = true;
    if (derived.relatedCallerId !== null) {
      relatedOk = requireReference(
        derived.relatedCallerId,
        callerIds,
        `$.constraints[${index}].relatedCallerId`,
        'caller',
        issues,
      );
      if (relatedOk && derived.relatedCallerId === derived.callerId) {
        issues.push({
          code: 'INVALID_VALUE',
          path: `$.constraints[${index}]`,
          message: `Constraint relates caller "${derived.callerId}" to itself.`,
        });
        relatedOk = false;
      }
    }
    let destinationOk = true;
    if (derived.destinationId !== null) {
      destinationOk = requireReference(
        derived.destinationId,
        destinationIds,
        `$.constraints[${index}].destinationId`,
        'destination',
        issues,
      );
    }
    if (callerOk && relatedOk && destinationOk) {
      constraints.push(derived);
    }
  });

  const cluesByOwner = new Map<EntityId, EntityId[]>();
  for (const caller of manifest.callers) {
    for (const clueId of caller.clueIds) {
      pushUnique(cluesByOwner, clueId, caller.id);
    }
  }
  let clueDependencyCount = 0;
  for (const clue of manifest.clues) {
    const owners = cluesByOwner.get(clue.id) ?? [];
    const derived = derivedFromClue(clue, owners, destinationIds, callerIds, issues);
    if (derived.length > 0) {
      clueDependencyCount += 1;
    }
    constraints.push(...derived);
  }

  const orderingAfterDraft = new Map<EntityId, EntityId[]>();
  const orderingBeforeDraft = new Map<EntityId, EntityId[]>();
  const requiredByCaller = new Map<EntityId, Set<EntityId>>();
  const forbiddenByCaller = new Map<EntityId, Set<EntityId>>();

  for (const constraint of constraints) {
    if (constraint.kind === 'ordering' && constraint.relatedCallerId !== null) {
      pushUnique(orderingAfterDraft, constraint.callerId, constraint.relatedCallerId);
      pushUnique(orderingBeforeDraft, constraint.relatedCallerId, constraint.callerId);
      continue;
    }
    if (constraint.destinationId === null) {
      continue;
    }
    if (constraint.kind !== 'required-route' && constraint.kind !== 'forbidden-route') {
      continue;
    }
    const bucket = constraint.kind === 'required-route' ? requiredByCaller : forbiddenByCaller;
    const existing = bucket.get(constraint.callerId);
    if (existing === undefined) {
      bucket.set(constraint.callerId, new Set([constraint.destinationId]));
    } else {
      existing.add(constraint.destinationId);
    }
  }

  const callerOrder = seededOrder(
    [...callerIds].sort(compareIds),
    `${manifest.seed}:callers`,
    (id) => id,
  );
  const destinationOrder = seededOrder(
    [...destinationIds].sort(compareIds),
    `${manifest.seed}:destinations`,
    (id) => id,
  );

  const domains = new Map<EntityId, readonly EntityId[]>();
  for (const callerId of callerOrder) {
    const required = requiredByCaller.get(callerId);
    const forbidden = forbiddenByCaller.get(callerId) ?? new Set<EntityId>();
    if (required !== undefined && required.size > 1) {
      issues.push({
        code: 'INVALID_VALUE',
        path: `$.constraints[caller=${callerId}]`,
        message: `Caller "${callerId}" has ${required.size} conflicting required routes.`,
      });
    }
    const candidates = destinationOrder.filter((destinationId) => {
      if (required !== undefined && !required.has(destinationId)) {
        return false;
      }
      return !forbidden.has(destinationId);
    });
    if (candidates.length === 0) {
      issues.push({
        code: 'EMPTY_DOMAIN',
        path: `$.constraints[caller=${callerId}]`,
        message: `Caller "${callerId}" has no permitted destination.`,
      });
    }
    domains.set(callerId, candidates);
  }

  const orderingAfter = new Map<EntityId, readonly EntityId[]>();
  for (const [key, value] of orderingAfterDraft) {
    orderingAfter.set(key, [...value].sort(compareIds));
  }
  const orderingBefore = new Map<EntityId, readonly EntityId[]>();
  for (const [key, value] of orderingBeforeDraft) {
    orderingBefore.set(key, [...value].sort(compareIds));
  }

  const canonicalOrder = canonicalTopologicalOrder(callerOrder, orderingBefore);
  if (canonicalOrder === null) {
    issues.push({
      code: 'ORDERING_CYCLE',
      path: '$.constraints',
      message: 'Ordering constraints contain a cycle, so no play order satisfies them.',
    });
  }

  const fatal = issues.filter((issue) =>
    issue.code === 'DUPLICATE_ID' ||
    issue.code === 'MISSING_REFERENCE' ||
    issue.code === 'EMPTY_DOMAIN' ||
    issue.code === 'ORDERING_CYCLE',
  );
  if (fatal.length > 0 || canonicalOrder === null) {
    return { ok: false, issues };
  }

  const model: GraphModel = {
    episodeId: manifest.episodeId,
    seed: manifest.seed,
    callerOrder,
    destinationOrder,
    domains,
    constraints,
    orderingAfter,
    orderingBefore,
    canonicalOrder,
    intendedRoutes: [...manifest.intendedRoutes].sort((left, right) => left.order - right.order),
    clueDependencyCount,
  };
  return { ok: true, model, issues };
}
