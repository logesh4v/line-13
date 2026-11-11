import type { Clue, EntityId, EpisodeManifestV1, GameEvent } from '../contracts.ts';
import { openingCaller } from '../episode/loadEpisode.ts';
import { endingForLog } from './endings.ts';
import { evaluateRoute } from './routing.ts';
import type {
  CallerStatus,
  GameAction,
  GameState,
  TranscriptLine,
  TranscriptSpeaker,
} from './types.ts';

/** Operator-room copy. Not episode content, so it lives with the UI. */
export const OPERATOR_COPY = {
  circuitClosed: 'Circuit closed. The bell stops.',
  cordPulled: 'Cord pulled. The line is still holding.',
  circuitReopened: 'Circuit reopened. The caller is holding again.',
  line13Wakes: 'Operator. You never wrote down who placed the first call.',
} as const;

/**
 * What LINE 13 says as the crossed lines pile up. Index = haunt level - 2, so
 * the voice only ever arrives once a second line has been crossed. Each is a
 * spoken line with an exact subtitle.
 */
export const LINE_13_VOICE: readonly string[] = [
  'I can hear every cord you pull, operator.',
  'Each wrong jack is a letter in my name.',
  'Stop listening to them. Listen to me.',
];

export function initialState(): GameState {
  return {
    phase: 'BOOT',
    events: [],
    nextSequence: 1,
    activeCallerId: null,
    callerStatus: {},
    cord: { kind: 'idle' },
    revealedClueIds: [],
    confirmedRoutes: [],
    crossedLineCount: 0,
    haunt: 0,
    possessedLineIds: [],
    line13Awake: false,
    endingId: null,
    transcript: [],
    interacted: false,
  };
}

/** The lamp the finale wakes. Scenery of the room, not episode content. */
export const LINE_13_ID = 'line-13';

interface Draft {
  readonly events: GameEvent[];
  sequence: number;
}

function draftFrom(state: GameState): Draft {
  return { events: [], sequence: state.nextSequence };
}

function emit(draft: Draft, make: (sequence: number) => GameEvent): void {
  draft.events.push(make(draft.sequence));
  draft.sequence += 1;
}

function speak(
  sequence: number,
  speaker: TranscriptSpeaker,
  text: string,
  spoken: boolean,
): TranscriptLine {
  return { id: `transcript-${sequence}`, speaker, text, corrupted: false, spoken };
}

function corruptAll(transcript: readonly TranscriptLine[]): readonly TranscriptLine[] {
  return transcript.map((line) =>
    line.speaker === 'caller' && !line.corrupted ? { ...line, corrupted: true } : line,
  );
}

function restoreAll(transcript: readonly TranscriptLine[]): readonly TranscriptLine[] {
  return transcript.map((line) => (line.corrupted ? { ...line, corrupted: false } : line));
}

function clueById(episode: EpisodeManifestV1, clueId: EntityId): Clue | undefined {
  return episode.clues.find((clue) => clue.id === clueId);
}

function excludesDestination(clue: Clue, destinationId: EntityId): boolean {
  return clue.kind === 'exclusion' && clue.excludedDestinationIds.includes(destinationId);
}

/**
 * Recovery aid after a crossed line: prefer the clue that explains the jack the
 * operator just tried, otherwise hand over the next clue the caller still has.
 * Every wrong connection therefore teaches something, which is what keeps the
 * consequence recoverable instead of punishing.
 */
function nextClueToReveal(
  episode: EpisodeManifestV1,
  state: GameState,
  callerId: EntityId,
  destinationId: EntityId,
): EntityId | null {
  const caller = episode.callers.find((candidate) => candidate.id === callerId);
  if (caller === undefined) {
    return null;
  }
  const unrevealed = caller.clueIds.filter((id) => !state.revealedClueIds.includes(id));
  const explaining = unrevealed.find((id) => {
    const clue = clueById(episode, id);
    return clue !== undefined && excludesDestination(clue, destinationId);
  });
  return explaining ?? unrevealed[0] ?? null;
}

export function statusOf(state: GameState, callerId: EntityId): CallerStatus {
  return state.callerStatus[callerId] ?? 'silent';
}

function withStatus(
  state: GameState,
  callerId: EntityId,
  status: CallerStatus,
): Readonly<Record<EntityId, CallerStatus>> {
  return { ...state.callerStatus, [callerId]: status };
}

/** Clues a caller leads with. The last one is the recovery whisper. */
export function openingClueIds(clueIds: readonly EntityId[]): readonly EntityId[] {
  return clueIds.slice(0, Math.max(1, clueIds.length - 1));
}

function cordIsBusy(state: GameState): boolean {
  return state.cord.kind === 'patched' || state.cord.kind === 'rejected';
}

