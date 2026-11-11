import type { EntityId, SoundCue, VoiceFilterCue } from '../contracts.ts';
import { isOriginalSoundAsset } from '../sound-assets.ts';
import type {
  AudioAdapterState,
  CuePlaybackResult,
  HauntingAudioAdapter,
  PlainAudioElementLike,
  UnlockResult,
} from './types.ts';

export interface PlainAudioAdapterDeps {
  /**
   * Builds a media element for a published asset id, or returns null when the
   * asset is unknown. The host owns URL construction so this package never
   * holds a media address.
   */
  readonly createElement: (assetId: EntityId) => PlainAudioElementLike | null;
}

/**
 * Fallback for browsers with media playback but no usable Web Audio graph.
 *
 * It can play published speech, because that is a finished file. It cannot play
 * the exchange's own effects, because those exist only as a synthesis graph, so
 * those cues report `fallback` and the UI shows their visual signal instead.
 */
export function createPlainAudioAdapter(
  deps: PlainAudioAdapterDeps,
): HauntingAudioAdapter {
  let unlocked = false;
  let muted = false;
  let disposed = false;
  const active = new Set<PlainAudioElementLike>();

  const stopAll = (): void => {
    for (const element of active) {
      element.pause();
    }
    active.clear();
  };

  const gate = (cueId: EntityId): CuePlaybackResult | null => {
    if (disposed) {
      return { outcome: 'fallback', cueId, reason: 'disposed' };
    }
    if (!unlocked) {
      return { outcome: 'locked', cueId };
    }
    if (muted) {
      return { outcome: 'muted', cueId };
    }
    return null;
  };

  const start = async (
    cueId: EntityId,
    assetId: EntityId,
  ): Promise<CuePlaybackResult> => {
    const element = deps.createElement(assetId);
    if (element === null) {
      return { outcome: 'fallback', cueId, reason: 'asset-missing' };
    }
    element.muted = muted;
    try {
      await element.play();
    } catch {
      return { outcome: 'fallback', cueId, reason: 'playback-failed' };
    }
    active.add(element);
    return { outcome: 'played', cueId, kind: 'plain-audio', durationMs: 0 };
  };

  return {
    getState: (): AudioAdapterState => ({
      kind: 'plain-audio',
      unlocked,
      muted,
      disposed,
      activeVoices: active.size,
    }),
    unlock: async (): Promise<UnlockResult> => {
      if (disposed) {
        return { ok: false, reason: 'disposed' };
      }
      unlocked = true;
      return { ok: true, kind: 'plain-audio' };
    },
    setMuted: (next: boolean): void => {
      muted = next;
      for (const element of active) {
        element.muted = next;
      }
      if (next) {
        stopAll();
      }
    },
    play: async (cue: SoundCue): Promise<CuePlaybackResult> => {
      const blocked = gate(cue.id);
      if (blocked !== null) {
        return blocked;
      }
      if (isOriginalSoundAsset(cue.assetId)) {
        // Synthesis-only effect with no file behind it.
        return { outcome: 'fallback', cueId: cue.id, reason: 'unsupported' };
      }
      return start(cue.id, cue.assetId);
    },
    speak: async (
      cue: VoiceFilterCue,
      assetId: EntityId,
    ): Promise<CuePlaybackResult> => {
      const blocked = gate(cue.id);
      if (blocked !== null) {
        return blocked;
      }
      // The voice filter cannot be applied without a graph; the words still
      // arrive unprocessed and the subtitle still shows.
      return start(cue.id, assetId);
    },
    stopAll,
    dispose: async (): Promise<void> => {
      disposed = true;
      unlocked = false;
      stopAll();
    },
  };
}
