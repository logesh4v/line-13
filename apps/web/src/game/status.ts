import type { EntityId, EpisodeManifestV1 } from '../contracts.ts';
import type { GameState } from './types.ts';

/**
 * EXACT VISIBLE STATUS TEXT.
 *
 * The engraved plate on the board is the one place the operator can read what
 * the exchange is doing, so these strings are the contract: a lamp colour, a
 * flicker or a sound never carries state on its own (R9.4), and the tests
 * assert these strings character for character so the copy cannot drift.
 */
export const STATUS = {
  dormant: 'EXCHANGE DORMANT',
  opening: 'NIGHT LINE OPENING',
  ringing: (line: string) => `${line} RINGING — ANSWER THE CALL`,
  holding: (line: string) => `${line} HOLDING — LIFT THE CORD`,
  cordInHand: 'CORD IN HAND — CHOOSE A DESTINATION JACK',
  patched: (line: string, destination: string) =>
    `${line} PATCHED TO ${destination} — CLOSE THE CIRCUIT OR PULL THE CORD`,
  crossed: (destination: string) => `CROSSED LINE ON ${destination} — PULL THE CORD TO RECOVER`,
  connected: (line: string, destination: string) => `${line} CONNECTED TO ${destination}`,
  line13: 'LINE 13 IS RINGING BEHIND YOU',
  ended: (ending: string) => `NIGHT SHIFT ENDED — ${ending}`,
} as const;

/** `line-03` reads as `LINE 03`; `line-13` reads as `LINE 13`. */
export function formatLineLabel(lineId: EntityId): string {
  return lineId
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.toUpperCase())
    .join(' ');
}

function lineLabelFor(episode: EpisodeManifestV1, callerId: EntityId | null): string {
  if (callerId === null) {
    return formatLineLabel('line-00');
  }
  const caller = episode.callers.find((candidate) => candidate.id === callerId);
  return formatLineLabel(caller?.initialLineId ?? 'line-00');
}

/** First caller in episode order whose status matches, or null. */
function firstWith(
  state: GameState,
  episode: EpisodeManifestV1,
  status: GameState['callerStatus'][string],
): EntityId | null {
  return episode.callers.find((caller) => state.callerStatus[caller.id] === status)?.id ?? null;
}

function destinationLabel(episode: EpisodeManifestV1, destinationId: EntityId): string {
  const destination = episode.destinations.find((candidate) => candidate.id === destinationId);
  return (destination?.label ?? destinationId).toUpperCase();
}

/** The single status line shown on the brass plate. */
export function statusText(state: GameState, episode: EpisodeManifestV1): string {
  if (state.phase === 'BOOT') {
    return STATUS.dormant;
  }
  if (state.phase === 'INTRO') {
    return STATUS.opening;
  }

  const line = lineLabelFor(episode, state.activeCallerId);

  if (state.phase === 'ENDING') {
    const ending = episode.endings.find((candidate) => candidate.id === state.endingId);
    return STATUS.ended((ending?.label ?? 'THE LINE CLOSES').toUpperCase());
  }
  if (state.phase === 'LINE_13') {
    return STATUS.line13;
  }
  if (state.phase === 'ORIENTATION') {
    return STATUS.ringing(line);
  }

  switch (state.cord.kind) {
    case 'idle': {
      const holding = firstWith(state, episode, 'answered');
      if (holding !== null) {
        return STATUS.holding(lineLabelFor(episode, holding));
      }
      const ringing = firstWith(state, episode, 'ringing');
      return ringing === null
        ? STATUS.holding(line)
        : STATUS.ringing(lineLabelFor(episode, ringing));
    }
    case 'held':
      return STATUS.cordInHand;
    case 'patched':
      return STATUS.patched(
        lineLabelFor(episode, state.cord.callerId),
        destinationLabel(episode, state.cord.destinationId),
      );
    case 'rejected':
      return STATUS.crossed(destinationLabel(episode, state.cord.destinationId));
    case 'closed':
      return STATUS.connected(
        lineLabelFor(episode, state.cord.callerId),
        destinationLabel(episode, state.cord.destinationId),
      );
    default:
      return STATUS.dormant;
  }
}

/**
 * The one instruction the operator needs next, in plain words. The slice has no
 * tutorial screen, so this is how the first call teaches itself.
 */
export function promptText(state: GameState): string {
  const statuses = Object.values(state.callerStatus);
  const ringing = statuses.includes('ringing');
  const holding = statuses.includes('answered');

  if (state.phase === 'ORIENTATION') {
    return 'A lamp is ringing. Tap it to answer, tap again to lift the cord. Any order works.';
  }
  if (state.phase === 'LINE_13') {
    return 'The cords have drawn a sigil. The thirteenth lamp is ringing. Answer it.';
  }
  if (state.phase === 'ENDING') {
    return 'The night shift is over.';
  }
  switch (state.cord.kind) {
    case 'idle':
      if (holding) {
        return 'Lift the cord from a holding line, and plug it where her clues point.';
      }
      return ringing ? 'Answer the next ringing lamp.' : 'Wait for a lamp.';
    case 'held':
      return 'Plug the cord into the jack her clues point to.';
    case 'patched':
      return 'Close the circuit, or pull the cord and think again.';
    case 'rejected':
      return 'Pull the cord. Nothing is lost.';
    case 'closed':
      if (ringing) {
        return 'Circuit closed. Another lamp is ringing.';
      }
      return holding ? 'Circuit closed. Lift the cord from the next holding line.' : 'The circuit is closed.';
    default:
      return 'Wait for a lamp.';
  }
}
