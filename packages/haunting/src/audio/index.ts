import type { EntityId, SoundCue, VoiceFilterCue } from '../contracts.ts';
import {
  createPlainAudioAdapter,
  type PlainAudioAdapterDeps,
} from './plain-audio-adapter.ts';
import { createSilentAudioAdapter } from './silent-adapter.ts';
import type {
  AudioAdapterState,
  CuePlaybackResult,
  HauntingAudioAdapter,
  UnlockResult,
} from './types.ts';
import { createWebAudioAdapter, type WebAudioAdapterDeps } from './web-audio-adapter.ts';

export interface HauntingAudioOptions {
  /** Web Audio path. Omit on a host that has no audio context at all. */
  readonly webAudio?: WebAudioAdapterDeps;
  /** Media-element path, used when the Web Audio graph will not start. */
  readonly plainAudio?: PlainAudioAdapterDeps;
}

/**
 * Audio entry point. Picks the best pipeline the device actually supports, at
 * unlock time rather than at construction time, because whether a Web Audio
 * context will start is only knowable once a player gesture tries it.
 *
 * Order: Web Audio, then plain media elements, then silence. Each step down
 * loses fidelity and never loses playability: a cue the chosen pipeline cannot
 * render reports `fallback`, and the UI shows that cue's silent alternative.
 */
export function createHauntingAudio(
  options: HauntingAudioOptions,
): HauntingAudioAdapter {
  let delegate: HauntingAudioAdapter | null = null;
  let muted = false;
  let disposed = false;

  const unlock = async (): Promise<UnlockResult> => {
    if (disposed) {
      return { ok: false, reason: 'disposed' };
    }
    if (delegate !== null) {
      return delegate.unlock();
    }

    if (options.webAudio !== undefined) {
      const candidate = createWebAudioAdapter(options.webAudio);
      candidate.setMuted(muted);
      const result = await candidate.unlock();
      if (result.ok) {
        delegate = candidate;
        return result;
      }
      await candidate.dispose();
    }

    if (options.plainAudio !== undefined) {
      const candidate = createPlainAudioAdapter(options.plainAudio);
      candidate.setMuted(muted);
      const result = await candidate.unlock();
      if (result.ok) {
        delegate = candidate;
        return result;
      }
      await candidate.dispose();
    }

    const silent = createSilentAudioAdapter();
    silent.setMuted(muted);
    delegate = silent;
    return silent.unlock();
  };

  const locked = (cueId: EntityId): CuePlaybackResult =>
    disposed
      ? { outcome: 'fallback', cueId, reason: 'disposed' }
      : { outcome: 'locked', cueId };

  return {
    getState: (): AudioAdapterState =>
      delegate?.getState() ?? {
        kind: 'silent',
        unlocked: false,
        muted,
        disposed,
        activeVoices: 0,
      },
    unlock,
    setMuted: (next: boolean): void => {
      muted = next;
      delegate?.setMuted(next);
    },
    play: async (cue: SoundCue): Promise<CuePlaybackResult> =>
      delegate === null ? locked(cue.id) : delegate.play(cue),
    speak: async (cue: VoiceFilterCue, assetId: EntityId): Promise<CuePlaybackResult> =>
      delegate === null ? locked(cue.id) : delegate.speak(cue, assetId),
    stopAll: (): void => {
      delegate?.stopAll();
    },
    dispose: async (): Promise<void> => {
      disposed = true;
      if (delegate !== null) {
        await delegate.dispose();
      }
    },
  };
}

export { createPlainAudioAdapter, type PlainAudioAdapterDeps } from './plain-audio-adapter.ts';
export { createSilentAudioAdapter } from './silent-adapter.ts';
export {
  createWebAudioAdapter,
  type WebAudioAdapterDeps,
} from './web-audio-adapter.ts';
export {
  SYNTH_RECIPES,
  missingSynthRecipes,
  renderOriginalSound,
  type SynthOptions,
  type SynthRecipe,
  type SynthVoice,
} from './synth.ts';
export type {
  AudioAdapterKind,
  AudioAdapterState,
  AudioAssetLoader,
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioFallbackReason,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  CuePlaybackResult,
  GainNodeLike,
  HauntingAudioAdapter,
  OscillatorNodeLike,
  PlainAudioElementLike,
  UnlockResult,
} from './types.ts';
