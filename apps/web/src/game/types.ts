import type { EntityId, GameEvent, RouteRejectedEvent } from '../contracts.ts';

/**
 * Phases named by the design document. The ninety-second slice reaches
 * BOOT, INTRO, ORIENTATION, ROUTING and ENDING; ESCALATION, LINE_13 and REPLAY
 * are declared so the full episode extends this union rather than replacing it.
 */
export type GamePhase =
  | 'BOOT'
  | 'INTRO'
  | 'ORIENTATION'
  | 'ROUTING'
  | 'ESCALATION'
  | 'LINE_13'
  | 'ENDING'
  | 'REPLAY';

/** Who is speaking on a transcript line. Operator copy is not episode content. */
export type TranscriptSpeaker = 'caller' | 'exchange' | 'line-13';

export interface TranscriptLine {
  readonly id: string;
  readonly speaker: TranscriptSpeaker;
  /** Rendered as text, never as markup. */
  readonly text: string;
  /** True once a crossed line has overwritten part of the line. */
  readonly corrupted: boolean;
  /** A spoken line carries an exact subtitle; a written line does not. */
  readonly spoken: boolean;
}

/**
 * The physical cord. A cord is held, patched, rejected or closed; there is no
 * state in which a cord is both plugged and unplugged, so the union is the
 * whole truth about what the operator's hands are doing.
 */
export type CordState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'held'; readonly callerId: EntityId }
  | { readonly kind: 'patched'; readonly callerId: EntityId; readonly destinationId: EntityId }
  | {
      readonly kind: 'rejected';
      readonly callerId: EntityId;
      readonly destinationId: EntityId;
      readonly reason: RouteRejectedEvent['reason'];
    }
  | { readonly kind: 'closed'; readonly callerId: EntityId; readonly destinationId: EntityId };

/** Where one caller stands in the night. */
export type CallerStatus = 'silent' | 'ringing' | 'answered' | 'connected';

export interface ConfirmedRoute {
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
  readonly order: number;
}

export interface GameState {
  readonly phase: GamePhase;
  /** The append-only event log. Every routing action lands here first. */
  readonly events: readonly GameEvent[];
  /** Sequence number the next event will take. */
  readonly nextSequence: number;
  /** The caller whose ticket is on the desk and whose cord is in hand. */
  readonly activeCallerId: EntityId | null;
  readonly callerStatus: Readonly<Record<EntityId, CallerStatus>>;
  readonly cord: CordState;
  readonly revealedClueIds: readonly EntityId[];
  readonly confirmedRoutes: readonly ConfirmedRoute[];
  readonly crossedLineCount: number;
  /** 0 = quiet, 1 = a voice has crossed, 2-4 = LINE 13 listening, speaking, taking the line. */
  readonly haunt: 0 | 1 | 2 | 3 | 4;
  readonly possessedLineIds: readonly EntityId[];
  readonly line13Awake: boolean;
  readonly endingId: EntityId | null;
  readonly transcript: readonly TranscriptLine[];
  /** Set once the operator has made any explicit gesture, which unlocks audio. */
  readonly interacted: boolean;
}

/**
 * Every action carries its own `atMs`. The reducer never reads a clock, so the
 * same action list always reduces to the same state and a replay is exact.
 */
export type GameAction =
  | { readonly type: 'OPEN_EXCHANGE'; readonly atMs: number }
  | { readonly type: 'FINISH_INTRO'; readonly atMs: number; readonly skipped: boolean }
  | { readonly type: 'ANSWER_CALL'; readonly atMs: number; readonly callerId: EntityId }
  | { readonly type: 'LIFT_CORD'; readonly atMs: number; readonly callerId: EntityId }
  | { readonly type: 'RELEASE_CORD'; readonly atMs: number }
  | { readonly type: 'PLUG_CORD'; readonly atMs: number; readonly destinationId: EntityId }
  | { readonly type: 'PULL_CORD'; readonly atMs: number }
  | { readonly type: 'CLOSE_CIRCUIT'; readonly atMs: number }
  | { readonly type: 'REOPEN_CIRCUIT'; readonly atMs: number; readonly callerId: EntityId }
  | { readonly type: 'RESTART'; readonly atMs: number }
  | { readonly type: 'SELECT_ENDING'; readonly atMs: number; readonly endingId: EntityId };
