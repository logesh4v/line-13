import type { EntityId, SoundCue, VoiceFilterCue } from '../contracts.ts';
import type {
  AudioAdapterState,
  CuePlaybackResult,
  HauntingAudioAdapter,
  UnlockResult,
} from './types.ts';

/**
 * The adapter used when there is no audio pipeline at all.
 *
 * It succeeds at unlocking and then reports `fallback` for every cue, which
 * tells the UI to render each cue's silent alternative. This is the path a
 * judge takes on a device with no Web Audio and no media support, and the game
 * must remain completable on it (R7.4, R9.4).
 */
export function createSilentAudioAdapter(): HauntingAudioAdapter {
  let unlocked = false;
  let muted = false;
  let disposed = false;

  const result = (cueId: EntityId): CuePlaybackResult =>
    disposed
      ? { outcome: 'fallback', cueId, reason: 'disposed' }
      : !unlocked
        ? { outcome: 'locked', cueId }
        : muted
          ? { outcome: 'muted', cueId }
          : { outcome: 'fallback', cueId, reason: 'unsupported' };

  return {
    getState: (): AudioAdapterState => ({
      kind: 'silent',
      unlocked,
      muted,
      disposed,
      activeVoices: 0,
    }),
    unlock: async (): Promise<UnlockResult> => {
      if (disposed) {
        return { ok: false, reason: 'disposed' };
      }
      unlocked = true;
      return { ok: true, kind: 'silent' };
    },
    setMuted: (next: boolean): void => {
      muted = next;
    },
    play: async (cue: SoundCue): Promise<CuePlaybackResult> => result(cue.id),
    speak: async (cue: VoiceFilterCue): Promise<CuePlaybackResult> => result(cue.id),
    stopAll: (): void => {},
    dispose: async (): Promise<void> => {
      disposed = true;
      unlocked = false;
    },
  };
}
