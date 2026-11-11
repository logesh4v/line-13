import type { SoundCue } from '../contracts.ts';
import type { Intensity } from '../state.ts';
import {
  ORIGINAL_SOUND_ASSET_IDS,
  type OriginalSoundAssetId,
} from '../sound-assets.ts';
import type { AudioContextLike, AudioNodeLike } from './types.ts';

/**
 * FNV-1a over the cue's seed string. Deterministic across engines, which is
 * what the architecture rule about seeded randomness asks for: the same cue id
 * always produces the same noise, so a recording of one playthrough matches a
 * replay of it.
 */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32. Small, fast, and stable enough for grain noise. */
function createRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SynthFilter {
  readonly type: 'lowpass' | 'highpass' | 'bandpass';
  readonly frequency: number;
  readonly q: number;
}

/**
 * Recipe for one of the exchange's own sounds.
 *
 * Every entry is built from oscillators and seeded noise at runtime. There is
 * no sample, no binary, and no network fetch behind any of this.
 */
export interface SynthRecipe {
  /** Partial frequencies in Hz. Empty for purely noise-based sounds. */
  readonly partials: readonly number[];
  readonly oscillatorType: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** 0 disables the noise layer. */
  readonly noiseLevel: number;
  readonly filter: SynthFilter | null;
  readonly attackMs: number;
  readonly peakGain: number;
}

export const SYNTH_RECIPES: Readonly<Record<OriginalSoundAssetId, SynthRecipe>> = {
  // Two struck partials a fifth apart: a switchboard bell, not a doorbell.
  'sfx.bell.ring': {
    partials: [622, 933, 1866],
    oscillatorType: 'sine',
    noiseLevel: 0.02,
    filter: { type: 'lowpass', frequency: 4200, q: 0.7 },
    attackMs: 6,
    peakGain: 0.32,
  },
  // Line 13's bell sits lower and rings longer than any working line.
  'sfx.bell.thirteen': {
    partials: [311, 466, 933],
    oscillatorType: 'sine',
    noiseLevel: 0.04,
    filter: { type: 'lowpass', frequency: 2600, q: 0.9 },
    attackMs: 14,
    peakGain: 0.36,
  },
  // Brass tip meeting a jack: a short bright knock plus contact grit.
  'sfx.jack.contact': {
    partials: [1480, 2210],
    oscillatorType: 'triangle',
    noiseLevel: 0.5,
    filter: { type: 'bandpass', frequency: 1900, q: 1.4 },
    attackMs: 2,
    peakGain: 0.26,
  },
  // Cloth cord dragged out of the panel: broadband, dull, no pitch.
  'sfx.cord.pull': {
    partials: [],
    oscillatorType: 'sine',
    noiseLevel: 0.7,
    filter: { type: 'lowpass', frequency: 1100, q: 0.6 },
    attackMs: 10,
    peakGain: 0.2,
  },
  // Relay closing. Almost all transient.
  'sfx.relay.click': {
    partials: [2950],
    oscillatorType: 'square',
    noiseLevel: 0.35,
    filter: { type: 'highpass', frequency: 1400, q: 0.8 },
    attackMs: 1,
    peakGain: 0.22,
  },
  // Dead-air hiss on a crossed pair.
  'sfx.line.static': {
    partials: [],
    oscillatorType: 'sine',
    noiseLevel: 0.85,
    filter: { type: 'bandpass', frequency: 2400, q: 0.9 },
    attackMs: 18,
    peakGain: 0.24,
  },
  // Mains hum under the floor. Finite: tied to its cue's duration, never looped.
  'sfx.line.hum': {
    partials: [50, 100, 150],
    oscillatorType: 'sine',
    noiseLevel: 0.08,
    filter: { type: 'lowpass', frequency: 320, q: 1.2 },
    attackMs: 220,
    peakGain: 0.18,
  },
  // The swell that plays when a line answers backwards.
  'sfx.line.reverse': {
    partials: [196, 294],
    oscillatorType: 'sawtooth',
    noiseLevel: 0.3,
    filter: { type: 'lowpass', frequency: 1800, q: 1.6 },
    attackMs: 40,
    peakGain: 0.22,
  },
  // Routing ticket stamped. Paper and wood, no ring.
  'sfx.ticket.stamp': {
    partials: [320, 640],
    oscillatorType: 'triangle',
    noiseLevel: 0.45,
    filter: { type: 'lowpass', frequency: 1500, q: 0.7 },
    attackMs: 3,
    peakGain: 0.2,
  },
  // The exchange closing for the night.
  'sfx.exchange.close': {
    partials: [87, 131, 174],
    oscillatorType: 'sine',
    noiseLevel: 0.12,
    filter: { type: 'lowpass', frequency: 700, q: 1.1 },
    attackMs: 320,
    peakGain: 0.28,
  },
};

