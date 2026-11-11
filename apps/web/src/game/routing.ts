import {
  buildGraphModel,
  confirmationRejection,
  createInitialState,
} from '@line-13/graph';
import type { EntityId, EpisodeManifestV1, RouteRejectedEvent } from '../contracts.ts';
import type { ConfirmedRoute } from './types.ts';

export type RouteVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: RouteRejectedEvent['reason'];
      /** Operator-facing explanation. Text only, never markup. */
      readonly message: string;
    };

const REJECTION_COPY: Readonly<Record<RouteRejectedEvent['reason'], string>> = {
  constraint: 'The line will not hold there.',
  ordering: 'Another caller has to be placed first.',
  occupied: 'That jack is already carrying a closed circuit.',
};

const INVALID_EPISODE_MESSAGE = 'The routing card is damaged. The exchange cannot close this circuit.';

/**
 * Thin UI adapter onto `@line-13/graph`.
 *
 * The web client carries physical interaction state, but it owns no puzzle
 * truth. Every confirmation is evaluated by the reviewed graph model and its
 * normalized constraints; this module only turns the typed rejection reason
 * into words engraved for the operator.
 */
export function evaluateRoute(
  episode: EpisodeManifestV1,
  callerId: EntityId,
  destinationId: EntityId,
  confirmedRoutes: readonly ConfirmedRoute[],
): RouteVerdict {
  const built = buildGraphModel(episode);
  if (!built.ok) {
    return { ok: false, reason: 'constraint', message: INVALID_EPISODE_MESSAGE };
  }

  const initial = createInitialState(built.model);
  const ordered = [...confirmedRoutes].sort((left, right) => left.order - right.order);
  const routingState = {
    ...initial,
    confirmations: new Map(ordered.map((route) => [route.callerId, route.destinationId])),
    confirmationOrder: ordered.map((route) => route.callerId),
  };
  const reason = confirmationRejection(
    built.model,
    routingState,
    callerId,
    destinationId,
  );

  return reason === null
    ? { ok: true }
    : { ok: false, reason, message: REJECTION_COPY[reason] };
}

/** The destination the authored episode intends for this caller, if any. */
export function intendedDestinationFor(
  episode: EpisodeManifestV1,
  callerId: EntityId,
): EntityId | null {
  const route = episode.intendedRoutes.find((candidate) => candidate.callerId === callerId);
  return route?.destinationId ?? null;
}

/**
 * The current player state still admits the caller's authored route. The graph
 * package performs the actual constraint and occupancy decision.
 */
export function intendedRouteStillReachable(
  episode: EpisodeManifestV1,
  callerId: EntityId,
  confirmedRoutes: readonly ConfirmedRoute[],
): boolean {
  const intended = intendedDestinationFor(episode, callerId);
  return intended !== null && evaluateRoute(episode, callerId, intended, confirmedRoutes).ok;
}
