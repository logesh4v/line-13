import {
  createHauntingAudio,
  type AudioContextLike,
  type HauntingAudioAdapter,
} from '@line-13/haunting';
import type { SoundCue } from '../contracts.ts';
import voiceManifest from '../../public/audio/voices/manifest.json' with { type: 'json' };
import { parseVoiceManifest, voiceFileFor } from './voices.ts';

/** Browser edge around the reviewed `@line-13/haunting` audio adapter. */
export interface ExchangeAudio {
  isAvailable(): boolean;
  unlock(): void;
  setMuted(muted: boolean): void;
  play(cue: SoundCue): void;
  /** Speak a caption with its Polly file if one exists; silent (caption only) otherwise. */
  speak(caption: string): void;
  dispose(): void;
}

const VOICE_DIR = 'audio/voices/';

type ContextFactory = new () => AudioContext;

function contextFactory(): ContextFactory | null {
  return typeof AudioContext === 'undefined' ? null : AudioContext;
}

function createAdapter(factory: ContextFactory | null): HauntingAudioAdapter {
  return createHauntingAudio(
    factory === null
      ? {}
      : {
          webAudio: {
            createContext: () => new factory() as unknown as AudioContextLike,
            masterGain: 0.78,
          },
        },
  );
}

export function createExchangeAudio(): ExchangeAudio {
  const factory = contextFactory();
  const adapter = createAdapter(factory);
  let disposed = false;
  let muted = false;
  const voices = parseVoiceManifest(voiceManifest);
  let current: HTMLAudioElement | null = null;

  const stopVoice = (): void => {
    current?.pause();
    current = null;
  };

  return {
    isAvailable(): boolean {
      return factory !== null && !disposed;
    },

    unlock(): void {
      void adapter.unlock();
    },

    setMuted(next: boolean): void {
      muted = next;
      if (next) stopVoice();
      adapter.setMuted(next);
    },

    play(cue: SoundCue): void {
      void adapter.play(cue);
    },

    speak(caption: string): void {
      if (muted || disposed || typeof Audio === 'undefined') return;
      const file = voiceFileFor(voices, caption);
      if (file === null) return;
      stopVoice();
      const element = new Audio(`${VOICE_DIR}${file}`);
      element.volume = 0.9;
      current = element;
      // A blocked or failed play is not an error: the caption is already on screen.
      element.play().catch(() => undefined);
    },

    dispose(): void {
      disposed = true;
      stopVoice();
      void adapter.dispose();
    },
  };
}
