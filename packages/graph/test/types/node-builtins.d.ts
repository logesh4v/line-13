/**
 * Minimal ambient declarations for the two Node builtins the tests use.
 *
 * The repository installs no packages, so `@types/node` is unavailable here.
 * These declarations cover only `describe`/`it` from `node:test` and the four
 * assertions used by `node:assert/strict`; the real behaviour is exercised by
 * running the tests on Node, not by these types.
 */

declare module 'node:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  interface AssertStrict {
    (value: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  }
  const assert: AssertStrict;
  export default assert;
}
