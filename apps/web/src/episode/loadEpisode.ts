import type { EpisodeManifestV1, ValidationIssue } from '../contracts.ts';
import { validateEpisodeManifest } from '../contracts.ts';
import { BUNDLED_EPISODE } from './bundled-episode.ts';

export type EpisodeSource = 'bundled' | 'remote';

export interface EpisodeLoad {
  readonly episode: EpisodeManifestV1;
  readonly source: EpisodeSource;
  /**
   * Exact non-blocking status text, or null when there is nothing to say.
   * A fallback always says so; it never silently substitutes a different puzzle.
   */
  readonly notice: string | null;
  /** Why the remote manifest was refused, for the console and for tests. */
  readonly rejectedIssues: readonly ValidationIssue[];
}

export const NOTICE_BUNDLED_FALLBACK = 'Night line running on the bundled episode.';
export const NOTICE_REMOTE_REFUSED =
  'The nightly episode did not verify. Night line running on the bundled episode.';

/**
 * The bundled episode goes through the same validator as a remote one. If the
 * bundle itself were ever malformed the app would rather throw at startup than
 * hand the player a half-valid puzzle, so this is the one place that throws.
 */
export function loadBundledEpisode(): EpisodeLoad {
  const result = validateEpisodeManifest(BUNDLED_EPISODE);
  if (!result.ok) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`The bundled episode failed validation: ${detail}`);
  }
  return {
    episode: result.value,
    source: 'bundled',
    notice: null,
    rejectedIssues: [],
  };
}

/**
 * Boundary for any episode that did not ship inside the bundle: a daily
 * episode, a share code, anything served over the network. Unknown input is
 * validated and either adopted or refused in favour of the bundle. This
 * function never throws and never returns a partially-adopted manifest.
 */
export function adoptRemoteEpisode(raw: unknown): EpisodeLoad {
  const result = validateEpisodeManifest(raw);
  if (!result.ok) {
    const fallback = loadBundledEpisode();
    return {
      episode: fallback.episode,
      source: 'bundled',
      notice: NOTICE_REMOTE_REFUSED,
      rejectedIssues: result.issues,
    };
  }
  return {
    episode: result.value,
    source: 'remote',
    notice: null,
    rejectedIssues: [],
  };
}

/** The caller the slice opens on: the first caller the episode declares. */
export function openingCaller(episode: EpisodeManifestV1): EpisodeManifestV1['callers'][number] {
  const caller = episode.callers[0];
  if (caller === undefined) {
    throw new Error('An episode must declare at least one caller.');
  }
  return caller;
}
