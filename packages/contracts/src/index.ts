export const EPISODE_SCHEMA_VERSION = '1.0.0' as const;

export type EpisodeSchemaVersion = typeof EPISODE_SCHEMA_VERSION;
export type EntityId = string;

export interface EpisodeManifestV1 {
  readonly schemaVersion: EpisodeSchemaVersion;
  readonly episodeId: EntityId;
  readonly seed: string;
  readonly title: string;
  readonly callers: readonly Caller[];
  readonly destinations: readonly Destination[];
  readonly clues: readonly Clue[];
  readonly constraints: readonly RouteConstraint[];
  readonly intendedRoutes: readonly IntendedRoute[];
  readonly cues: readonly HauntCue[];
  readonly endings: readonly Ending[];
  readonly assets: readonly EpisodeAsset[];
  readonly solverProof: SolverProof;
  readonly publishedAt: string;
  readonly integrity: EpisodeIntegrity;
}

export interface Caller {
  readonly id: EntityId;
  readonly displayName: string;
  readonly departedOn: string;
  readonly initialLineId: EntityId;
  readonly clueIds: readonly EntityId[];
  readonly subtitle: string;
  readonly voiceAssetId?: EntityId;
}

export interface Destination {
  readonly id: EntityId;
  readonly label: string;
  readonly description: string;
}

export type Clue =
  | TextClue
  | ExclusionClue
  | RelationshipClue;

interface ClueBase {
  readonly id: EntityId;
  readonly text: string;
}

export interface TextClue extends ClueBase {
  readonly kind: 'text';
}

export interface ExclusionClue extends ClueBase {
  readonly kind: 'exclusion';
  readonly excludedDestinationIds: readonly EntityId[];
}

export interface RelationshipClue extends ClueBase {
  readonly kind: 'relationship';
  readonly relatedCallerId: EntityId;
  readonly relation: 'same-destination' | 'different-destination' | 'before' | 'after';
}

export type RouteConstraint =
  | RequiredRouteConstraint
  | ForbiddenRouteConstraint
  | DistinctDestinationConstraint
  | OrderingConstraint;

export interface RequiredRouteConstraint {
  readonly kind: 'required-route';
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
}

export interface ForbiddenRouteConstraint {
  readonly kind: 'forbidden-route';
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
}

export interface DistinctDestinationConstraint {
  readonly kind: 'distinct-destination';
  readonly callerIds: readonly [EntityId, EntityId];
}

export interface OrderingConstraint {
  readonly kind: 'ordering';
  readonly beforeCallerId: EntityId;
  readonly afterCallerId: EntityId;
}

export interface IntendedRoute {
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
  readonly order: number;
}

export interface SolverProof {
  readonly status: 'verified' | 'draft' | 'rejected';
  readonly solutionCount: number;
  readonly shortestSolutionLength: number;
  readonly unreachableNodeIds: readonly EntityId[];
  readonly proofHash: string;
  readonly validatorVersion: string;
}

export type GameEvent =
  | CallRingingEvent
  | CallAnsweredEvent
  | PlugInsertedEvent
  | PlugRemovedEvent
  | RouteConfirmedEvent
  | RouteRejectedEvent
  | CallBleedStartedEvent
  | ClueRevealedEvent
  | LinePossessedEvent
  | FinaleUnlockedEvent
  | EndingSelectedEvent;

interface GameEventBase {
  readonly sequence: number;
  readonly timestampOffsetMs: number;
}

export interface CallRingingEvent extends GameEventBase {
  readonly type: 'CALL_RINGING';
  readonly callerId: EntityId;
  readonly lineId: EntityId;
}

export interface CallAnsweredEvent extends GameEventBase {
  readonly type: 'CALL_ANSWERED';
  readonly callerId: EntityId;
}

export interface PlugInsertedEvent extends GameEventBase {
  readonly type: 'PLUG_INSERTED';
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
}

export interface PlugRemovedEvent extends GameEventBase {
  readonly type: 'PLUG_REMOVED';
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
}

export interface RouteConfirmedEvent extends GameEventBase {
  readonly type: 'ROUTE_CONFIRMED';
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
}

export interface RouteRejectedEvent extends GameEventBase {
  readonly type: 'ROUTE_REJECTED';
  readonly callerId: EntityId;
  readonly destinationId: EntityId;
  readonly reason: 'constraint' | 'ordering' | 'occupied';
}

export interface CallBleedStartedEvent extends GameEventBase {
  readonly type: 'CALL_BLEED_STARTED';
  readonly sourceCallerId: EntityId;
  readonly affectedCallerId: EntityId;
}

export interface ClueRevealedEvent extends GameEventBase {
  readonly type: 'CLUE_REVEALED';
  readonly clueId: EntityId;
}

export interface LinePossessedEvent extends GameEventBase {
  readonly type: 'LINE_POSSESSED';
  readonly lineId: EntityId;
  readonly intensity: 1 | 2 | 3;
}

export interface FinaleUnlockedEvent extends GameEventBase {
  readonly type: 'FINALE_UNLOCKED';
  readonly lineId: EntityId;
}

