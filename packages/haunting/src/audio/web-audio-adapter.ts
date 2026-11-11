import type { EntityId, SoundCue, VoiceFilterCue } from '../contracts.ts';
import { isOriginalSoundAsset } from '../sound-assets.ts';
import { renderOriginalSound, type SynthVoice } from './synth.ts';
import type {
  AudioAdapterState,
  AudioAssetLoader,
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  CuePlaybackResult,
  GainNodeLike,
  HauntingAudioAdapter,
  UnlockResult,
} from './types.ts';

export interface WebAudioAdapterDeps {
  /**
   * Creates the platform audio context. Called on `unlock()` and never before,
   * so no context exists until the player has interacted.
   */
  readonly createContext: () => AudioContextLike;
  /**
   * Loads immutable published speech (Amazon Polly) by manifest asset id.
   * Omit it and only the exchange's own synthesized effects will play; speech
   * cues then report `fallback`, and the UI shows the exact subtitle instead.
   */
  readonly loadAsset?: AudioAssetLoader;
  /** Master trim, 0..1. Defaults to 0.9 to leave headroom for layered cues. */
  readonly masterGain?: number;
}

interface VoiceFilterShape {
  readonly filterType: 'lowpass' | 'highpass' | 'bandpass';
  readonly frequency: number;
  readonly q: number;
  readonly playbackRate: number;
  readonly gain: number;
}

/**
 * Processing applied to a published voice asset. The asset itself is immutable;
 * the haunting only ever changes how it is heard, which is what keeps a Polly
 * line reusable across every cue that needs it.
 */
const VOICE_SHAPES: Readonly<Record<VoiceFilterCue['effect'], VoiceFilterShape>> = {
  // Carbon-microphone band. The ordinary sound of this exchange.
  telephone: { filterType: 'bandpass', frequency: 1700, q: 0.9, playbackRate: 1, gain: 1 },
  // Two pairs touching: thinner, quieter, slightly fast.
  'crossed-line': {
    filterType: 'bandpass',
    frequency: 2300,
    q: 1.6,
    playbackRate: 1.02,
    gain: 0.75,
  },
  // Somebody speaking from the far side of the room they died in.
  'distant-room': {
    filterType: 'lowpass',
    frequency: 900,
    q: 0.8,
    playbackRate: 0.99,
    gain: 0.6,
  },
  // Line 13 answering in a voice the operator recognises.
  possessed: { filterType: 'lowpass', frequency: 1200, q: 2.2, playbackRate: 0.93, gain: 0.95 },
};

/**
 * Web Audio implementation of the haunting audio surface.
 *
 * Contracts it holds to:
 * - nothing sounds before `unlock()` is called from a player gesture;
 * - every voice has an explicit stop time, so no cue outlives its scene;
 * - a missing or undecodable asset resolves to `fallback`, never an exception;
 * - `dispose()` releases the context and every node it created.
 */
