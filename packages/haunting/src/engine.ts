import type { EntityId, GameEvent, HauntCue } from './contracts.ts';
import {
  mapEvent,
  type CueMappingOptions,
} from './cue-mapper.ts';
import {
  resolveCues,
  type CuePresentation,
} from './resolve.ts';
import {
  DEFAULT_HAUNTING_SETTINGS,
  withSettings,
  type HauntingSettings,
} from './settings.ts';
import { INITIAL_HAUNTING_STATE, type HauntingState } from './state.ts';
import {
  resolveSubtitles,
  type MissingSubtitle,
  type SubtitleLine,
  type SubtitleSource,
} from './subtitles.ts';
import type { CuePlaybackResult, HauntingAudioAdapter } from './audio/types.ts';

/**
 * Everything the UI needs to render one game event, computed in one pass.
 *
 * A frame is data. It contains no timers, no DOM handles, and no promises, so
 * it can be snapshotted in a test, logged for a bug report, or replayed.
 */
export interface HauntingFrame {
  readonly event: GameEvent;
  readonly state: HauntingState;
  readonly cues: readonly HauntCue[];
  /** `cues` with the player's settings applied. Same order as `cues`. */
  readonly presentations: readonly CuePresentation[];
  /** Exact authored subtitle text for every spoken cue in this frame. */
  readonly subtitles: readonly SubtitleLine[];
  /** Spoken cues with no authored text. A content defect, not a blocker. */
  readonly missingSubtitles: readonly MissingSubtitle[];
}

export interface HauntingEngineOptions {
  readonly settings?: HauntingSettings;
  readonly subtitleSource?: SubtitleSource;
  readonly cueMapping?: CueMappingOptions;
  readonly initialState?: HauntingState;
}

const EMPTY_SUBTITLE_SOURCE: SubtitleSource = { callers: [], assets: [] };

export interface HauntingEngine {
  getState(): HauntingState;
  getSettings(): HauntingSettings;
  /** Settings affect presentation only; they never change which cues fire. */
  updateSettings(patch: Partial<HauntingSettings>): HauntingSettings;
  handle(event: GameEvent): HauntingFrame;
  handleAll(events: readonly GameEvent[]): readonly HauntingFrame[];
  reset(): void;
}

/**
 * Stateful wrapper over the pure mapper, for a UI that feeds events in as they
 * happen. The engine holds escalation state and nothing else; feeding the same
 * event log into a fresh engine always reproduces the same frames.
 */
export function createHauntingEngine(
  options: HauntingEngineOptions = {},
): HauntingEngine {
  const initial = options.initialState ?? INITIAL_HAUNTING_STATE;
  const subtitleSource = options.subtitleSource ?? EMPTY_SUBTITLE_SOURCE;
  const cueMapping = options.cueMapping ?? {};

  let state = initial;
  let settings = options.settings ?? DEFAULT_HAUNTING_SETTINGS;

  const handle = (event: GameEvent): HauntingFrame => {
    const mapped = mapEvent(event, state, cueMapping);
    state = mapped.state;
    const subtitles = resolveSubtitles(mapped.cues, subtitleSource);
    return {
      event,
      state: mapped.state,
      cues: mapped.cues,
      presentations: resolveCues(mapped.cues, settings),
      subtitles: subtitles.lines,
      missingSubtitles: subtitles.missing,
    };
  };

  return {
    getState: () => state,
    getSettings: () => settings,
    updateSettings: (patch) => {
      settings = withSettings(settings, patch);
      return settings;
    },
    handle,
    handleAll: (events) => events.map(handle),
    reset: () => {
      state = initial;
    },
  };
}

export interface FramePlaybackResult {
  readonly results: readonly CuePlaybackResult[];
  /**
   * Cues the audio pipeline could not render. The UI must show each of these
   * cues' silent alternative, which is what keeps an audio failure from
   * reading as a missed beat.
   */
  readonly needsSilentAlternative: readonly HauntCue[];
}

/**
 * Hand a frame's audible cues to an adapter.
 *
 * Separate from `handle` on purpose: frame construction stays synchronous and
 * testable, and audio stays an effect at the edge that can fail without
 * touching game state (R5.4). Speech needs the manifest asset for a caller, so
 * the host supplies `voiceAssetFor`; returning null means subtitles only.
 */
export async function playFrame(
  adapter: HauntingAudioAdapter,
  frame: HauntingFrame,
  voiceAssetFor: (targetId: EntityId) => EntityId | null = () => null,
): Promise<FramePlaybackResult> {
  const results: CuePlaybackResult[] = [];
  const needsSilentAlternative: HauntCue[] = [];

  for (const presentation of frame.presentations) {
    if (presentation.mode !== 'as-authored') {
      continue;
    }
    const cue = presentation.cue;

    if (cue.channel === 'sound') {
      const result = await adapter.play(cue);
      results.push(result);
      if (result.outcome !== 'played') {
        needsSilentAlternative.push(cue);
      }
      continue;
    }

    if (cue.channel === 'voice-filter') {
      const assetId = voiceAssetFor(cue.targetId);
      if (assetId === null) {
        results.push({ outcome: 'fallback', cueId: cue.id, reason: 'asset-missing' });
        needsSilentAlternative.push(cue);
        continue;
      }
      const result = await adapter.speak(cue, assetId);
      results.push(result);
      if (result.outcome !== 'played') {
        needsSilentAlternative.push(cue);
      }
    }
  }

  return { results, needsSilentAlternative };
}
