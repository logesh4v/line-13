import type { Caller, EntityId, EpisodeAsset, HauntCue } from './contracts.ts';

/**
 * The narrow slice of the manifest subtitles need. Taking a slice rather than a
 * whole `EpisodeManifestV1` keeps this usable from a test fixture and makes it
 * obvious that nothing here can reach puzzle data.
 */
export interface SubtitleSource {
  readonly callers: readonly Pick<Caller, 'id' | 'subtitle' | 'voiceAssetId'>[];
  readonly assets: readonly EpisodeAsset[];
}

export type SubtitleOrigin = 'asset-transcript' | 'caller-subtitle';

export interface SubtitleLine {
  readonly cueId: EntityId;
  /** Caller, line, or asset the words belong to. */
  readonly sourceId: EntityId;
  /**
   * The exact authored text. Copied verbatim from the manifest; this module
   * never paraphrases, truncates, or generates subtitle text (R6.4).
   */
  readonly text: string;
  readonly origin: SubtitleOrigin;
}

export interface MissingSubtitle {
  readonly cueId: EntityId;
  readonly sourceId: EntityId;
  readonly reason: 'no-caller' | 'no-transcript' | 'empty-text';
}

export interface SubtitleResolution {
  readonly lines: readonly SubtitleLine[];
  /**
   * Cues that should have carried words and did not. Reported, never papered
   * over: a missing subtitle is a content defect to surface, and it must not
   * block progression (R7.4), so this is a list rather than a thrown error.
   */
  readonly missing: readonly MissingSubtitle[];
}

function audioTranscript(
  assets: readonly EpisodeAsset[],
  assetId: EntityId,
): string | null {
  for (const asset of assets) {
    if (asset.id === assetId && asset.kind === 'audio') {
      return asset.transcript;
    }
  }
  return null;
}

function findCaller(
  callers: SubtitleSource['callers'],
  callerId: EntityId,
): SubtitleSource['callers'][number] | null {
  for (const caller of callers) {
    if (caller.id === callerId) {
      return caller;
    }
  }
  return null;
}

/**
 * Exact subtitles for every spoken cue in a batch.
 *
 * Only `voice-filter` cues speak. A `sound` cue whose asset happens to be an
 * audio asset with a transcript also contributes, which is how a Polly line
 * routed through the plain-audio fallback still shows its words.
 */
export function resolveSubtitles(
  cues: readonly HauntCue[],
  source: SubtitleSource,
): SubtitleResolution {
  const lines: SubtitleLine[] = [];
  const missing: MissingSubtitle[] = [];

  for (const cue of cues) {
    if (cue.channel === 'voice-filter') {
      const caller = findCaller(source.callers, cue.targetId);
      if (caller === null) {
        missing.push({ cueId: cue.id, sourceId: cue.targetId, reason: 'no-caller' });
        continue;
      }

      const fromAsset =
        caller.voiceAssetId === undefined
          ? null
          : audioTranscript(source.assets, caller.voiceAssetId);
      const text = fromAsset ?? caller.subtitle;

      if (text.length === 0) {
        missing.push({ cueId: cue.id, sourceId: caller.id, reason: 'empty-text' });
        continue;
      }

      lines.push({
        cueId: cue.id,
        sourceId: caller.id,
        text,
        origin: fromAsset === null ? 'caller-subtitle' : 'asset-transcript',
      });
      continue;
    }

    if (cue.channel === 'sound') {
      const transcript = audioTranscript(source.assets, cue.assetId);
      if (transcript === null) {
        // Expected for the exchange's own synthesized effects: a bell has no
        // words, so its absence is not a defect and is not reported.
        continue;
      }
      if (transcript.length === 0) {
        missing.push({ cueId: cue.id, sourceId: cue.assetId, reason: 'no-transcript' });
        continue;
      }
      lines.push({
        cueId: cue.id,
        sourceId: cue.assetId,
        text: transcript,
        origin: 'asset-transcript',
      });
    }
  }

  return { lines, missing };
}
