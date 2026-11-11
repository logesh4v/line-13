/**
 * @line-13/haunting — the exchange's declarative haunting layer.
 *
 * Boundary: this package maps typed `GameEvent`s to declarative `HauntCue`s and
 * plays the audio those cues describe. It owns no puzzle truth. It never decides
 * whether a route is legal, which destination a caller wants, or whether an
 * ending is reachable; it only reacts to what the graph engine already decided
 * and reported as an event.
 */

export {
  DEFAULT_HAUNTING_SETTINGS,
  SILENT_HAUNTING_SETTINGS,
  withSettings,
  type HauntingSettings,
} from './settings.ts';

export {
  ESCALATION_THRESHOLDS,
  INITIAL_HAUNTING_STATE,
  PRESSURE_WEIGHTS,
  reduceHauntingLog,
  reduceHauntingState,
  rejectionIntensity,
  rejectionsFor,
  type HauntingState,
  type Intensity,
} from './state.ts';

export {
  cueId,
  hasVisualEquivalent,
  isAudibleCue,
  isVisualCue,
  mapEvent,
  mapEvents,
  type CueMappingOptions,
  type CueMappingResult,
} from './cue-mapper.ts';

export {
  isMotionCue,
  isPerceivable,
  resolveCue,
  resolveCues,
  type CuePresentation,
  type SilenceReason,
} from './resolve.ts';

export {
  resolveSubtitles,
  type MissingSubtitle,
  type SubtitleLine,
  type SubtitleOrigin,
  type SubtitleResolution,
  type SubtitleSource,
} from './subtitles.ts';

export {
  ORIGINAL_SOUND_ASSET_IDS,
  isOriginalSoundAsset,
  type OriginalSoundAssetId,
} from './sound-assets.ts';

export {
  createHauntingEngine,
  playFrame,
  type FramePlaybackResult,
  type HauntingEngine,
  type HauntingEngineOptions,
  type HauntingFrame,
} from './engine.ts';

export {
  SYNTH_RECIPES,
  createHauntingAudio,
  createPlainAudioAdapter,
  createSilentAudioAdapter,
  createWebAudioAdapter,
  missingSynthRecipes,
  renderOriginalSound,
  type AudioAdapterKind,
  type AudioAdapterState,
  type AudioAssetLoader,
  type AudioBufferLike,
  type AudioBufferSourceNodeLike,
  type AudioContextLike,
  type AudioFallbackReason,
  type AudioNodeLike,
  type AudioParamLike,
  type BiquadFilterNodeLike,
  type CuePlaybackResult,
  type GainNodeLike,
  type HauntingAudioAdapter,
  type HauntingAudioOptions,
  type OscillatorNodeLike,
  type PlainAudioAdapterDeps,
  type PlainAudioElementLike,
  type SynthOptions,
  type SynthRecipe,
  type SynthVoice,
  type UnlockResult,
  type WebAudioAdapterDeps,
} from './audio/index.ts';
