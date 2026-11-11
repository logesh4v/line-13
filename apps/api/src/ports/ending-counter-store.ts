/**
 * Anonymous ending aggregation.
 *
 * One atomic counter per (episode, ending). The store exposes increment only:
 * no read, no list, no delete. That shape is what lets the handler's IAM role
 * hold `dynamodb:UpdateItem` and nothing else, and the new total comes back
 * from the update itself rather than a second read.
 *
 * Nothing per-player is stored, so there is no record to attribute, join or
 * leak: the aggregate is the only artifact.
 */
export interface EndingCounterStore {
  increment(episodeId: string, endingId: string): Promise<number>;
}
