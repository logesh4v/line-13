/**
 * Deterministic JSON serialization.
 *
 * A manifest hash is only meaningful if the publisher and the API agree on the
 * exact bytes being hashed, so serialization cannot depend on key insertion
 * order, whitespace, or a runtime's float formatting. Object keys are sorted by
 * UTF-16 code unit, arrays keep their order (order is meaningful in a routing
 * graph), and anything that cannot round-trip is rejected loudly instead of
 * being coerced.
 */

export type CanonicalJsonFailureReason =
  | 'UNSUPPORTED_TYPE'
  | 'NON_FINITE_NUMBER'
  | 'CYCLIC_REFERENCE';

export class CanonicalJsonError extends Error {
  readonly reason: CanonicalJsonFailureReason;
  readonly path: string;

  constructor(reason: CanonicalJsonFailureReason, path: string) {
    super(`${reason} at ${path}`);
    this.name = 'CanonicalJsonError';
    this.reason = reason;
    this.path = path;
  }
}

export function canonicalJson(value: unknown): string {
  return write(value, '$', new Set<object>());
}

function write(value: unknown, path: string, seen: Set<object>): string {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalJsonError('NON_FINITE_NUMBER', path);
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      return writeObject(value as object, path, seen);
    default:
      throw new CanonicalJsonError('UNSUPPORTED_TYPE', path);
  }
}

function writeObject(value: object, path: string, seen: Set<object>): string {
  if (seen.has(value)) {
    throw new CanonicalJsonError('CYCLIC_REFERENCE', path);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        parts.push(write(value[index], `${path}[${index}]`, seen));
      }
      return `[${parts.join(',')}]`;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const child = record[key];
      if (child === undefined) {
        throw new CanonicalJsonError('UNSUPPORTED_TYPE', `${path}.${key}`);
      }
      parts.push(`${JSON.stringify(key)}:${write(child, `${path}.${key}`, seen)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}
