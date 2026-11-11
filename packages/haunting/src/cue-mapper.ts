import type {
  CameraCue,
  EndingTransitionCue,
  EntityId,
  EnvironmentCue,
  GameEvent,
  HauntCue,
  LampCue,
  SoundCue,
  TranscriptCue,
  VoiceFilterCue,
} from './contracts.ts';
import {
  INITIAL_HAUNTING_STATE,
  reduceHauntingState,
  rejectionIntensity,
  type HauntingState,
  type Intensity,
} from './state.ts';

/**
 * Base durations in milliseconds, keyed by the cue's dramatic role rather than
 * by channel, so a bell and a relay click can share a channel without sharing a
 * length. Integers only: a replay must not depend on float rounding.
 */
const BASE_DURATION_MS = {
  lampRing: 1800,
  lampSteady: 600,
  lampFlicker: 900,
  lampExtinguish: 500,
  soundBell: 1800,
  soundBellThirteen: 2600,
  soundJack: 220,
  soundCord: 320,
  soundRelay: 180,
  soundStatic: 900,
  soundHum: 2600,
  soundReverse: 1400,
  soundStamp: 260,
  soundClose: 2400,
  voice: 2400,
  environment: 1600,
  transcript: 900,
  camera: 900,
  haptic: 240,
  endingTransition: 3200,
} as const;

/**
 * Intensity scaling. A level-3 cue is half again as long as a level-1 cue, and
 * the arithmetic is integer division so the value is bit-identical on replay.
 */
function scaleDuration(base: number, intensity: Intensity): number {
  return base + (intensity - 1) * Math.trunc(base / 4);
}

/**
 * Deterministic cue id: event sequence, channel, and the cue's ordinal inside
 * that event. Replaying a log reproduces every id exactly, which is what lets
 * the UI key animations and the tests assert on identity.
 */
export function cueId(
  sequence: number,
  channel: HauntCue['channel'],
  ordinal: number,
): EntityId {
  return `cue-${sequence}-${channel}-${ordinal}`;
}

/**
 * Appends cues for one event, handing out stable per-channel ordinals.
 * Nothing in here reads a clock, a random source, or graph state.
 */
interface CueSink {
  readonly lamp: (
    targetId: EntityId,
    effect: LampCue['effect'],
    base: number,
    reducedMotionAlternative: LampCue['reducedMotionAlternative'],
  ) => void;
  readonly sound: (
    assetId: EntityId,
    effect: SoundCue['effect'],
    base: number,
  ) => void;
  readonly voice: (targetId: EntityId, effect: VoiceFilterCue['effect']) => void;
  readonly environment: (
    effect: EnvironmentCue['effect'],
    reducedMotionAlternative: EnvironmentCue['reducedMotionAlternative'],
  ) => void;
  readonly transcript: (targetId: EntityId, effect: TranscriptCue['effect']) => void;
  readonly camera: (
    effect: CameraCue['effect'],
    reducedMotionAlternative: CameraCue['reducedMotionAlternative'],
  ) => void;
  readonly haptic: (patternMs: readonly number[]) => void;
  readonly ending: (endingId: EntityId, effect: EndingTransitionCue['effect']) => void;
  readonly collected: () => readonly HauntCue[];
}