export interface EndingSelectedEvent extends GameEventBase {
  readonly type: 'ENDING_SELECTED';
  readonly endingId: EntityId;
}

export type HauntCue =
  | LampCue
  | SoundCue
  | VoiceFilterCue
  | EnvironmentCue
  | TranscriptCue
  | CameraCue
  | HapticCue
  | EndingTransitionCue;

interface HauntCueBase {
  readonly id: EntityId;
  readonly triggerEventType: GameEvent['type'];
  readonly intensity: 1 | 2 | 3;
  readonly durationMs: number;
  readonly reducedMotionAlternative: 'none' | 'fade' | 'static';
  readonly silentAlternative: 'none' | 'caption' | 'visual-signal';
}

export interface LampCue extends HauntCueBase {
  readonly channel: 'lamp';
  readonly targetId: EntityId;
  readonly effect: 'ring' | 'steady' | 'flicker' | 'extinguish';
}

export interface SoundCue extends HauntCueBase {
  readonly channel: 'sound';
  readonly assetId: EntityId;
  readonly effect: 'plain' | 'line-hum' | 'static' | 'reverse-tail';
}

export interface VoiceFilterCue extends HauntCueBase {
  readonly channel: 'voice-filter';
  readonly targetId: EntityId;
  readonly effect: 'telephone' | 'crossed-line' | 'distant-room' | 'possessed';
}

export interface EnvironmentCue extends HauntCueBase {
  readonly channel: 'environment';
  readonly effect: 'smoke' | 'shadow' | 'voltage-drop' | 'ritual-reveal';
}

export interface TranscriptCue extends HauntCueBase {
  readonly channel: 'transcript';
  readonly targetId: EntityId;
  readonly effect: 'reveal' | 'corrupt' | 'overwrite' | 'restore';
}

export interface CameraCue extends HauntCueBase {
  readonly channel: 'camera';
  readonly effect: 'settle' | 'focus-line' | 'jolt' | 'pull-back';
}

export interface HapticCue extends HauntCueBase {
  readonly channel: 'haptic';
  readonly patternMs: readonly number[];
}

export interface EndingTransitionCue extends HauntCueBase {
  readonly channel: 'ending-transition';
  readonly endingId: EntityId;
  readonly effect: 'connect' | 'sever' | 'reverse';
}

export interface Ending {
  readonly id: EntityId;
  readonly label: string;
  readonly description: string;
  readonly requiredEventTypes: readonly GameEvent['type'][];
}

export type EpisodeAsset = AudioAsset | ImageAsset;

interface EpisodeAssetBase {
  readonly id: EntityId;
  readonly source: string;
  readonly sha256: string;
}

export interface AudioAsset extends EpisodeAssetBase {
  readonly kind: 'audio';
  readonly transcript: string;
  readonly voiceEngine: 'polly-neural' | 'polly-generative' | 'original';
}

export interface ImageAsset extends EpisodeAssetBase {
  readonly kind: 'image';
  readonly alt: string;
}

export interface EpisodeIntegrity {
  readonly algorithm: 'SHA-256';
  readonly manifestHash: string;
}

export interface ValidationIssue {
  readonly path: string;
  readonly code:
    | 'INVALID_TYPE'
    | 'INVALID_VALUE'
    | 'DUPLICATE_ID'
    | 'MISSING_REFERENCE'
    | 'INVALID_TIMESTAMP';
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly value: EpisodeManifestV1 }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function validateEpisodeManifest(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: '$', code: 'INVALID_TYPE', message: 'Manifest must be an object.' }],
    };
  }

  if (value.schemaVersion !== EPISODE_SCHEMA_VERSION) {
    issues.push({
      path: '$.schemaVersion',
      code: 'INVALID_VALUE',
      message: `schemaVersion must equal ${EPISODE_SCHEMA_VERSION}.`,
    });
  }

  const requiredStrings = ['episodeId', 'seed', 'title', 'publishedAt'] as const;
  for (const key of requiredStrings) {
    if (!isString(value[key])) {
      issues.push({ path: `$.${key}`, code: 'INVALID_TYPE', message: `${key} must be a non-empty string.` });
    }
  }

  if (isString(value.publishedAt) && Number.isNaN(Date.parse(value.publishedAt))) {
    issues.push({ path: '$.publishedAt', code: 'INVALID_TIMESTAMP', message: 'publishedAt must be an ISO timestamp.' });
  }

  const requiredArrays = ['callers', 'destinations', 'clues', 'constraints', 'intendedRoutes', 'cues', 'endings', 'assets'] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(value[key])) {
      issues.push({ path: `$.${key}`, code: 'INVALID_TYPE', message: `${key} must be an array.` });
    }
  }

  if (!isRecord(value.solverProof)) {
    issues.push({ path: '$.solverProof', code: 'INVALID_TYPE', message: 'solverProof must be an object.' });
  }

  if (!isRecord(value.integrity)) {
    issues.push({ path: '$.integrity', code: 'INVALID_TYPE', message: 'integrity must be an object.' });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: value as unknown as EpisodeManifestV1 };
}
