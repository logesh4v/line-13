import type { EpisodeManifestV1 } from '../contracts.ts';
import type { Sha256Hasher } from '../integrity/hasher.ts';

/**
 * Amazon Polly speech publication: request building only.
 *
 * Speech is produced once, at publication time, and stored as an immutable
 * asset. Nothing in the judge's playthrough calls Polly or any other service
 * (R6.5), so this module builds requests and never issues them: the
 * `SpeechPublisher` port is implemented by the publication pipeline, which is
 * out of this package's ownership.
 *
 * Two rules are enforced here rather than left to review:
 *
 * - The synthesised text is the caller's `subtitle` string itself, so audio and
 *   subtitle cannot drift apart (R6.4, "every spoken line shall have an exact
 *   subtitle").
 * - The output key is content-addressed over text, voice and engine, so
 *   re-publishing identical dialogue is a no-op and a changed line can never
 *   overwrite the asset a published manifest already references.
 */

export type PollyEngine = 'neural' | 'generative';

/** Amazon Polly English voices approved for LINE 13 callers. */
export const APPROVED_VOICE_IDS = Object.freeze([
  'Ruth',
  'Danielle',
  'Matthew',
  'Stephen',
] as const);

export type ApprovedVoiceId = (typeof APPROVED_VOICE_IDS)[number];

export interface SpeechSynthesisRequest {
  readonly callerId: string;
  readonly engine: PollyEngine;
  readonly voiceId: ApprovedVoiceId;
  readonly languageCode: 'en-US';
  readonly outputFormat: 'mp3';
  readonly textType: 'text';
  /** Exactly the subtitle that ships in the manifest. */
  readonly text: string;
  /** Content-addressed destination key, stable across republication. */
  readonly outputKey: string;
}

export interface SpeechArtifact {
  readonly outputKey: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface SpeechPublisher {
  synthesize(request: SpeechSynthesisRequest): Promise<SpeechArtifact>;
}

export type SpeechPlanFailure =
  | { readonly reason: 'VOICE_NOT_APPROVED'; readonly callerId: string }
  | { readonly reason: 'SUBTITLE_EMPTY'; readonly callerId: string };

export type SpeechPlan =
  | { readonly ok: true; readonly requests: readonly SpeechSynthesisRequest[] }
  | { readonly ok: false; readonly failures: readonly SpeechPlanFailure[] };

export interface SpeechPlanOptions {
  readonly engine: PollyEngine;
  /** Voice chosen per caller by the content pipeline, reviewed by a human. */
  readonly voiceByCallerId: Readonly<Record<string, string>>;
}

export function isApprovedVoiceId(value: string): value is ApprovedVoiceId {
  return (APPROVED_VOICE_IDS as readonly string[]).includes(value);
}

export function planSpeechSynthesis(
  manifest: EpisodeManifestV1,
  options: SpeechPlanOptions,
  hasher: Sha256Hasher,
): SpeechPlan {
  const requests: SpeechSynthesisRequest[] = [];
  const failures: SpeechPlanFailure[] = [];

  for (const caller of manifest.callers) {
    const subtitle = caller.subtitle.trim();
    if (subtitle.length === 0) {
      failures.push({ reason: 'SUBTITLE_EMPTY', callerId: caller.id });
      continue;
    }

    const requestedVoice = options.voiceByCallerId[caller.id];
    if (requestedVoice === undefined || !isApprovedVoiceId(requestedVoice)) {
      failures.push({ reason: 'VOICE_NOT_APPROVED', callerId: caller.id });
      continue;
    }

    const fingerprint = hasher.hashHex(
      `${options.engine}\u0000${requestedVoice}\u0000${subtitle}`,
    );
    requests.push({
      callerId: caller.id,
      engine: options.engine,
      voiceId: requestedVoice,
      languageCode: 'en-US',
      outputFormat: 'mp3',
      textType: 'text',
      text: subtitle,
      outputKey: `audio/${manifest.episodeId}/${fingerprint}.mp3`,
    });
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, requests };
}
