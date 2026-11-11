import type { Clue, Destination, Ending, EntityId, EpisodeManifestV1 } from './contracts.ts';
import { endingForLog } from './game/endings.ts';
import { LINE_13_ID } from './game/reducer.ts';
import { formatLineLabel } from './game/status.ts';
import type { ConfirmedRoute, GameState, TranscriptLine } from './game/types.ts';

export type LampState = 'ringing' | 'holding' | 'steady' | 'flicker' | 'dark' | 'listening';

/**
 * Every lamp carries a word as well as a colour and a motion, because no
 * required state may be colour-only, sound-only or motion-only (R9.4).
 */
export const LAMP_WORD: Readonly<Record<LampState, string>> = {
  ringing: 'RINGING',
  holding: 'HOLDING',
  steady: 'CONNECTED',
  flicker: 'CROSSED',
  dark: 'NO CALL',
  listening: 'LISTENING',
};

export interface BoardJack {
  readonly kind: 'caller' | 'destination' | 'line-13';
  readonly id: EntityId;
  readonly label: string;
  /** The caller's name, engraved under the line number; empty otherwise. */
  readonly name: string;
  readonly lamp: LampState;
  readonly lampWord: string;
  /** What a press on this jack does right now, or null when it does nothing. */
  readonly action: 'answer' | 'lift' | 'plug' | 'line-13' | null;
  readonly plugged: boolean;
  /** Written on the jack's ticket slot; empty for a caller line. */
  readonly description: string;
}

function cordBusy(state: GameState): boolean {
  return state.cord.kind === 'patched' || state.cord.kind === 'rejected';
}

function callerJack(
  caller: EpisodeManifestV1['callers'][number],
  state: GameState,
): BoardJack {
  const status = state.callerStatus[caller.id] ?? 'silent';
  const crossed = state.cord.kind === 'rejected' && state.cord.callerId === caller.id;
  const routing = state.phase === 'ROUTING' || state.phase === 'ESCALATION';
  const answering = state.phase === 'ORIENTATION' || routing;

  let lamp: LampState;
  let action: BoardJack['action'] = null;
  if (crossed) {
    lamp = 'flicker';
  } else if (status === 'connected') {
    lamp = 'steady';
  } else if (status === 'answered') {
    lamp = 'holding';
    action = routing && !cordBusy(state) ? 'lift' : null;
  } else if (status === 'ringing') {
    lamp = 'ringing';
    action = answering && !cordBusy(state) ? 'answer' : null;
  } else {
    lamp = 'dark';
  }

  return {
    kind: 'caller',
    id: caller.id,
    label: formatLineLabel(caller.initialLineId),
    name: caller.displayName,
    lamp,
    lampWord: LAMP_WORD[lamp],
    action,
    plugged: status === 'connected' || (state.cord.kind !== 'idle' && 'callerId' in state.cord && state.cord.callerId === caller.id && state.cord.kind !== 'held'),
    description: '',
  };
}

function destinationJack(
  destination: Destination,
  state: GameState,
  episode: EpisodeManifestV1,
): BoardJack {
  const cord = state.cord;
  const holder = state.confirmedRoutes.find((route) => route.destinationId === destination.id);
  const isTarget =
    (cord.kind === 'patched' || cord.kind === 'rejected' || cord.kind === 'closed') &&
    cord.destinationId === destination.id;

  const lamp: LampState =
    isTarget && cord.kind === 'rejected'
      ? 'flicker'
      : holder !== undefined || (isTarget && cord.kind === 'closed')
        ? 'steady'
        : 'dark';

  const holderName =
    holder === undefined
      ? ''
      : (episode.callers.find((caller) => caller.id === holder.callerId)?.displayName ?? '');

  return {
    kind: 'destination',
    id: destination.id,
    label: destination.label.toUpperCase(),
    name: holderName,
    lamp,
    lampWord: LAMP_WORD[lamp],
    action: cord.kind === 'held' ? 'plug' : null,
    plugged: holder !== undefined || (isTarget && (cord.kind === 'patched' || cord.kind === 'closed')),
    description: destination.description,
  };
}

function line13Jack(state: GameState): BoardJack {
  const lamp: LampState = state.line13Awake
    ? 'ringing'
    : state.possessedLineIds.includes(LINE_13_ID)
      ? 'listening'
      : 'dark';

  return {
    kind: 'line-13',
    id: LINE_13_ID,
    label: formatLineLabel(LINE_13_ID),
    name: '',
    lamp,
    lampWord: LAMP_WORD[lamp],
    action: state.phase === 'LINE_13' ? 'line-13' : null,
    plugged: false,
    description: '',
  };
}

/** The live face of the board, in reading and tab order: lines, jacks, Line 13. */
export function boardJacks(state: GameState, episode: EpisodeManifestV1): readonly BoardJack[] {
  return [
    ...episode.callers.map((caller) => callerJack(caller, state)),
    ...episode.destinations.map((destination) => destinationJack(destination, state, episode)),
    line13Jack(state),
  ];
}

/** Cords that stay on the board: one per closed circuit. */
export function closedCords(state: GameState): readonly ConfirmedRoute[] {
  return state.confirmedRoutes;
}

export function revealedClues(state: GameState, episode: EpisodeManifestV1): readonly Clue[] {
  return episode.clues.filter((clue) => state.revealedClueIds.includes(clue.id));
}

/** The exact subtitle for the most recent spoken line, or null when silent. */
export function currentSubtitle(state: GameState): TranscriptLine | null {
  for (let index = state.transcript.length - 1; index >= 0; index -= 1) {
    const line = state.transcript[index];
    if (line !== undefined && line.spoken) {
      return line;
    }
  }
  return null;
}

/** The ending the operator's routes have earned, once Line 13 is ringing. */
export function readyEnding(state: GameState, episode: EpisodeManifestV1): Ending | null {
  if (state.phase !== 'LINE_13') {
    return null;
  }
  return endingForLog(episode, state.events, state.crossedLineCount);
}

export function selectedEnding(state: GameState, episode: EpisodeManifestV1): Ending | null {
  if (state.endingId === null) {
    return null;
  }
  return episode.endings.find((ending) => ending.id === state.endingId) ?? null;
}

/** "LINE 03 → BELL TOWER", for the ending plate. */
export function routeSummary(state: GameState, episode: EpisodeManifestV1): string {
  const parts = state.confirmedRoutes.map((route) => {
    const caller = episode.callers.find((candidate) => candidate.id === route.callerId);
    const destination = episode.destinations.find(
      (candidate) => candidate.id === route.destinationId,
    );
    const from = formatLineLabel(caller?.initialLineId ?? 'line-00');
    const to = (destination?.label ?? route.destinationId).toUpperCase();
    return `${from} → ${to}`;
  });
  return parts.length === 0 ? 'NO CIRCUIT CLOSED' : parts.join(' · ');
}

export function canAnswer(state: GameState): boolean {
  return (
    (state.phase === 'ORIENTATION' || state.phase === 'ROUTING' || state.phase === 'ESCALATION') &&
    Object.values(state.callerStatus).includes('ringing') &&
    !cordBusy(state)
  );
}

export function canCloseCircuit(state: GameState): boolean {
  return state.cord.kind === 'patched';
}

export function canPullCord(state: GameState): boolean {
  return state.cord.kind === 'patched' || state.cord.kind === 'rejected';
}

export function activeDestinationId(state: GameState): EntityId | null {
  const cord = state.cord;
  if (cord.kind === 'patched' || cord.kind === 'rejected' || cord.kind === 'closed') {
    return cord.destinationId;
  }
  return null;
}
