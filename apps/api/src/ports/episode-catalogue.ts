/**
 * Published-episode catalogue and manifest storage.
 *
 * Split in two on purpose: DynamoDB holds small, queryable metadata keyed by
 * publication day, and the manifest body lives in S3 under a content-addressed
 * key. The handler never learns which services these are, so the puzzle-truth
 * path stays free of AWS types and the adapters can be swapped or faked.
 */

export interface PublishedEpisodeRecord {
  readonly episodeId: string;
  /** UTC calendar day this episode is served for, `YYYY-MM-DD`. */
  readonly publishedDay: string;
  /** Opaque object key; meaningful only to the manifest reader. */
  readonly manifestLocation: string;
  /** SHA-256 recorded at publication, re-checked on every read. */
  readonly manifestHash: string;
  readonly schemaVersion: string;
}

export interface EpisodeCatalogue {
  findPublishedForDay(dayKey: string): Promise<PublishedEpisodeRecord | undefined>;
}

export type ManifestReadResult =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly reason: 'NOT_FOUND' | 'TOO_LARGE' | 'UNAVAILABLE' };

export interface ManifestReader {
  read(location: string, maxBytes: number): Promise<ManifestReadResult>;
}
