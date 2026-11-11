import {
  INITIAL_HAUNTING_STATE,
  isAudibleCue,
  mapEvent,
  resolveCues,
} from '@line-13/haunting';
import type {
  CuePresentation,
  HauntingSettings,
  HauntingState,
} from '@line-13/haunting';
import type { EpisodeManifestV1, GameEvent, HauntCue } from '../contracts.ts';
import { ENDING_EFFECTS } from '../game/endings.ts';
import type { ExchangeSettings } from '../settings/settings.ts';

/** Caption for LINE 13's possessed voice; its exact words are in the readout. */
export const LINE_13_CAPTION = 'Line 13 speaks through the crossed lines.';

export type MotionTreatment = 'full' | 'fade' | 'static' | 'none';

export interface ResolvedCue {
  readonly cue: HauntCue;
  readonly eventSequence: number;
  readonly startedAtMs: number;
  readonly expiresAtMs: number;
  readonly audible: boolean;
  readonly motion: MotionTreatment;
  readonly caption: string | null;
  readonly visualSignal: boolean;
}

function presentationSettings(settings: ExchangeSettings): HauntingSettings {
  return {
    muted: settings.muted,
    audioAvailable: true,
    reducedMotion: settings.reducedMotion,
    subtitles: settings.subtitles,
    highContrast: settings.highContrast,
  };
}

function exactCaption(episode: EpisodeManifestV1, cue: HauntCue): string | null {
  if (cue.channel === 'voice-filter') {
    if (cue.targetId === 'line-13') {
      return LINE_13_CAPTION;
    }
    const caller = episode.callers.find((candidate) => candidate.id === cue.targetId);
    if (caller === undefined) {
      return null;
    }
    const asset =
      caller.voiceAssetId === undefined
        ? undefined
        : episode.assets.find((candidate) => candidate.id === caller.voiceAssetId);
    return asset?.kind === 'audio' ? asset.transcript : caller.subtitle;
  }

  if (cue.channel === 'sound') {
    const asset = episode.assets.find((candidate) => candidate.id === cue.assetId);
    return asset?.kind === 'audio' ? asset.transcript : null;
  }

  return null;
}

function motionFor(presentation: CuePresentation): MotionTreatment {
  if (presentation.mode === 'reduced-motion') {
    return presentation.alternative;
  }
  if (presentation.mode === 'suppressed' && presentation.reason === 'reduced-motion') {
    return 'none';
  }
  return 'full';
}

function toResolved(
  episode: EpisodeManifestV1,
  event: GameEvent,
  presentation: CuePresentation,
  startedAtMs: number,
): ResolvedCue {
  const silentCaption =
    presentation.mode === 'silent' && presentation.alternative === 'caption'
      ? exactCaption(episode, presentation.cue)
      : null;

  return {
    cue: presentation.cue,
    eventSequence: event.sequence,
    startedAtMs,
    expiresAtMs: startedAtMs + presentation.cue.durationMs,
    audible: presentation.mode === 'as-authored' && isAudibleCue(presentation.cue),
    motion: motionFor(presentation),
    caption: silentCaption,
    visualSignal:
      presentation.mode === 'silent' && presentation.alternative === 'visual-signal',
  };
}

function resolveMappedEvent(
  episode: EpisodeManifestV1,
  event: GameEvent,
  state: HauntingState,
  settings: ExchangeSettings,
  startedAtMs: number,
): { readonly state: HauntingState; readonly cues: readonly ResolvedCue[] } {
  const mapped = mapEvent(event, state, { endingEffects: ENDING_EFFECTS });
  const presentations = resolveCues(mapped.cues, presentationSettings(settings));
  return {
    state: mapped.state,
    cues: presentations.map((presentation) =>
      toResolved(episode, event, presentation, startedAtMs),
    ),
  };
}

/** Resolve one event from a clean haunting state, useful for isolated previews. */
export function cuesForEvent(
  episode: EpisodeManifestV1,
  event: GameEvent,
  settings: ExchangeSettings,
  nowMs: number,
): readonly ResolvedCue[] {
  return resolveMappedEvent(
    episode,
    event,
    INITIAL_HAUNTING_STATE,
    settings,
    nowMs,
  ).cues;
}

/**
 * Resolve a complete event log in order so rejection pressure, possession, and
 * finale intensity are derived from the same deterministic history as replay.
 */
export function cuesForEvents(
  episode: EpisodeManifestV1,
  events: readonly GameEvent[],
  settings: ExchangeSettings,
  startedAtOverrideMs?: number,
): readonly ResolvedCue[] {
  let hauntingState = INITIAL_HAUNTING_STATE;
  const resolved: ResolvedCue[] = [];

  for (const event of events) {
    const step = resolveMappedEvent(
      episode,
      event,
      hauntingState,
      settings,
      startedAtOverrideMs ?? event.timestampOffsetMs,
    );
    hauntingState = step.state;
    resolved.push(...step.cues);
  }

  return resolved;
}

export function activeCues(
  cues: readonly ResolvedCue[],
  nowMs: number,
): readonly ResolvedCue[] {
  return cues.filter((resolved) => resolved.expiresAtMs > nowMs);
}

export function strongestOnChannel(
  cues: readonly ResolvedCue[],
  channel: HauntCue['channel'],
): ResolvedCue | null {
  let strongest: ResolvedCue | null = null;
  for (const resolved of cues) {
    if (resolved.cue.channel !== channel) {
      continue;
    }
    if (strongest === null || resolved.cue.intensity >= strongest.cue.intensity) {
      strongest = resolved;
    }
  }
  return strongest;
}

export function silentCaptions(cues: readonly ResolvedCue[]): readonly string[] {
  const captions: string[] = [];
  for (const resolved of cues) {
    if (resolved.caption !== null && !captions.includes(resolved.caption)) {
      captions.push(resolved.caption);
    }
  }
  return captions;
}
