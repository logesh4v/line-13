/**
 * Property-based tests over the graph engine (spec Milestone 3, R4.3-R4.5, R5.3).
 *
 * Episodes are generated from a small spec (callers, destinations, required /
 * forbidden / distinct / ordering constraints, exclusion clues). An independent
 * brute-force oracle in this file counts the true complete solutions, and the
 * engine must agree:
 *   soundness     verified => exactly one solution, intended route valid
 *   completeness  exactly one solution (and no ordering cycle) => verified
 *   rejection     zero / many solutions and ordering cycles => rejected, with failingSeed
 *   recovery      every state on a random wrong-move walk can still reach a solution
 *   replay        the solution's events replay to the same state and hash, twice
 *   determinism   the proof report is identical on repeated runs
 *
 * 10,000 cases by default (PBT_RUNS to change). Fixed seed in CI via PBT_SEED;
 * otherwise a fresh seed per run. Failures print the minimized counterexample
 * and a replay command; every run is recorded for scripts/pbt-report.mjs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import fc from 'fast-check';

import type { EpisodeManifestV1, RouteConstraint, Clue } from '@line-13/contracts';
import {
  applyMove,
  canRecover,
  computeProofReport,
  createInitialState,
  hashState,
  isComplete,
  legalMoves,
  replayEvents,
  serializeState,
  validateEpisode,
} from '../src/index.ts';
import type { GraphMove, ProofReport } from '../src/index.ts';
import { minimalEpisode } from './fixtures.ts';
// @ts-expect-error plain .mjs helper without type declarations
import { formatRun, writeRun } from '../../../scripts/pbt-report.mjs';

declare const process: { env: Record<string, string | undefined> };
declare const console: { log(...args: unknown[]): void };

const RUNS = Number(process.env.PBT_RUNS ?? 10_000);
const SOLUTION_LIMIT = 64; // engine default; the oracle caps its expectation the same way

// ---------------------------------------------------------------- generation

type Pair = readonly [number, number];
interface Spec {
  readonly callers: number;
  readonly destinations: number;
  readonly required: readonly Pair[]; // [caller, destination]
  readonly forbidden: readonly Pair[]; // [caller, destination]
  readonly distinct: readonly Pair[]; // [caller, caller]
  readonly ordering: readonly Pair[]; // [before, after]
  readonly exclusions: readonly Pair[]; // clue on caller excluding destination
}

const specArb: fc.Arbitrary<Spec> = fc
  .tuple(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 0, max: 2 }))
  .chain(([callers, extra]) => {
    const destinations = callers + extra;
    const cd = fc.tuple(fc.nat(callers - 1), fc.nat(destinations - 1));
    const cc = fc
      .tuple(fc.nat(callers - 1), fc.nat(callers - 1))
      .filter(([a, b]) => a !== b);
    return fc.record({
      callers: fc.constant(callers),
      destinations: fc.constant(destinations),
      required: fc.array(cd, { maxLength: 3 }),
      forbidden: fc.array(cd, { maxLength: 4 }),
      distinct: callers > 1 ? fc.array(cc, { maxLength: 3 }) : fc.constant([]),
      ordering: callers > 1 ? fc.array(cc, { maxLength: 3 }) : fc.constant([]),
      exclusions: fc.array(cd, { maxLength: 3 }),
    });
  });

const cid = (i: number): string => `caller-${i}`;
const did = (i: number): string => `destination-${i}`;

function toManifest(spec: Spec, intended: readonly number[] | null): EpisodeManifestV1 {
  const clues: Clue[] = spec.exclusions.map(([, d], i) => ({
    id: `clue-${i}`,
    kind: 'exclusion',
    text: `Not ${did(d)}.`,
    excludedDestinationIds: [did(d)],
  })) as Clue[];
  const constraints: RouteConstraint[] = [
    ...spec.required.map(([c, d]) => ({ kind: 'required-route', callerId: cid(c), destinationId: did(d) }) as const),
    ...spec.forbidden.map(([c, d]) => ({ kind: 'forbidden-route', callerId: cid(c), destinationId: did(d) }) as const),
    ...spec.distinct.map(([a, b]) => ({ kind: 'distinct-destination', callerIds: [cid(a), cid(b)] }) as const),
    ...spec.ordering.map(([a, b]) => ({ kind: 'ordering', beforeCallerId: cid(a), afterCallerId: cid(b) }) as const),
  ] as RouteConstraint[];
  const callers = Array.from({ length: spec.callers }, (_, i) => ({
    id: cid(i),
    displayName: `Caller ${i}`,
    departedOn: '1931-10-31',
    initialLineId: `line-${String(i).padStart(2, '0')}`,
    clueIds: spec.exclusions.flatMap(([c], k) => (c === i ? [`clue-${k}`] : [])),
    subtitle: `Line ${i}.`,
  }));
  const destinations = Array.from({ length: spec.destinations }, (_, i) => ({
    id: did(i),
    label: `Destination ${i}`,
    description: `Destination ${i}.`,
  }));
  const picks = intended ?? callers.map((_, i) => i % spec.destinations);
  return {
    ...minimalEpisode,
    episodeId: 'pbt',
    seed: 'pbt-seed',
    callers,
    destinations,
    clues,
    constraints,
    intendedRoutes: picks.map((d, i) => ({ callerId: cid(i), destinationId: did(d), order: i + 1 })),
  };
}

// -------------------------------------------------------------------- oracle

/** All complete assignments (caller index -> destination index) satisfying the spec, by brute force. */
function oracleSolutions(spec: Spec): number[][] {
  const out: number[][] = [];
  const allowed = (c: number, d: number): boolean => {
    if (spec.required.some(([rc, rd]) => rc === c && rd !== d)) return false;
    if (spec.forbidden.some(([fc_, fd]) => fc_ === c && fd === d)) return false;
    if (spec.exclusions.some(([ec, ed]) => ec === c && ed === d)) return false;
    return true;
  };
  const walk = (c: number, chosen: number[]): void => {
    if (c === spec.callers) {
      // a destination holds one caller (moves.ts: 'occupied'), so assignments must be injective
      if (new Set(chosen).size === chosen.length) out.push([...chosen]);
      return;
    }
    for (let d = 0; d < spec.destinations; d += 1) {
      if (allowed(c, d)) walk(c + 1, [...chosen, d]);
    }
  };
  walk(0, []);
  return out;
}

