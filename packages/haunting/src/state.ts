import type { EntityId, GameEvent } from './contracts.ts';

/** Cue intensity, identical to the shared `HauntCue` intensity domain. */
export type Intensity = 1 | 2 | 3;

/**
 * Haunting state derived purely from the event log.
 *
 * This is PRESENTATION pressure, not puzzle truth. Nothing here decides whether
 * a route is legal, which destination a caller wants, or whether an ending is
 * reachable. The graph engine owns all of that and reports its decisions as
 * events; this reducer only counts what already happened.
 */
export interface HauntingState {
  readonly lastSequence: number;
  readonly answeredCallerIds: readonly EntityId[];
  readonly confirmedRoutes: number;
  readonly openPlugs: number;
  readonly rejectionsByCaller: Readonly<Record<string, number>>;
  readonly totalRejections: number;
  readonly bleedEvents: number;
  readonly possessedLineIds: readonly EntityId[];
  readonly revealedClueIds: readonly EntityId[];
  readonly finaleUnlocked: boolean;
  readonly selectedEndingId: EntityId | null;
  /** Weighted consequence pressure. See `PRESSURE_WEIGHTS`. */
  readonly pressure: number;
  /** Global escalation level applied to cues that have no narrower rule. */
  readonly escalation: Intensity;
}

export const INITIAL_HAUNTING_STATE: HauntingState = {
  lastSequence: -1,
  answeredCallerIds: [],
  confirmedRoutes: 0,
  openPlugs: 0,
  rejectionsByCaller: {},
  totalRejections: 0,
  bleedEvents: 0,
  possessedLineIds: [],
  revealedClueIds: [],
  finaleUnlocked: false,
  selectedEndingId: null,
  pressure: 0,
  escalation: 1,
};

/**
 * Pressure weights. Fixed integers so replay of one event log always lands on
 * the same escalation level on every machine and in every browser.
 */
export const PRESSURE_WEIGHTS = {
  rejection: 1,
  bleed: 2,
  possession: 3,
} as const;

/** Pressure at or above which escalation reaches level 2 / level 3. */
export const ESCALATION_THRESHOLDS = { level2: 2, level3: 6 } as const;

function computePressure(
  totalRejections: number,
  bleedEvents: number,
  possessedCount: number,
): number {
  return (
    totalRejections * PRESSURE_WEIGHTS.rejection +
    bleedEvents * PRESSURE_WEIGHTS.bleed +
    possessedCount * PRESSURE_WEIGHTS.possession
  );
}

function computeEscalation(pressure: number, finaleUnlocked: boolean): Intensity {
  if (finaleUnlocked) {
    return 3;
  }
  if (pressure >= ESCALATION_THRESHOLDS.level3) {
    return 3;
  }
  if (pressure >= ESCALATION_THRESHOLDS.level2) {
    return 2;
  }
  return 1;
}

function clampIntensity(value: number): Intensity {
  if (value <= 1) {
    return 1;
  }
  if (value >= 3) {
    return 3;
  }
  return 2;
}

function appendUnique(
  list: readonly EntityId[],
  id: EntityId,
): readonly EntityId[] {
  return list.includes(id) ? list : [...list, id];
}

function recompute(draft: HauntingState): HauntingState {
  const pressure = computePressure(
    draft.totalRejections,
    draft.bleedEvents,
    draft.possessedLineIds.length,
  );
  return {
    ...draft,
    pressure,
    escalation: computeEscalation(pressure, draft.finaleUnlocked),
  };
}

/**
 * Number of times this caller's routing has been rejected so far.
 *
 * Rejection escalation is per caller: the first refusal is a flicker, the
 * second raises the exchange's voice, the third is the full consequence. This
 * is what makes a wrong connection recoverable but not free.
 */
export function rejectionsFor(state: HauntingState, callerId: EntityId): number {
  return state.rejectionsByCaller[callerId] ?? 0;
}

/** Intensity for the next cue aimed at this caller, given their rejection history. */
export function rejectionIntensity(
  state: HauntingState,
  callerId: EntityId,
): Intensity {
  return clampIntensity(Math.max(state.escalation, rejectionsFor(state, callerId)));
}

/**
 * Fold one event into haunting state. Pure, total over `GameEvent`, and
 * independent of wall-clock time, so the same log always yields the same state.
 */
export function reduceHauntingState(
  state: HauntingState,
  event: GameEvent,
): HauntingState {
  const base: HauntingState = { ...state, lastSequence: event.sequence };

  switch (event.type) {
    case 'CALL_RINGING':
      return recompute(base);

    case 'CALL_ANSWERED':
      return recompute({
        ...base,
        answeredCallerIds: appendUnique(base.answeredCallerIds, event.callerId),
      });

    case 'PLUG_INSERTED':
      return recompute({ ...base, openPlugs: base.openPlugs + 1 });

    case 'PLUG_REMOVED':
      return recompute({ ...base, openPlugs: Math.max(0, base.openPlugs - 1) });

    case 'ROUTE_CONFIRMED':
      return recompute({ ...base, confirmedRoutes: base.confirmedRoutes + 1 });

    case 'ROUTE_REJECTED': {
      const previous = rejectionsFor(base, event.callerId);
      return recompute({
        ...base,
        totalRejections: base.totalRejections + 1,
        rejectionsByCaller: {
          ...base.rejectionsByCaller,
          [event.callerId]: previous + 1,
        },
      });
    }

    case 'CALL_BLEED_STARTED':
      return recompute({ ...base, bleedEvents: base.bleedEvents + 1 });

    case 'CLUE_REVEALED':
      return recompute({
        ...base,
        revealedClueIds: appendUnique(base.revealedClueIds, event.clueId),
      });

    case 'LINE_POSSESSED':
      return recompute({
        ...base,
        possessedLineIds: appendUnique(base.possessedLineIds, event.lineId),
      });

    case 'FINALE_UNLOCKED':
      return recompute({ ...base, finaleUnlocked: true });

    case 'ENDING_SELECTED':
      return recompute({ ...base, selectedEndingId: event.endingId });
  }
}

/** Fold a whole log. Equivalent to repeated `reduceHauntingState`. */
export function reduceHauntingLog(
  events: readonly GameEvent[],
  state: HauntingState = INITIAL_HAUNTING_STATE,
): HauntingState {
  return events.reduce(reduceHauntingState, state);
}