/**
 * The whole reducer is pure and reads no clock: `action.atMs` is supplied by the
 * caller. Replaying the same action list over the same episode therefore
 * reproduces byte-identical state, which is what R5.3 asks for.
 */
export function reduce(
  state: GameState,
  action: GameAction,
  episode: EpisodeManifestV1,
): GameState {
  switch (action.type) {
    case 'OPEN_EXCHANGE': {
      if (state.phase !== 'BOOT') {
        return state;
      }
      return { ...state, phase: 'INTRO' };
    }

    case 'FINISH_INTRO': {
      if (state.phase !== 'INTRO') {
        return state;
      }
      const caller = openingCaller(episode);
      const draft = draftFrom(state);
      ring(draft, action.atMs, caller.id, caller.initialLineId);
      return {
        ...state,
        phase: 'ORIENTATION',
        activeCallerId: caller.id,
        callerStatus: withStatus(state, caller.id, 'ringing'),
        events: [...state.events, ...draft.events],
        nextSequence: draft.sequence,
        interacted: state.interacted || action.skipped,
      };
    }

    case 'ANSWER_CALL': {
      const answerable =
        state.phase === 'ORIENTATION' || state.phase === 'ROUTING' || state.phase === 'ESCALATION';
      if (!answerable || cordIsBusy(state) || statusOf(state, action.callerId) !== 'ringing') {
        return state;
      }
      const callerId = action.callerId;
      const caller = episode.callers.find((candidate) => candidate.id === callerId);
      if (caller === undefined) {
        return state;
      }

      const draft = draftFrom(state);
      const transcript: TranscriptLine[] = [...state.transcript];

      emit(draft, (sequence) => ({
        type: 'CALL_ANSWERED',
        sequence,
        timestampOffsetMs: action.atMs,
        callerId,
      }));
      transcript.push(speak(draft.sequence - 1, 'caller', caller.subtitle, true));

      // The call teaches itself: answering hands over everything but the
      // recovery whisper, which is only spoken after a crossed line.
      const leading = openingClueIds(caller.clueIds);
      for (const clueId of leading) {
        const clue = clueById(episode, clueId);
        if (clue === undefined) {
          continue;
        }
        emit(draft, (sequence) => ({
          type: 'CLUE_REVEALED',
          sequence,
          timestampOffsetMs: action.atMs,
          clueId,
        }));
        transcript.push(speak(draft.sequence - 1, 'caller', clue.text, true));
      }

      // Answering one line lights the next, so the night builds one lamp at a time.
      let callerStatus = withStatus(state, callerId, 'answered');
      const next = episode.callers.find(
        (candidate) => (callerStatus[candidate.id] ?? 'silent') === 'silent',
      );
      if (next !== undefined) {
        ring(draft, action.atMs, next.id, next.initialLineId);
        callerStatus = { ...callerStatus, [next.id]: 'ringing' };
      }

      return {
        ...state,
        phase: state.phase === 'ORIENTATION' ? 'ROUTING' : state.phase,
        activeCallerId: callerId,
        callerStatus,
        cord: { kind: 'idle' },
        events: [...state.events, ...draft.events],
        nextSequence: draft.sequence,
        revealedClueIds: [...state.revealedClueIds, ...leading.filter(
          (id) => !state.revealedClueIds.includes(id),
        )],
        transcript,
        interacted: true,
      };
    }

    case 'LIFT_CORD': {
      if (state.phase !== 'ROUTING' && state.phase !== 'ESCALATION') {
        return state;
      }
      if (cordIsBusy(state) || statusOf(state, action.callerId) !== 'answered') {
        return state;
      }
      return {
        ...state,
        activeCallerId: action.callerId,
        cord: { kind: 'held', callerId: action.callerId },
        interacted: true,
      };
    }

    case 'RELEASE_CORD': {
      if (state.cord.kind !== 'held') {
        return state;
      }
      return { ...state, cord: { kind: 'idle' }, interacted: true };
    }

    case 'PLUG_CORD': {
      if (state.cord.kind !== 'held') {
        return state;
      }
      const callerId = state.cord.callerId;
      const destinationId = action.destinationId;
      const destinationExists = episode.destinations.some(
        (destination) => destination.id === destinationId,
      );
      if (!destinationExists) {
        return state;
      }

      const draft = draftFrom(state);
      emit(draft, (sequence) => ({
        type: 'PLUG_INSERTED',
        sequence,
        timestampOffsetMs: action.atMs,
        callerId,
        destinationId,
      }));

      return {
        ...state,
        cord: { kind: 'patched', callerId, destinationId },
        events: [...state.events, ...draft.events],
        nextSequence: draft.sequence,
        interacted: true,
      };
    }

    case 'PULL_CORD': {
      if (state.cord.kind !== 'patched' && state.cord.kind !== 'rejected') {
        return state;
      }
      const { callerId, destinationId } = state.cord;
      const draft = draftFrom(state);
      emit(draft, (sequence) => ({
        type: 'PLUG_REMOVED',
        sequence,
        timestampOffsetMs: action.atMs,
        callerId,
        destinationId,
      }));
      const transcript: TranscriptLine[] = [
        ...restoreAll(state.transcript),
        speak(draft.sequence - 1, 'exchange', OPERATOR_COPY.cordPulled, false),
      ];
      return {
        ...state,
        cord: { kind: 'idle' },
        events: [...state.events, ...draft.events],
        nextSequence: draft.sequence,
        transcript,
        interacted: true,
      };
    }

    case 'REOPEN_CIRCUIT': {
      if (state.phase !== 'ROUTING' && state.phase !== 'ESCALATION') {
        return state;
      }
      if (cordIsBusy(state) || state.cord.kind === 'held') {
        return state;
      }
      const route = state.confirmedRoutes.find((candidate) => candidate.callerId === action.callerId);
      if (route === undefined) {
        return state;
      }
      const draft = draftFrom(state);
      emit(draft, (sequence) => ({
        type: 'PLUG_REMOVED',
        sequence,
        timestampOffsetMs: action.atMs,
        callerId: route.callerId,
        destinationId: route.destinationId,
      }));
      return {
        ...state,
        activeCallerId: route.callerId,
        callerStatus: withStatus(state, route.callerId, 'answered'),
        confirmedRoutes: state.confirmedRoutes.filter(
          (candidate) => candidate.callerId !== route.callerId,
        ),
        cord: { kind: 'idle' },
        events: [...state.events, ...draft.events],
        nextSequence: draft.sequence,
        transcript: [
          ...restoreAll(state.transcript),
          speak(draft.sequence - 1, 'exchange', OPERATOR_COPY.circuitReopened, false),
        ],
        interacted: true,
      };
    }

    case 'CLOSE_CIRCUIT': {
      if (state.cord.kind !== 'patched') {
        return state;
      }
      const { callerId, destinationId } = state.cord;
      const destination = episode.destinations.find(
        (candidate) => candidate.id === destinationId,
      );
      if (destination === undefined) {
        return state;
      }
      const verdict = evaluateRoute(episode, callerId, destinationId, state.confirmedRoutes);
      const draft = draftFrom(state);

      if (!verdict.ok) {
        return crossLine(state, episode, draft, action.atMs, callerId, destination.label, destinationId, verdict);
      }

      emit(draft, (sequence) => ({
        type: 'ROUTE_CONFIRMED',
        sequence,
        timestampOffsetMs: action.atMs,
        callerId,
        destinationId,
      }));

      const transcript: TranscriptLine[] = [...restoreAll(state.transcript)];
      transcript.push(speak(draft.sequence - 1, 'exchange', OPERATOR_COPY.circuitClosed, false));

      const confirmedRoutes = [
        ...state.confirmedRoutes,
        { callerId, destinationId, order: state.confirmedRoutes.length + 1 },
      ];
      const callerStatus = withStatus(state, callerId, 'connected');

      let phase = state.phase;
      let line13Awake = state.line13Awake;
      const everyoneConnected = episode.callers.every(
        (caller) => (callerStatus[caller.id] ?? 'silent') === 'connected',
      );

      if (everyoneConnected) {
        emit(draft, (sequence) => ({
          type: 'FINALE_UNLOCKED',
          sequence,
          timestampOffsetMs: action.atMs,
          lineId: LINE_13_ID,
        }));
        transcript.push(speak(draft.sequence - 1, 'line-13', OPERATOR_COPY.line13Wakes, true));
        line13Awake = true;
        phase = 'LINE_13';
      }

      return {
        ...state,
        phase,
        callerStatus,
        cord: { kind: 'closed', callerId, destinationId },
        events: [...state.events, ...draft.events],
        nextSequence: draft.sequence,
        confirmedRoutes,
        line13Awake,
        transcript,
        interacted: true,
      };
    }

    case 'SELECT_ENDING': {
      if (state.phase !== 'LINE_13') {
        return state;
      }
      const ending = endingForLog(episode, state.events, state.crossedLineCount);
      if (ending === null || ending.id !== action.endingId) {
        return state;
      }
      const draft = draftFrom(state);
      emit(draft, (sequence) => ({
        type: 'ENDING_SELECTED',
        sequence,
        timestampOffsetMs: action.atMs,
        endingId: ending.id,
      }));
      return {
        ...state,
        phase: 'ENDING',
        endingId: ending.id,
        events: [...state.events, ...draft.events],
        nextSequence: draft.sequence,
        interacted: true,
      };
    }

    case 'RESTART': {
      return { ...initialState(), phase: 'INTRO', interacted: true };
    }

    default: {
      return state;
    }
  }
}