function hasOrderingCycle(spec: Spec): boolean {
  const edges = new Map<number, number[]>();
  for (const [a, b] of spec.ordering) edges.set(a, [...(edges.get(a) ?? []), b]);
  const state = new Map<number, 1 | 2>();
  const visit = (n: number): boolean => {
    if (state.get(n) === 2) return false;
    if (state.get(n) === 1) return true;
    state.set(n, 1);
    for (const m of edges.get(n) ?? []) if (visit(m)) return true;
    state.set(n, 2);
    return false;
  };
  return [...edges.keys()].some(visit);
}

// ------------------------------------------------------------------ property

interface Engine {
  readonly computeProofReport: (m: EpisodeManifestV1) => ProofReport;
}
const realEngine: Engine = { computeProofReport: (m) => computeProofReport(m) };

const stats: Record<string, number> = {};
const bump = (key: string): void => {
  stats[key] = (stats[key] ?? 0) + 1;
};

function codes(report: ProofReport): string[] {
  return report.issues.map((i) => i.code);
}

function playSolution(manifest: EpisodeManifestV1): void {
  const validation = validateEpisode(manifest);
  assert.ok(validation.ok, 'verified episode must validate');
  if (!validation.ok) return;
  const { model } = validation;
  let state = createInitialState(model);
  const events = [];
  let t = 0;
  const byCaller = new Map(manifest.intendedRoutes.map((r) => [r.callerId, r]));
  for (const callerId of model.canonicalOrder) {
    const route = byCaller.get(callerId);
    if (route === undefined) continue;
    for (const move of [
      { kind: 'insert-plug', callerId: route.callerId, destinationId: route.destinationId },
      { kind: 'confirm-route', callerId: route.callerId },
    ] as GraphMove[]) {
      t += 100;
      const outcome = applyMove(model, state, move, { timestampOffsetMs: t });
      assert.notEqual(outcome.status, 'illegal', `intended move illegal: ${JSON.stringify(move)}`);
      if (outcome.status === 'illegal') return;
      state = outcome.state;
      events.push(...outcome.events);
    }
  }
  assert.ok(isComplete(model, state), 'playing the intended routes must complete the board');
  const first = replayEvents(model, events);
  const second = replayEvents(model, events);
  assert.deepEqual(first.issues, [], 'replay of a legal playthrough has no issues');
  assert.equal(first.stateHash, second.stateHash, 'replay is deterministic');
  assert.equal(first.stateHash, hashState(model, state), 'replay reaches the played state');
  assert.deepEqual(serializeState(model, first.state), serializeState(model, state));
}

function randomWalkStaysRecoverable(manifest: EpisodeManifestV1, picks: readonly number[]): void {
  const validation = validateEpisode(manifest);
  if (!validation.ok) return;
  const { model } = validation;
  let state = createInitialState(model);
  assert.ok(canRecover(model, state));
  for (const pick of picks) {
    const moves = legalMoves(model, state);
    if (moves.length === 0) return;
    const move = moves[pick % moves.length];
    if (move === undefined) return;
    const outcome = applyMove(model, state, move, { timestampOffsetMs: 0 });
    if (outcome.status === 'illegal') continue;
    state = outcome.state;
    assert.ok(canRecover(model, state), `state unrecoverable after ${JSON.stringify(move)}`);
  }
}