/** Compile-time and runtime guarantee that no catalog id lacks a recipe. */
export function missingSynthRecipes(): readonly string[] {
  return ORIGINAL_SOUND_ASSET_IDS.filter((id) => !(id in SYNTH_RECIPES));
}

export interface SynthVoice {
  /** Stop and release every node of this voice. Idempotent. */
  readonly stop: () => void;
}

export interface SynthOptions {
  readonly assetId: OriginalSoundAssetId;
  readonly durationMs: number;
  readonly intensity: Intensity;
  readonly effect: SoundCue['effect'];
  /** Cue id or any stable string. Identical seeds give identical noise. */
  readonly seed: string;
}

function createNoiseBuffer(
  context: AudioContextLike,
  seconds: number,
  seed: string,
): ReturnType<AudioContextLike['createBuffer']> {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  const random = createRandom(seed);
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = random() * 2 - 1;
  }
  return buffer;
}

/**
 * Build and start one synthesized exchange sound.
 *
 * Interference rises with intensity: a level-3 cue is detuned and opened up,
 * which is how escalation is audible without a second asset. Every voice gets
 * an explicit stop time, so nothing here can leave a tone sounding after its
 * scene ends.
 */
export function renderOriginalSound(
  context: AudioContextLike,
  destination: AudioNodeLike,
  options: SynthOptions,
): SynthVoice {
  const recipe = SYNTH_RECIPES[options.assetId];
  const seconds = Math.max(0.02, options.durationMs / 1000);
  const start = context.currentTime;
  const end = start + seconds;
  const attack = Math.min(recipe.attackMs / 1000, seconds / 2);
  const detune = 1 + (options.intensity - 1) * 0.012;
  const peak = recipe.peakGain * (options.effect === 'line-hum' ? 0.8 : 1);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, start);
  if (options.effect === 'reverse-tail') {
    // A reversed tail swells into its own cut-off instead of decaying.
    envelope.gain.linearRampToValueAtTime(peak, end - attack);
    envelope.gain.linearRampToValueAtTime(0, end);
  } else {
    envelope.gain.linearRampToValueAtTime(peak, start + attack);
    envelope.gain.linearRampToValueAtTime(0, end);
  }

  let sink: AudioNodeLike = envelope;
  if (recipe.filter !== null) {
    const filter = context.createBiquadFilter();
    filter.type = recipe.filter.type;
    // Static and higher intensities open the filter: more grit, same asset.
    const openness = options.effect === 'static' ? 1.4 : 1 + (options.intensity - 1) * 0.2;
    filter.frequency.value = recipe.filter.frequency * openness;
    filter.Q.value = recipe.filter.q;
    filter.connect(envelope);
    sink = filter;
  }
  envelope.connect(destination);

  const oscillators = recipe.partials.map((frequency, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = recipe.oscillatorType;
    oscillator.frequency.value = frequency * (index === 0 ? 1 : detune);
    oscillator.connect(sink);
    oscillator.start(start);
    oscillator.stop(end);
    return oscillator;
  });

  const noiseSources: AudioBufferSourceNodeHandle[] = [];
  if (recipe.noiseLevel > 0) {
    const noiseGain = context.createGain();
    noiseGain.gain.value = recipe.noiseLevel;
    noiseGain.connect(sink);

    const source = context.createBufferSource();
    source.buffer = createNoiseBuffer(context, seconds, options.seed);
    source.playbackRate.value = options.effect === 'reverse-tail' ? 0.85 : 1;
    source.connect(noiseGain);
    source.start(start);
    source.stop(end);
    noiseSources.push({ source, gain: noiseGain });
  }

  let stopped = false;
  return {
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      const now = context.currentTime;
      for (const oscillator of oscillators) {
        oscillator.stop(now);
        oscillator.disconnect();
      }
      for (const entry of noiseSources) {
        entry.source.stop(now);
        entry.source.disconnect();
        entry.gain.disconnect();
      }
      envelope.disconnect();
    },
  };
}

interface AudioBufferSourceNodeHandle {
  readonly source: ReturnType<AudioContextLike['createBufferSource']>;
  readonly gain: ReturnType<AudioContextLike['createGain']>;
}