function createCueSink(
  triggerEventType: GameEvent['type'],
  sequence: number,
  intensity: Intensity,
): CueSink {
  const cues: HauntCue[] = [];
  const ordinals = new Map<string, number>();

  const nextId = (channel: HauntCue['channel']): EntityId => {
    const used = ordinals.get(channel) ?? 0;
    ordinals.set(channel, used + 1);
    return cueId(sequence, channel, used);
  };

  return {
    lamp: (targetId, effect, base, reducedMotionAlternative) => {
      cues.push({
        id: nextId('lamp'),
        channel: 'lamp',
        triggerEventType,
        intensity,
        durationMs: scaleDuration(base, intensity),
        reducedMotionAlternative,
        silentAlternative: 'visual-signal',
        targetId,
        effect,
      });
    },
    sound: (assetId, effect, base) => {
      cues.push({
        id: nextId('sound'),
        channel: 'sound',
        triggerEventType,
        intensity,
        durationMs: scaleDuration(base, intensity),
        reducedMotionAlternative: 'none',
        silentAlternative: 'visual-signal',
        assetId,
        effect,
      });
    },
    voice: (targetId, effect) => {
      cues.push({
        id: nextId('voice-filter'),
        channel: 'voice-filter',
        triggerEventType,
        intensity,
        durationMs: scaleDuration(BASE_DURATION_MS.voice, intensity),
        reducedMotionAlternative: 'none',
        silentAlternative: 'caption',
        targetId,
        effect,
      });
    },
    environment: (effect, reducedMotionAlternative) => {
      cues.push({
        id: nextId('environment'),
        channel: 'environment',
        triggerEventType,
        intensity,
        durationMs: scaleDuration(BASE_DURATION_MS.environment, intensity),
        reducedMotionAlternative,
        silentAlternative: 'visual-signal',
        effect,
      });
    },
    transcript: (targetId, effect) => {
      cues.push({
        id: nextId('transcript'),
        channel: 'transcript',
        triggerEventType,
        intensity,
        durationMs: scaleDuration(BASE_DURATION_MS.transcript, intensity),
        reducedMotionAlternative: 'fade',
        silentAlternative: 'caption',
        targetId,
        effect,
      });
    },
    camera: (effect, reducedMotionAlternative) => {
      cues.push({
        id: nextId('camera'),
        channel: 'camera',
        triggerEventType,
        intensity,
        durationMs: scaleDuration(BASE_DURATION_MS.camera, intensity),
        reducedMotionAlternative,
        silentAlternative: 'none',
        effect,
      });
    },
    haptic: (patternMs) => {
      cues.push({
        id: nextId('haptic'),
        channel: 'haptic',
        triggerEventType,
        intensity,
        durationMs: scaleDuration(BASE_DURATION_MS.haptic, intensity),
        reducedMotionAlternative: 'none',
        silentAlternative: 'none',
        patternMs,
      });
    },
    ending: (endingId, effect) => {
      cues.push({
        id: nextId('ending-transition'),
        channel: 'ending-transition',
        triggerEventType,
        intensity,
        durationMs: scaleDuration(BASE_DURATION_MS.endingTransition, intensity),
        reducedMotionAlternative: 'fade',
        silentAlternative: 'visual-signal',
        endingId,
        effect,
      });
    },
    collected: () => cues,
  };
}

/** Declarative knobs the episode or UI supplies; never puzzle decisions. */
export interface CueMappingOptions {
  /**
   * Which transition an ending plays. Authored per episode because the shape of
   * an ending is story, not something the haunting engine may infer.
   */
  readonly endingEffects?: Readonly<Record<string, EndingTransitionCue['effect']>>;
}

export interface CueMappingResult {
  readonly state: HauntingState;
  readonly cues: readonly HauntCue[];
}

function hapticPattern(intensity: Intensity): readonly number[] {
  if (intensity === 1) {
    return [40];
  }
  if (intensity === 2) {
    return [60, 40, 60];
  }
  return [90, 40, 90, 40, 140];
}

function intensityFor(event: GameEvent, state: HauntingState): Intensity {
  if (event.type === 'ROUTE_REJECTED') {
    return rejectionIntensity(state, event.callerId);
  }
  if (event.type === 'LINE_POSSESSED') {
    const combined = Math.max(event.intensity, state.escalation);
    return combined >= 3 ? 3 : combined === 2 ? 2 : 1;
  }
  return state.escalation;
}

/**
 * Map one event to its cues.
 *
 * State is reduced FIRST, then cues are built from the resulting state, so the
 * cue that announces a consequence already carries that consequence's
 * escalation. The function is pure: same `(event, state)` in, deep-equal
 * `(cues, state)` out, with no clock, no randomness, and no graph lookup.
 */