function ring(draft: Draft, atMs: number, callerId: EntityId, lineId: EntityId): void {
  emit(draft, (sequence) => ({
    type: 'CALL_RINGING',
    sequence,
    timestampOffsetMs: atMs,
    callerId,
    lineId,
  }));
}

/**
 * A refused circuit. Every crossed line teaches (a recovery clue), costs
 * nothing permanent (the cord just has to be pulled), and raises the haunt:
 *
 *   1 crossed  a voice from another line cuts in
 *   2 crossed  LINE 13 starts listening
 *   3 crossed  LINE 13 speaks, and another voice bleeds through
 *   4 crossed  LINE 13 takes the line
 *
 * The level only ever rises; pulling the cord clears the board, not the room.
 */
function crossLine(
  state: GameState,
  episode: EpisodeManifestV1,
  draft: Draft,
  atMs: number,
  callerId: EntityId,
  destinationLabel: string,
  destinationId: EntityId,
  verdict: { readonly reason: 'constraint' | 'ordering' | 'occupied'; readonly message: string },
): GameState {
  emit(draft, (sequence) => ({
    type: 'ROUTE_REJECTED',
    sequence,
    timestampOffsetMs: atMs,
    callerId,
    destinationId,
    reason: verdict.reason,
  }));

  let message = verdict.message;
  if (verdict.reason === 'occupied') {
    const holder = state.confirmedRoutes.find((route) => route.destinationId === destinationId);
    const holderName = episode.callers.find((caller) => caller.id === holder?.callerId)?.displayName;
    if (holderName !== undefined) {
      message = `That jack is carrying ${holderName}'s circuit. Reopen hers first.`;
    }
  }

  const transcript: TranscriptLine[] = [...corruptAll(state.transcript)];
  transcript.push(speak(draft.sequence - 1, 'exchange', `${destinationLabel}: ${message}`, false));

  const revealedClueId = nextClueToReveal(episode, state, callerId, destinationId);
  const revealedClueIds = [...state.revealedClueIds];
  if (revealedClueId !== null) {
    const clue = clueById(episode, revealedClueId);
    emit(draft, (sequence) => ({
      type: 'CLUE_REVEALED',
      sequence,
      timestampOffsetMs: atMs,
      clueId: revealedClueId,
    }));
    revealedClueIds.push(revealedClueId);
    if (clue !== undefined) {
      transcript.push(speak(draft.sequence - 1, 'caller', clue.text, true));
    }
  }

  const crossedLineCount = state.crossedLineCount + 1;
  const possessedLineIds = [...state.possessedLineIds];
  let phase = state.phase;
  let haunt = state.haunt;

  // Another caller's voice cuts in on the first crossed line, and again on the third.
  if (crossedLineCount === 1 || crossedLineCount === 3) {
    const affected = episode.callers.find(
      (caller) =>
        caller.id !== callerId && (state.callerStatus[caller.id] ?? 'silent') !== 'silent',
    );
    if (affected !== undefined) {
      emit(draft, (sequence) => ({
        type: 'CALL_BLEED_STARTED',
        sequence,
        timestampOffsetMs: atMs,
        sourceCallerId: callerId,
        affectedCallerId: affected.id,
      }));
      transcript.push(speak(draft.sequence - 1, 'caller', affected.subtitle, true));
    }
    haunt = Math.max(haunt, 1) as GameState['haunt'];
  }

  if (crossedLineCount >= 2 && crossedLineCount <= 4) {
    const intensity = (crossedLineCount - 1) as 1 | 2 | 3;
    emit(draft, (sequence) => ({
      type: 'LINE_POSSESSED',
      sequence,
      timestampOffsetMs: atMs,
      lineId: LINE_13_ID,
      intensity,
    }));
    if (!possessedLineIds.includes(LINE_13_ID)) {
      possessedLineIds.push(LINE_13_ID);
    }
    transcript.push(
      speak(draft.sequence - 1, 'line-13', LINE_13_VOICE[crossedLineCount - 2] ?? '', true),
    );
    haunt = crossedLineCount as GameState['haunt'];
    phase = 'ESCALATION';
  }

  return {
    ...state,
    phase,
    haunt,
    cord: { kind: 'rejected', callerId, destinationId, reason: verdict.reason },
    events: [...state.events, ...draft.events],
    nextSequence: draft.sequence,
    revealedClueIds,
    crossedLineCount,
    possessedLineIds,
    transcript,
    interacted: true,
  };
}

/** Replay a recorded action list. Used by tests and by the replay phase. */
export function replay(
  actions: readonly GameAction[],
  episode: EpisodeManifestV1,
): GameState {
  return actions.reduce((state, action) => reduce(state, action, episode), initialState());
}
