import type { EndingTransitionCue, EntityId, EpisodeManifestV1, GameEvent } from '../contracts.ts';

/**
 * The three endings of "The First Ring".
 *
 * Which one the operator earns is a pure function of the routes they made:
 * how many lines they crossed before the board was whole. Nothing is chosen
 * from a menu and nothing is random. The episode manifest still owns each
 * ending's id, label, description and the events that must have happened; this
 * file owns only the thresholds and the epilogue copy, which are story, not
 * puzzle truth.
 */
export const ENDING_CLEAN = 'ending-first-connection';
export const ENDING_CROSSED = 'ending-crossed-line';
export const ENDING_POSSESSED = 'ending-thirteenth-operator';

/** Crossed lines at which the board is no longer entirely the operator's. */
export const CROSSED_THRESHOLD = 1;
export const POSSESSED_THRESHOLD = 4;

export function endingIdFor(crossedLineCount: number): EntityId {
  if (crossedLineCount >= POSSESSED_THRESHOLD) {
    return ENDING_POSSESSED;
  }
  if (crossedLineCount >= CROSSED_THRESHOLD) {
    return ENDING_CROSSED;
  }
  return ENDING_CLEAN;
}

/** What each ending asks of the player, in the words the plate prints. */
export const ENDING_REQUIREMENT: Readonly<Record<EntityId, string>> = {
  [ENDING_CLEAN]: 'Every caller placed without a single crossed line.',
  [ENDING_CROSSED]: 'The board completed after one to three crossed lines.',
  [ENDING_POSSESSED]: 'The board completed after four or more crossed lines.',
};

/** Authored transition per ending, handed to the cue mapper. */
export const ENDING_EFFECTS: Readonly<Record<EntityId, EndingTransitionCue['effect']>> = {
  [ENDING_CLEAN]: 'connect',
  [ENDING_CROSSED]: 'reverse',
  [ENDING_POSSESSED]: 'sever',
};

export const ENDING_EPILOGUE: Readonly<Record<EntityId, readonly string[]>> = {
  [ENDING_CLEAN]: [
    'Four voices went where they asked to go, and the line behind them stayed silent.',
    'Line 13 rings once more, and this time it is only saying thank you.',
  ],
  [ENDING_CROSSED]: [
    'The cords are all home, but something heard every wrong jack.',
    'Line 13 keeps the voices that crossed. Some nights you will hear them under the hum.',
  ],
  [ENDING_POSSESSED]: [
    'You refused the line so many times that it learned to answer for you.',
    'The board is whole. The hand on the cords is no longer entirely yours.',
  ],
};

/**
 * An ending is only reachable if the log actually contains what the manifest
 * says it requires. This is how the full episode keeps R6 honest: the
 * thresholds above can never award an ending the story has not earned.
 */
export function endingForLog(
  episode: EpisodeManifestV1,
  events: readonly GameEvent[],
  crossedLineCount: number,
): EpisodeManifestV1['endings'][number] | null {
  const seen = new Set(events.map((event) => event.type));
  const earned = (candidate: EpisodeManifestV1['endings'][number]): boolean =>
    candidate.requiredEventTypes.every((type) => seen.has(type));
  const preferred = episode.endings.find((candidate) => candidate.id === endingIdFor(crossedLineCount));
  if (preferred !== undefined) {
    return earned(preferred) ? preferred : null;
  }
  // shortcut: an episode that declares fewer than three endings (the
  // single-caller slice) gets its first earned ending; upgrade when a shorter
  // episode needs its own thresholds.
  return episode.endings.find(earned) ?? null;
}