export function mapEvent(
  event: GameEvent,
  state: HauntingState = INITIAL_HAUNTING_STATE,
  options: CueMappingOptions = {},
): CueMappingResult {
  const nextState = reduceHauntingState(state, event);
  const intensity = intensityFor(event, nextState);
  const sink = createCueSink(event.type, event.sequence, intensity);

  switch (event.type) {
    case 'CALL_RINGING':
      sink.lamp(event.lineId, 'ring', BASE_DURATION_MS.lampRing, 'static');
      sink.sound('sfx.bell.ring', 'plain', BASE_DURATION_MS.soundBell);
      sink.camera('focus-line', 'static');
      break;

    case 'CALL_ANSWERED':
      sink.lamp(event.callerId, 'steady', BASE_DURATION_MS.lampSteady, 'static');
      sink.sound('sfx.jack.contact', 'plain', BASE_DURATION_MS.soundJack);
      sink.voice(event.callerId, 'telephone');
      sink.transcript(event.callerId, 'reveal');
      break;

    case 'PLUG_INSERTED':
      sink.lamp(event.destinationId, 'steady', BASE_DURATION_MS.lampSteady, 'static');
      sink.sound('sfx.jack.contact', 'plain', BASE_DURATION_MS.soundJack);
      sink.haptic(hapticPattern(intensity));
      break;

    case 'PLUG_REMOVED':
      sink.lamp(event.destinationId, 'extinguish', BASE_DURATION_MS.lampExtinguish, 'static');
      sink.sound('sfx.cord.pull', 'plain', BASE_DURATION_MS.soundCord);
      break;

    case 'ROUTE_CONFIRMED':
      sink.lamp(event.destinationId, 'steady', BASE_DURATION_MS.lampSteady, 'static');
      sink.sound('sfx.relay.click', 'plain', BASE_DURATION_MS.soundRelay);
      sink.environment('ritual-reveal', 'static');
      sink.transcript(event.callerId, 'restore');
      break;

    case 'ROUTE_REJECTED':
      sink.lamp(event.destinationId, 'flicker', BASE_DURATION_MS.lampFlicker, 'fade');
      sink.sound('sfx.line.static', 'static', BASE_DURATION_MS.soundStatic);
      sink.environment('voltage-drop', 'static');
      sink.transcript(event.callerId, 'corrupt');
      sink.haptic(hapticPattern(intensity));
      if (intensity === 3) {
        // The exchange only shoves the camera once a caller has been refused
        // three times. Reduced motion drops it entirely rather than faking it.
        sink.camera('jolt', 'none');
      }
      break;

    case 'CALL_BLEED_STARTED':
      sink.lamp(event.affectedCallerId, 'flicker', BASE_DURATION_MS.lampFlicker, 'fade');
      sink.sound('sfx.line.hum', 'line-hum', BASE_DURATION_MS.soundHum);
      sink.voice(event.affectedCallerId, 'crossed-line');
      sink.transcript(event.affectedCallerId, 'overwrite');
      sink.environment('shadow', 'fade');
      break;

    case 'CLUE_REVEALED':
      sink.transcript(event.clueId, 'reveal');
      sink.sound('sfx.ticket.stamp', 'plain', BASE_DURATION_MS.soundStamp);
      break;

    case 'LINE_POSSESSED':
      sink.lamp(event.lineId, 'flicker', BASE_DURATION_MS.lampFlicker, 'fade');
      sink.sound('sfx.line.reverse', 'reverse-tail', BASE_DURATION_MS.soundReverse);
      sink.voice(event.lineId, 'possessed');
      sink.environment('smoke', 'fade');
      sink.camera('jolt', 'none');
      break;

    case 'FINALE_UNLOCKED':
      sink.lamp(event.lineId, 'ring', BASE_DURATION_MS.lampRing, 'static');
      sink.sound('sfx.bell.thirteen', 'plain', BASE_DURATION_MS.soundBellThirteen);
      sink.environment('ritual-reveal', 'static');
      sink.transcript(event.lineId, 'reveal');
      sink.camera('pull-back', 'fade');
      break;

    case 'ENDING_SELECTED': {
      const effect = options.endingEffects?.[event.endingId] ?? 'connect';
      sink.ending(event.endingId, effect);
      sink.sound('sfx.exchange.close', 'plain', BASE_DURATION_MS.soundClose);
      sink.environment('ritual-reveal', 'static');
      sink.transcript(event.endingId, 'reveal');
      sink.camera('pull-back', 'fade');
      break;
    }
  }

  return { state: nextState, cues: sink.collected() };
}

/**
 * Map a whole event log. Replaying the same log always produces the same cues
 * and the same final state, which is requirement R5.3.
 */
export function mapEvents(
  events: readonly GameEvent[],
  state: HauntingState = INITIAL_HAUNTING_STATE,
  options: CueMappingOptions = {},
): CueMappingResult {
  let current = state;
  const cues: HauntCue[] = [];
  for (const event of events) {
    const step = mapEvent(event, current, options);
    current = step.state;
    cues.push(...step.cues);
  }
  return { state: current, cues };
}

const AUDIBLE_CHANNELS: ReadonlySet<HauntCue['channel']> = new Set<HauntCue['channel']>([
  'sound',
  'voice-filter',
]);

const VISUAL_CHANNELS: ReadonlySet<HauntCue['channel']> = new Set<HauntCue['channel']>([
  'lamp',
  'transcript',
  'environment',
  'ending-transition',
]);

export function isAudibleCue(cue: HauntCue): boolean {
  return AUDIBLE_CHANNELS.has(cue.channel);
}

export function isVisualCue(cue: HauntCue): boolean {
  return VISUAL_CHANNELS.has(cue.channel);
}

/**
 * R7.2 as a checkable predicate: a batch that makes a sound must also show
 * something. The UI can assert this in development; the tests assert it for
 * every event type in the contract.
 */
export function hasVisualEquivalent(cues: readonly HauntCue[]): boolean {
  return !cues.some(isAudibleCue) || cues.some(isVisualCue);
}
