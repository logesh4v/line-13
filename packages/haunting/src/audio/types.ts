import type { EntityId, SoundCue, VoiceFilterCue } from '../contracts.ts';

/**
 * Structural subset of the Web Audio API this package actually touches.
 *
 * Declared locally rather than pulled from the DOM lib so the package compiles
 * with `"lib": ["ES2022"]` and so the adapter can be driven by a plain object
 * in a Node test. Nothing here widens the real API; it only narrows it.
 */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): unknown;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  start(when: number): unknown;
  stop(when: number): unknown;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

export interface AudioBufferLike {
  readonly duration: number;
  readonly length: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  readonly playbackRate: AudioParamLike;
  start(when: number): unknown;
  stop(when: number): unknown;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: 'suspended' | 'running' | 'closed';
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** Minimal `HTMLAudioElement` surface used by the plain-audio fallback. */
export interface PlainAudioElementLike {
  volume: number;
  muted: boolean;
  play(): Promise<void>;
  pause(): unknown;
}

export type AudioAdapterKind = 'web-audio' | 'plain-audio' | 'silent';

export interface AudioAdapterState {
  readonly kind: AudioAdapterKind;
  /**
   * False until an explicit player gesture called `unlock()`. Nothing is ever
   * played before this flips, which is how the game avoids relying on autoplay
   * (R7.1).
   */
  readonly unlocked: boolean;
  readonly muted: boolean;
  readonly disposed: boolean;
  readonly activeVoices: number;
}

export type AudioFallbackReason =
  | 'unsupported'
  | 'asset-missing'
  | 'decode-failed'
  | 'playback-failed'
  | 'disposed';

/**
 * Outcome of asking the adapter for a cue.
 *
 * Every non-`played` outcome is a signal to the UI that it must show this cue's
 * silent alternative. The adapter never throws for a missing or broken asset,
 * because a voice that will not load must not stop the game (R7.4, R5.4).
 */
export type CuePlaybackResult =
  | {
      readonly outcome: 'played';
      readonly cueId: EntityId;
      readonly kind: AudioAdapterKind;
      readonly durationMs: number;
    }
  | { readonly outcome: 'locked'; readonly cueId: EntityId }
  | { readonly outcome: 'muted'; readonly cueId: EntityId }
  | {
      readonly outcome: 'fallback';
      readonly cueId: EntityId;
      readonly reason: AudioFallbackReason;
    };

export type UnlockResult =
  | { readonly ok: true; readonly kind: AudioAdapterKind }
  | { readonly ok: false; readonly reason: AudioFallbackReason };

/**
 * The audio surface the UI talks to.
 *
 * `play` takes a `SoundCue` (the exchange's own effects, synthesized here).
 * `speak` takes a `VoiceFilterCue` plus the manifest asset id to render through
 * it, so the caller-to-asset mapping stays with the manifest owner and the
 * audio layer never looks episode content up for itself.
 */
export interface HauntingAudioAdapter {
  getState(): AudioAdapterState;
  /** Must be called from an explicit player interaction handler. */
  unlock(): Promise<UnlockResult>;
  setMuted(muted: boolean): void;
  play(cue: SoundCue): Promise<CuePlaybackResult>;
  speak(cue: VoiceFilterCue, assetId: EntityId): Promise<CuePlaybackResult>;
  /** Cut every sounding voice now. Used on scene change and on mute. */
  stopAll(): void;
  dispose(): Promise<void>;
}

/** Loader for immutable published audio (Amazon Polly caller speech). */
export type AudioAssetLoader = (assetId: EntityId) => Promise<ArrayBuffer | null>;
