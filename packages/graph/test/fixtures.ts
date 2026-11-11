/**
 * Test episodes.
 *
 * The baseline is the real bundled fixture from `@line-13/contracts`, imported
 * rather than copied so a contract change breaks these tests instead of
 * silently diverging. The variants are built from it by narrow, explicit edits.
 */

import type {
  Caller,
  Clue,
  Destination,
  EpisodeManifestV1,
  RouteConstraint,
} from '@line-13/contracts';
import minimalEpisodeJson from '../../contracts/fixtures/minimal-episode.json' with { type: 'json' };

/** The bundled single-caller episode: one solution, one decoy destination. */
export const minimalEpisode: EpisodeManifestV1 =
  minimalEpisodeJson as unknown as EpisodeManifestV1;

function withOverrides(
  base: EpisodeManifestV1,
  overrides: Partial<EpisodeManifestV1>,
): EpisodeManifestV1 {
  return { ...base, ...overrides };
}

/**
 * R4.3: required and forbidden on the same pairing. The required route empties
 * the caller's domain, so no complete solution exists.
 */
export const zeroSolutionEpisode: EpisodeManifestV1 = withOverrides(minimalEpisode, {
  episodeId: 'zero-solution',
  seed: 'line-13-zero-solution-v1',
  constraints: [
    { kind: 'required-route', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
    { kind: 'forbidden-route', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
  ] satisfies readonly RouteConstraint[],
});

/**
 * R4.4: no constraint and no clue narrows Ruth, so both destinations are
 * complete solutions and the episode is ambiguous.
 */
export const multiSolutionEpisode: EpisodeManifestV1 = withOverrides(minimalEpisode, {
  episodeId: 'multi-solution',
  seed: 'line-13-multi-solution-v1',
  callers: [
    {
      id: 'caller-ruth',
      displayName: 'Ruth Bell',
      departedOn: '1931-10-31',
      initialLineId: 'line-03',
      clueIds: [],
      subtitle: 'Operator, put me where the clock rang after midnight.',
    },
  ] satisfies readonly Caller[],
  clues: [],
  constraints: [],
});

/**
 * Two callers, three destinations, one decoy. Ruth is pinned to the bell tower.
 * Silas may take the orchard or the cellar, and a distinct-destination pair plus
 * an ordering constraint make exactly one assignment complete. Confirming Silas
 * to the orchard is legal but wrong, which is the state recovery has to undo.
 */
export const twoCallerEpisode: EpisodeManifestV1 = withOverrides(minimalEpisode, {
  episodeId: 'two-caller',
  seed: 'line-13-two-caller-v1',
  callers: [
    {
      id: 'caller-ruth',
      displayName: 'Ruth Bell',
      departedOn: '1931-10-31',
      initialLineId: 'line-03',
      clueIds: ['clue-ruth-bell'],
      subtitle: 'Operator, put me where the clock rang after midnight.',
    },
    {
      id: 'caller-silas',
      displayName: 'Silas Marsh',
      departedOn: '1931-10-30',
      initialLineId: 'line-07',
      clueIds: ['clue-silas-cellar'],
      subtitle: 'Not the orchard, operator. It answers in my voice.',
    },
  ] satisfies readonly Caller[],
  destinations: [
    {
      id: 'destination-bell-tower',
      label: 'Bell Tower',
      description: 'The clock stopped at 03:13.',
    },
    {
      id: 'destination-orchard',
      label: 'Orchard',
      description: "Something there has learned Ruth's voice.",
    },
    {
      id: 'destination-cellar',
      label: 'Cellar',
      description: 'The exchange batteries are still warm.',
    },
  ] satisfies readonly Destination[],
  clues: [
    {
      id: 'clue-ruth-bell',
      kind: 'exclusion',
      text: 'Do not place me beside the orchard.',
      excludedDestinationIds: ['destination-orchard'],
    },
    {
      id: 'clue-silas-cellar',
      kind: 'relationship',
      text: 'Ruth must be connected before me.',
      relatedCallerId: 'caller-ruth',
      relation: 'after',
    },
  ] satisfies readonly Clue[],
  constraints: [
    { kind: 'required-route', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
    { kind: 'required-route', callerId: 'caller-silas', destinationId: 'destination-cellar' },
    { kind: 'distinct-destination', callerIds: ['caller-ruth', 'caller-silas'] },
    { kind: 'ordering', beforeCallerId: 'caller-ruth', afterCallerId: 'caller-silas' },
  ] satisfies readonly RouteConstraint[],
  intendedRoutes: [
    { callerId: 'caller-ruth', destinationId: 'destination-bell-tower', order: 1 },
    { callerId: 'caller-silas', destinationId: 'destination-cellar', order: 2 },
  ],
});

/**
 * Two callers, two destinations, exactly one solution, and no ordering rule.
 *
 * Ruth's exclusion clue leaves her only the bell tower; the distinct-destination
 * constraint then forces Silas to the orchard. Silas may nonetheless be
 * confirmed into the bell tower first — nothing is violated while Ruth is
 * unassigned — which strands Ruth with an occupied destination. That is the
 * wrong-route state recovery has to undo by disconnecting Silas, and the reason
 * this fixture exists separately from `twoCallerEpisode`.
 */
export const recoverableEpisode: EpisodeManifestV1 = withOverrides(minimalEpisode, {
  episodeId: 'recoverable',
  seed: 'line-13-recoverable-v1',
  callers: [
    {
      id: 'caller-ruth',
      displayName: 'Ruth Bell',
      departedOn: '1931-10-31',
      initialLineId: 'line-03',
      clueIds: ['clue-ruth-bell'],
      subtitle: 'Operator, put me where the clock rang after midnight.',
    },
    {
      id: 'caller-silas',
      displayName: 'Silas Marsh',
      departedOn: '1931-10-30',
      initialLineId: 'line-07',
      clueIds: [],
      subtitle: 'Anywhere Ruth is not, operator.',
    },
  ] satisfies readonly Caller[],
  constraints: [
    { kind: 'distinct-destination', callerIds: ['caller-ruth', 'caller-silas'] },
  ] satisfies readonly RouteConstraint[],
  intendedRoutes: [
    { callerId: 'caller-ruth', destinationId: 'destination-bell-tower', order: 1 },
    { callerId: 'caller-silas', destinationId: 'destination-orchard', order: 2 },
  ],
});

/**
 * Non-empty domains that still admit no complete solution: both callers are
 * pinned to the bell tower while a distinct-destination constraint forbids them
 * from sharing it. This reaches the solver's `NO_SOLUTION` path, which the
 * empty-domain rejection in `zeroSolutionEpisode` short-circuits before.
 */
export const noSolutionEpisode: EpisodeManifestV1 = withOverrides(minimalEpisode, {
  episodeId: 'no-solution',
  seed: 'line-13-no-solution-v1',
  callers: [
    {
      id: 'caller-ruth',
      displayName: 'Ruth Bell',
      departedOn: '1931-10-31',
      initialLineId: 'line-03',
      clueIds: [],
      subtitle: 'Operator, put me where the clock rang after midnight.',
    },
    {
      id: 'caller-silas',
      displayName: 'Silas Marsh',
      departedOn: '1931-10-30',
      initialLineId: 'line-07',
      clueIds: [],
      subtitle: 'The tower, operator. Only the tower.',
    },
  ] satisfies readonly Caller[],
  clues: [],
  constraints: [
    { kind: 'required-route', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
    { kind: 'required-route', callerId: 'caller-silas', destinationId: 'destination-bell-tower' },
    { kind: 'distinct-destination', callerIds: ['caller-ruth', 'caller-silas'] },
  ] satisfies readonly RouteConstraint[],
  intendedRoutes: [
    { callerId: 'caller-ruth', destinationId: 'destination-bell-tower', order: 1 },
    { callerId: 'caller-silas', destinationId: 'destination-bell-tower', order: 2 },
  ],
});

/**
 * An episode at the size the bundled one actually ships at (R3.1: four primary
 * callers plus the Line 13 finale destination), with the full constraint mix.
 *
 * This fixture exists because every other one here is one or two callers, and a
 * two-caller graph reaches only a handful of states. Four callers over five
 * destinations reach 2,760 — past the old 2,000-state recovery ceiling — which
 * is the regime where a truncated recoverability sweep used to be reported as a
 * verified R4.5 guarantee.
 */
export const fourCallerEpisode: EpisodeManifestV1 = withOverrides(minimalEpisode, {
  episodeId: 'four-callers',
  seed: 'line-13-four-callers-v1',
  callers: [
    {
      id: 'caller-ruth',
      displayName: 'Ruth Bell',
      departedOn: '1931-10-31',
      initialLineId: 'line-03',
      clueIds: [],
      subtitle: 'Operator, put me where the clock rang after midnight.',
    },
    {
      id: 'caller-silas',
      displayName: 'Silas Marsh',
      departedOn: '1931-10-30',
      initialLineId: 'line-07',
      clueIds: [],
      subtitle: 'Below the water line, operator.',
    },
    {
      id: 'caller-mabel',
      displayName: 'Mabel Crewe',
      departedOn: '1931-10-28',
      initialLineId: 'line-09',
      clueIds: [],
      subtitle: 'Where the fruit went black, and no further.',
    },
    {
      id: 'caller-eli',
      displayName: 'Eli Vance',
      departedOn: '1931-10-27',
      initialLineId: 'line-11',
      clueIds: [],
      subtitle: 'Back to the room with my own switchboard in it.',
    },
  ] satisfies readonly Caller[],
  destinations: [
    { id: 'destination-bell-tower', label: 'Bell Tower', description: 'The clock stopped at 03:13.' },
    { id: 'destination-cellar', label: 'Cellar', description: 'Still a foot of standing water.' },
    { id: 'destination-orchard', label: 'Orchard', description: "Something there has learned Ruth's voice." },
    { id: 'destination-switchroom', label: 'Switch Room', description: 'His own jack, still warm.' },
    { id: 'destination-line-13', label: 'Line 13', description: 'Reserved for the finale.' },
  ] satisfies readonly Destination[],
  clues: [] satisfies readonly Clue[],
  constraints: [
    { kind: 'required-route', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
    { kind: 'required-route', callerId: 'caller-silas', destinationId: 'destination-cellar' },
    { kind: 'required-route', callerId: 'caller-mabel', destinationId: 'destination-orchard' },
    { kind: 'required-route', callerId: 'caller-eli', destinationId: 'destination-switchroom' },
    { kind: 'forbidden-route', callerId: 'caller-ruth', destinationId: 'destination-line-13' },
    { kind: 'forbidden-route', callerId: 'caller-silas', destinationId: 'destination-line-13' },
    { kind: 'forbidden-route', callerId: 'caller-mabel', destinationId: 'destination-line-13' },
    { kind: 'forbidden-route', callerId: 'caller-eli', destinationId: 'destination-line-13' },
    { kind: 'distinct-destination', callerIds: ['caller-ruth', 'caller-silas'] },
    { kind: 'distinct-destination', callerIds: ['caller-mabel', 'caller-eli'] },
    { kind: 'ordering', beforeCallerId: 'caller-ruth', afterCallerId: 'caller-silas' },
    { kind: 'ordering', beforeCallerId: 'caller-silas', afterCallerId: 'caller-mabel' },
    { kind: 'ordering', beforeCallerId: 'caller-mabel', afterCallerId: 'caller-eli' },
  ] satisfies readonly RouteConstraint[],
  intendedRoutes: [
    { callerId: 'caller-ruth', destinationId: 'destination-bell-tower', order: 1 },
    { callerId: 'caller-silas', destinationId: 'destination-cellar', order: 2 },
    { callerId: 'caller-mabel', destinationId: 'destination-orchard', order: 3 },
    { callerId: 'caller-eli', destinationId: 'destination-switchroom', order: 4 },
  ],
});
