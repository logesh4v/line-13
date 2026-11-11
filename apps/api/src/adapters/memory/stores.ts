import type { Clock } from '../../ports/clock.ts';
import type { EndingCounterStore } from '../../ports/ending-counter-store.ts';
import type {
  EpisodeCatalogue,
  ManifestReadResult,
  ManifestReader,
  PublishedEpisodeRecord,
} from '../../ports/episode-catalogue.ts';
import type { LogFields, Logger } from '../../ports/logger.ts';
import type { ReplayRecord, ReplayStore } from '../../ports/replay-store.ts';

/**
 * In-memory adapters.
 *
 * These are the only adapters in the package, and they are production-shaped
 * rather than test doubles: every handler test drives the real handler through
 * these, so the suite needs no AWS account, no network and no credentials. The
 * DynamoDB and S3 adapters that replace them in deployment are an open gap
 * recorded in this package's README.
 */

export function fixedClock(nowIso: string): Clock {
  return { nowIso: () => nowIso };
}

export class RecordingLogger implements Logger {
  readonly entries: LogFields[] = [];

  info(fields: LogFields): void {
    this.entries.push(fields);
  }

  warn(fields: LogFields): void {
    this.entries.push(fields);
  }

  error(fields: LogFields): void {
    this.entries.push(fields);
  }

  /** Every logged value, flattened, for assertions about what may be logged. */
  values(): readonly string[] {
    return this.entries.flatMap((entry) =>
      Object.values(entry)
        .filter((value) => value !== undefined)
        .map((value) => String(value)),
    );
  }
}

export class MemoryEpisodeCatalogue implements EpisodeCatalogue {
  readonly #byDay = new Map<string, PublishedEpisodeRecord>();

  publish(record: PublishedEpisodeRecord): void {
    this.#byDay.set(record.publishedDay, record);
  }

  async findPublishedForDay(dayKey: string): Promise<PublishedEpisodeRecord | undefined> {
    return this.#byDay.get(dayKey);
  }
}

export class MemoryManifestReader implements ManifestReader {
  readonly #objects = new Map<string, string>();
  #unavailable = false;

  put(location: string, body: string): void {
    this.#objects.set(location, body);
  }

  failNext(): void {
    this.#unavailable = true;
  }

  async read(location: string, maxBytes: number): Promise<ManifestReadResult> {
    if (this.#unavailable) {
      this.#unavailable = false;
      return { ok: false, reason: 'UNAVAILABLE' };
    }
    const body = this.#objects.get(location);
    if (body === undefined) {
      return { ok: false, reason: 'NOT_FOUND' };
    }
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
      return { ok: false, reason: 'TOO_LARGE' };
    }
    return { ok: true, body };
  }
}

export class MemoryReplayStore implements ReplayStore {
  readonly #byCode = new Map<string, ReplayRecord>();

  put(record: ReplayRecord): void {
    this.#byCode.set(record.replayCode, record);
  }

  async findByCode(replayCode: string): Promise<ReplayRecord | undefined> {
    return this.#byCode.get(replayCode);
  }
}

export class MemoryEndingCounterStore implements EndingCounterStore {
  readonly #totals = new Map<string, number>();

  async increment(episodeId: string, endingId: string): Promise<number> {
    const key = `${episodeId}#${endingId}`;
    const next = (this.#totals.get(key) ?? 0) + 1;
    this.#totals.set(key, next);
    return next;
  }

  total(episodeId: string, endingId: string): number {
    return this.#totals.get(`${episodeId}#${endingId}`) ?? 0;
  }

  size(): number {
    return this.#totals.size;
  }
}
