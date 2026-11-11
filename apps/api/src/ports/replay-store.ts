import type { GameEvent } from '../contracts.ts';

/**
 * Replay records.
 *
 * A replay is an episode id plus the event sequence that produced an ending.
 * Because the graph engine is deterministic, that sequence is the whole replay:
 * the API stores no rendering state and no player identity. Codes are minted by
 * the publication pipeline, never by this API, which keeps every request path
 * read-only except the ending counter.
 */
export interface ReplayRecord {
  readonly replayCode: string;
  readonly episodeId: string;
  readonly endingId: string;
  readonly schemaVersion: string;
  readonly events: readonly GameEvent[];
  readonly createdAt: string;
  /** Unix seconds; the table expires records with DynamoDB TTL. */
  readonly expiresAt: number;
}

export interface ReplayStore {
  findByCode(replayCode: string): Promise<ReplayRecord | undefined>;
}
