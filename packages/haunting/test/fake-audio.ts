import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
  PlainAudioElementLike,
} from '../src/audio/types.ts';

/**
 * In-memory stand-in for a Web Audio context.
 *
 * It records what the adapter asked for so the tests can assert on real
 * behaviour (nodes started, nodes stopped, context closed) instead of on
 * whether a function returned without throwing.
 */
export interface FakeAudioLog {
  started: number;
  stopped: number;
  disconnected: number;
  resumed: number;
  closed: number;
  decoded: number;
  buffersCreated: number;
}

export interface FakeAudioContext extends AudioContextLike {
  readonly log: FakeAudioLog;
  advance(seconds: number): void;
}

export interface FakeContextOptions {
  readonly resumeRejects?: boolean;
  readonly decodeRejects?: boolean;
  readonly decodedDurationSeconds?: number;
  readonly sampleRate?: number;
}

function createParam(): AudioParamLike {
  return {
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
  };
}

export function createFakeAudioContext(
  options: FakeContextOptions = {},
): FakeAudioContext {
  const log: FakeAudioLog = {
    started: 0,
    stopped: 0,
    disconnected: 0,
    resumed: 0,
    closed: 0,
    decoded: 0,
    buffersCreated: 0,
  };
  let currentTime = 0;
  let state: 'suspended' | 'running' | 'closed' = 'suspended';
  const sampleRate = options.sampleRate ?? 8000;

  const node = (): AudioNodeLike => ({
    connect: () => undefined,
    disconnect: () => {
      log.disconnected += 1;
    },
  });

  const context: FakeAudioContext = {
    log,
    get currentTime() {
      return currentTime;
    },
    sampleRate,
    get state() {
      return state;
    },
    destination: node(),
    createGain: (): GainNodeLike => ({ ...node(), gain: createParam() }),
    createOscillator: (): OscillatorNodeLike => ({
      ...node(),
      type: 'sine',
      frequency: createParam(),
      start: () => {
        log.started += 1;
      },
      stop: () => {
        log.stopped += 1;
      },
    }),
    createBiquadFilter: (): BiquadFilterNodeLike => ({
      ...node(),
      type: 'lowpass',
      frequency: createParam(),
      Q: createParam(),
    }),
    createBufferSource: (): AudioBufferSourceNodeLike => ({
      ...node(),
      buffer: null,
      playbackRate: createParam(),
      start: () => {
        log.started += 1;
      },
      stop: () => {
        log.stopped += 1;
      },
    }),
    createBuffer: (channels, length, rate): AudioBufferLike => {
      log.buffersCreated += 1;
      const data = new Float32Array(length);
      return {
        duration: length / rate,
        length,
        numberOfChannels: channels,
        getChannelData: () => data,
      };
    },
    decodeAudioData: async (): Promise<AudioBufferLike> => {
      log.decoded += 1;
      if (options.decodeRejects === true) {
        throw new Error('decode failed');
      }
      const seconds = options.decodedDurationSeconds ?? 1.5;
      const length = Math.round(seconds * sampleRate);
      const data = new Float32Array(length);
      return {
        duration: seconds,
        length,
        numberOfChannels: 1,
        getChannelData: () => data,
      };
    },
    resume: async (): Promise<void> => {
      log.resumed += 1;
      if (options.resumeRejects === true) {
        throw new Error('autoplay blocked');
      }
      state = 'running';
    },
    close: async (): Promise<void> => {
      log.closed += 1;
      state = 'closed';
    },
    advance: (seconds: number) => {
      currentTime += seconds;
    },
  };

  return context;
}

export interface FakeAudioElement extends PlainAudioElementLike {
  readonly plays: () => number;
  readonly pauses: () => number;
}

export function createFakeAudioElement(
  playRejects = false,
): FakeAudioElement {
  let plays = 0;
  let pauses = 0;
  return {
    volume: 1,
    muted: false,
    play: async (): Promise<void> => {
      plays += 1;
      if (playRejects) {
        throw new Error('play blocked');
      }
    },
    pause: () => {
      pauses += 1;
    },
    plays: () => plays,
    pauses: () => pauses,
  };
}