/** The whole property. Throws on the first violated invariant. */
function checkSpec(spec: Spec, walk: readonly number[], engine: Engine): void {
  const solutions = oracleSolutions(spec);
  const cycle = hasOrderingCycle(spec);
  const manifest = toManifest(spec, solutions[0] ?? null);
  const report = engine.computeProofReport(manifest);
  const again = engine.computeProofReport(manifest);
  assert.deepEqual(again, report, 'proof report must be deterministic');

  if (cycle) {
    bump('rejected:ordering-cycle');
    assert.equal(report.status, 'rejected');
    assert.ok(codes(report).includes('ORDERING_CYCLE'), `cycle not reported: ${codes(report)}`);
    assert.equal(report.failingSeed, manifest.seed);
    return;
  }
  if (solutions.length === 0) {
    bump('rejected:zero-solution');
    assert.equal(report.status, 'rejected', 'zero-solution episode must be rejected');
    assert.equal(report.failingSeed, manifest.seed);
    assert.ok(
      codes(report).includes('NO_SOLUTION') || codes(report).includes('EMPTY_DOMAIN'),
      `zero-solution rejection must name its cause: ${codes(report)}`,
    );
    return;
  }
  if (solutions.length > 1) {
    bump('rejected:multi-solution');
    assert.equal(report.status, 'rejected', 'ambiguous episode must be rejected');
    assert.ok(codes(report).includes('MULTIPLE_SOLUTIONS'), `ambiguity not reported: ${codes(report)}`);
    assert.equal(report.solutionCount, Math.min(solutions.length, SOLUTION_LIMIT));
    return;
  }
  // exactly one true solution
  assert.equal(report.status, 'verified', `unique-solution episode rejected: ${JSON.stringify(report.issues)}`);
  assert.equal(report.solutionCount, 1);
  assert.equal(report.intendedSolutionMatches, true);
  assert.equal(report.recoverability.exhaustive, true);
  assert.deepEqual(report.recoverability.unrecoverableStateKeys, []);
  bump('verified');
  playSolution(manifest);
  randomWalkStaysRecoverable(manifest, walk);
}

const walkArb = fc.array(fc.nat(50), { maxLength: 14 });

function runProperty(engine: Engine, numRuns: number, seed?: number) {
  return fc.check(
    fc.property(specArb, walkArb, (spec, walk) => checkSpec(spec, walk, engine)),
    { numRuns, ...(seed === undefined ? {} : { seed }), verbose: 0 },
  );
}

// --------------------------------------------------------------------- tests

describe('graph engine properties (fast-check)', () => {
  it(`holds over ${RUNS} generated episodes`, () => {
    for (const key of Object.keys(stats)) delete stats[key];
    const envSeed = process.env.PBT_SEED;
    const seed = envSeed === undefined ? (Date.now() ^ 0x5bd1e995) | 0 : Number(envSeed);
    const started = Date.now();
    const result = runProperty(realEngine, RUNS, seed);
    const record = {
      suite: '@line-13/graph engine properties',
      failed: result.failed,
      requestedRuns: RUNS,
      numRuns: result.numRuns,
      numShrinks: result.numShrinks,
      seed: result.seed,
      durationMs: Date.now() - started,
      stats: { ...stats },
      replay: `PBT_SEED=${result.seed} PBT_RUNS=${RUNS} npm run pbt`,
      counterexample: result.failed ? JSON.stringify(result.counterexample) : '',
    };
    writeRun(record);
    console.log(formatRun(record));
    assert.equal(
      result.failed,
      false,
      `property failed; seed=${result.seed} path=${result.counterexamplePath}\nminimized: ${record.counterexample}\n${result.errorInstance}`,
    );
    assert.equal(result.numRuns, RUNS);
    assert.ok((stats['verified'] ?? 0) > RUNS / 20, 'generator must reach verified episodes often enough');
    for (const key of ['rejected:zero-solution', 'rejected:multi-solution']) {
      assert.ok((stats[key] ?? 0) > 0, `generator never produced ${key}`);
    }
  });

  it('catches a seeded defect and shrinks it to a minimal episode', () => {
    // Mutant: a validator that forgets to report ambiguity (the R4.4 defect).
    const mutant: Engine = {
      computeProofReport: (m) => {
        const real = computeProofReport(m);
        const issues = real.issues.filter((i) => i.code !== 'MULTIPLE_SOLUTIONS');
        return { ...real, issues, status: issues.length === 0 ? 'verified' : real.status };
      },
    };
    const snapshot = { ...stats };
    const result = runProperty(mutant, 2_000, 1313);
    Object.assign(stats, snapshot);
    assert.equal(result.failed, true, 'mutant must be caught');
    const minimized = result.counterexample?.[0] as Spec;
    // The smallest ambiguous episode has one unconstrained caller and two destinations.
    assert.ok(minimized.callers <= 2 && minimized.destinations <= 3, JSON.stringify(minimized));
    console.log(
      `mutant caught: seed=${result.seed} runs=${result.numRuns} shrinks=${result.numShrinks} minimized=${JSON.stringify(result.counterexample)}`,
    );
  });
});