export function createWebAudioAdapter(deps: WebAudioAdapterDeps): HauntingAudioAdapter {
  let context: AudioContextLike | null = null;
  let master: GainNodeLike | null = null;
  let unlocked = false;
  let muted = false;
  let disposed = false;

  const voices = new Set<SynthVoice>();
  const decoded = new Map<string, AudioBufferLike>();
  const masterLevel = deps.masterGain ?? 0.9;

  const getState = (): AudioAdapterState => ({
    kind: 'web-audio',
    unlocked,
    muted,
    disposed,
    activeVoices: voices.size,
  });

  const track = (voice: SynthVoice): SynthVoice => {
    voices.add(voice);
    return voice;
  };

  const stopAll = (): void => {
    for (const voice of voices) {
      voice.stop();
    }
    voices.clear();
  };

  const unlock = async (): Promise<UnlockResult> => {
    if (disposed) {
      return { ok: false, reason: 'disposed' };
    }
    if (unlocked && context !== null) {
      return { ok: true, kind: 'web-audio' };
    }
    try {
      const created = deps.createContext();
      await created.resume();
      const gain = created.createGain();
      gain.gain.value = muted ? 0 : masterLevel;
      gain.connect(created.destination);
      context = created;
      master = gain;
      unlocked = true;
      return { ok: true, kind: 'web-audio' };
    } catch {
      context = null;
      master = null;
      unlocked = false;
      return { ok: false, reason: 'unsupported' };
    }
  };

  const setMuted = (next: boolean): void => {
    muted = next;
    if (master !== null && context !== null) {
      master.gain.setValueAtTime(next ? 0 : masterLevel, context.currentTime);
    }
    if (next) {
      // Silence means silence now, not after the current tail finishes.
      stopAll();
    }
  };

  const gate = (cueId: EntityId): CuePlaybackResult | null => {
    if (disposed) {
      return { outcome: 'fallback', cueId, reason: 'disposed' };
    }
    if (!unlocked || context === null || master === null) {
      return { outcome: 'locked', cueId };
    }
    if (muted) {
      return { outcome: 'muted', cueId };
    }
    return null;
  };

  const loadBuffer = async (
    activeContext: AudioContextLike,
    assetId: EntityId,
  ): Promise<AudioBufferLike | 'asset-missing' | 'decode-failed'> => {
    const cached = decoded.get(assetId);
    if (cached !== undefined) {
      return cached;
    }
    if (deps.loadAsset === undefined) {
      return 'asset-missing';
    }
    let raw: ArrayBuffer | null;
    try {
      raw = await deps.loadAsset(assetId);
    } catch {
      return 'asset-missing';
    }
    if (raw === null) {
      return 'asset-missing';
    }
    try {
      const buffer = await activeContext.decodeAudioData(raw);
      decoded.set(assetId, buffer);
      return buffer;
    } catch {
      return 'decode-failed';
    }
  };

  const playBuffer = (
    activeContext: AudioContextLike,
    output: AudioNodeLike,
    buffer: AudioBufferLike,
    shape: VoiceFilterShape | null,
  ): SynthVoice => {
    const start = activeContext.currentTime;
    const gain = activeContext.createGain();
    gain.gain.value = shape?.gain ?? 1;
    gain.connect(output);

    let sink: AudioNodeLike = gain;
    if (shape !== null) {
      const filter = activeContext.createBiquadFilter();
      filter.type = shape.filterType;
      filter.frequency.value = shape.frequency;
      filter.Q.value = shape.q;
      filter.connect(gain);
      sink = filter;
    }

    const source = activeContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = shape?.playbackRate ?? 1;
    source.connect(sink);
    source.start(start);
    source.stop(start + buffer.duration);

    let stopped = false;
    return {
      stop: () => {
        if (stopped) {
          return;
        }
        stopped = true;
        source.stop(activeContext.currentTime);
        source.disconnect();
        gain.disconnect();
      },
    };
  };

  const play = async (cue: SoundCue): Promise<CuePlaybackResult> => {
    const blocked = gate(cue.id);
    if (blocked !== null) {
      return blocked;
    }
    const activeContext = context as AudioContextLike;
    const output = master as GainNodeLike;

    if (isOriginalSoundAsset(cue.assetId)) {
      track(
        renderOriginalSound(activeContext, output, {
          assetId: cue.assetId,
          durationMs: cue.durationMs,
          intensity: cue.intensity,
          effect: cue.effect,
          seed: cue.id,
        }),
      );
      return {
        outcome: 'played',
        cueId: cue.id,
        kind: 'web-audio',
        durationMs: cue.durationMs,
      };
    }

    const buffer = await loadBuffer(activeContext, cue.assetId);
    if (buffer === 'asset-missing' || buffer === 'decode-failed') {
      return { outcome: 'fallback', cueId: cue.id, reason: buffer };
    }
    if (disposed || muted) {
      return disposed
        ? { outcome: 'fallback', cueId: cue.id, reason: 'disposed' }
        : { outcome: 'muted', cueId: cue.id };
    }
    track(playBuffer(activeContext, output, buffer, null));
    return {
      outcome: 'played',
      cueId: cue.id,
      kind: 'web-audio',
      durationMs: Math.round(buffer.duration * 1000),
    };
  };

  const speak = async (
    cue: VoiceFilterCue,
    assetId: EntityId,
  ): Promise<CuePlaybackResult> => {
    const blocked = gate(cue.id);
    if (blocked !== null) {
      return blocked;
    }
    const activeContext = context as AudioContextLike;
    const output = master as GainNodeLike;

    const buffer = await loadBuffer(activeContext, assetId);
    if (buffer === 'asset-missing' || buffer === 'decode-failed') {
      return { outcome: 'fallback', cueId: cue.id, reason: buffer };
    }
    if (disposed || muted) {
      return disposed
        ? { outcome: 'fallback', cueId: cue.id, reason: 'disposed' }
        : { outcome: 'muted', cueId: cue.id };
    }
    track(playBuffer(activeContext, output, buffer, VOICE_SHAPES[cue.effect]));
    return {
      outcome: 'played',
      cueId: cue.id,
      kind: 'web-audio',
      durationMs: Math.round(buffer.duration * 1000),
    };
  };

  const dispose = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    disposed = true;
    stopAll();
    decoded.clear();
    if (master !== null) {
      master.disconnect();
      master = null;
    }
    if (context !== null) {
      try {
        await context.close();
      } catch {
        // A context that refuses to close is already unusable; the adapter is
        // marked disposed either way so no cue can reach it again.
      }
      context = null;
    }
    unlocked = false;
  };

  return { getState, unlock, setMuted, play, speak, stopAll, dispose };
}
