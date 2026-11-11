/**
 * Polly caller voices, looked up by the EXACT caption text.
 *
 * Keying on the caption (not on a line id) is what keeps the invariant "a line
 * only speaks words its caption shows": if the episode text changes and the
 * audio has not been regenerated, nothing matches and the line is silent with
 * its caption. A corrupted or missing manifest yields an empty index, so the
 * game degrades to captions rather than failing. The manifest is bundled (the
 * client never calls fetch); only the hashed mp3 files are separate static assets.
 */
export interface VoiceEntry {
  readonly file: string;
  readonly sha256: string;
  readonly durationMs: number;
  readonly text: string;
}

export type VoiceIndex = ReadonlyMap<string, VoiceEntry>;

export const EMPTY_VOICE_INDEX: VoiceIndex = new Map();

const HEX64 = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toEntry(value: unknown): VoiceEntry | null {
  if (!isRecord(value)) return null;
  const { file, sha256, durationMs, text } = value;
  if (
    typeof file !== 'string' ||
    typeof sha256 !== 'string' ||
    typeof durationMs !== 'number' ||
    typeof text !== 'string'
  ) {
    return null;
  }
  // Immutable assets are named by their content hash; anything else is not ours.
  if (!HEX64.test(sha256) || file !== `${sha256}.mp3`) return null;
  if (!(durationMs > 0) || text.length === 0) return null;
  return { file, sha256, durationMs, text };
}

/** Never throws: a manifest that is not the expected shape yields no voices. */
export function parseVoiceManifest(raw: unknown): VoiceIndex {
  if (!isRecord(raw) || raw['schemaVersion'] !== 1 || !isRecord(raw['lines'])) {
    return EMPTY_VOICE_INDEX;
  }
  const index = new Map<string, VoiceEntry>();
  for (const value of Object.values(raw['lines'])) {
    const entry = toEntry(value);
    if (entry !== null) index.set(entry.text, entry);
  }
  return index;
}

export function voiceFileFor(index: VoiceIndex, caption: string): string | null {
  return index.get(caption)?.file ?? null;
}
