import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGraphModel } from '../src/model.ts';
import {
  applyMove,
  createInitialState,
  isComplete,
  legalMoves,
  reverseMove,
  stateKey,
} from '../src/moves.ts';
import { computeProofReport } from '../src/proof.ts';
import { auditRecoverability, canRecover, recoveryPlan } from '../src/recovery.ts';
import { serializeState } from '../src/replay.ts';
import type { GraphModel, RoutingState } from '../src/types.ts';
import {
  fourCallerEpisode,
  minimalEpisode,
  noSolutionEpisode,
  recoverableEpisode,
} from './fixtures.ts';
import type { EpisodeManifestV1 } from '@line-13/contracts';

function model(episode: EpisodeManifestV1): GraphModel {
  const built = buildGraphModel(episode);
  assert.ok(built.ok, JSON.stringify(built.ok ? [] : built.issues));
  if (!built.ok) {
    throw new Error('fixture must build');
  }
  return built.model;
}

function expectApplied(
  graph: GraphModel,
  state: RoutingState,
  move: Parameters<typeof applyMove>[2],
  offset: number,
): RoutingState {
  const outcome = applyMove(graph, state, move, { timestampOffsetMs: offset });
  assert.equal(outcome.status, 'applied', `expected applied, got ${outcome.status}`);
  if (outcome.status !== 'applied') {
    throw new Error('move must apply');
  }
  return outcome.state;
}

describe('wrong-route recovery (R3.4, R4.5)', () => {
  it('rejects a forbidden destination, keeps the plug, and still completes', () => {
    const graph = model(minimalEpisode);
    const plugged = expectApplied(
      graph,
      createInitialState(graph),
      { kind: 'insert-plug', callerId: 'caller-ruth', destinationId: 'destination-orchard' },
      100,
    );
    const rejected = applyMove(
      graph,
      plugged,
      { kind: 'confirm-route', callerId: 'caller-ruth' },
      { timestampOffsetMs: 200 },
    );
    assert.equal(rejected.status, 'rejected');
    if (rejected.status !== 'rejected') {
      return;
    }
    assert.equal(rejected.rejection.reason, 'constraint');
    // The plug stays in: the consequence is recoverable, not terminal.
    assert.equal(rejected.state.plugs.get('caller-ruth'), 'destination-orchard');
    assert.equal(rejected.state.confirmations.size, 0);
    assert.ok(canRecover(graph, rejected.state));

    let state = expectApplied(
      graph,
      rejected.state,
      { kind: 'remove-plug', callerId: 'caller-ruth' },
      300,
    );
    state = expectApplied(
      graph,
      state,
      { kind: 'insert-plug', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
      400,
    );
    state = expectApplied(graph, state, { kind: 'confirm-route', callerId: 'caller-ruth' }, 500);
    assert.ok(isComplete(graph, state));
    assert.equal(state.rejections.length, 1);
  });

  it('plans the minimal disconnect when a legal route strands another caller', () => {
    const graph = model(recoverableEpisode);
    assert.equal(computeProofReport(recoverableEpisode).status, 'verified');

    // Silas into the bell tower is legal while Ruth is unassigned, but Ruth's
    // exclusion clue leaves her nowhere else to go.
    let state = expectApplied(
      graph,
      createInitialState(graph),
      { kind: 'insert-plug', callerId: 'caller-silas', destinationId: 'destination-bell-tower' },
      100,
    );
    state = expectApplied(graph, state, { kind: 'confirm-route', callerId: 'caller-silas' }, 200);

    const blocked = expectApplied(
      graph,
      state,
      { kind: 'insert-plug', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
      300,
    );
    const occupied = applyMove(
      graph,
      blocked,
      { kind: 'confirm-route', callerId: 'caller-ruth' },
      { timestampOffsetMs: 400 },
    );
    assert.equal(occupied.status, 'rejected');
    if (occupied.status !== 'rejected') {
      return;
    }
    assert.equal(occupied.rejection.reason, 'occupied');

    const plan = recoveryPlan(graph, occupied.state);
    assert.ok(plan.ok);
    if (!plan.ok) {
      return;
    }
    assert.deepEqual([...plan.plan.disconnects], ['caller-silas']);

    let recovered = expectApplied(
      graph,
      occupied.state,
      { kind: 'remove-plug', callerId: 'caller-ruth' },
      500,
    );
    let offset = 500;
    for (const callerId of plan.plan.disconnects) {
      offset += 100;
      recovered = expectApplied(graph, recovered, { kind: 'disconnect-route', callerId }, offset);
    }
    for (const route of plan.plan.completion.routes) {
      offset += 100;
      recovered = expectApplied(
        graph,
        recovered,
        { kind: 'insert-plug', callerId: route.callerId, destinationId: route.destinationId },
        offset,
      );
      offset += 100;
      recovered = expectApplied(
        graph,
        recovered,
        { kind: 'confirm-route', callerId: route.callerId },
        offset,
      );
    }
    assert.ok(isComplete(graph, recovered));
    assert.equal(recovered.confirmations.get('caller-ruth'), 'destination-bell-tower');
    assert.equal(recovered.confirmations.get('caller-silas'), 'destination-orchard');
  });

  it('leaves no reachable state without a recovery plan', () => {
    for (const episode of [minimalEpisode, recoverableEpisode]) {
      const graph = model(episode);
      const audit = auditRecoverability(graph);
      assert.equal(audit.exhaustive, true, `${episode.episodeId} state space exceeded the budget`);
      assert.deepEqual(
        [...audit.unrecoverableStateKeys],
        [],
        `${episode.episodeId} has dead-end states`,
      );
      assert.ok(audit.statesChecked > 1);
    }
  });
});

describe('move reversal', () => {
  it('restores the exact prior state for every legal move from the start', () => {
    const graph = model(recoverableEpisode);
    const start = createInitialState(graph);
    const before = serializeState(graph, start);
    for (const move of legalMoves(graph, start)) {
      const outcome = applyMove(graph, start, move, { timestampOffsetMs: 42 });
      if (outcome.status === 'illegal') {
        continue;
      }
      const restored = reverseMove(outcome.state, outcome.journal);
      assert.deepEqual(serializeState(graph, restored), before, JSON.stringify(move));
      assert.equal(stateKey(graph, restored), stateKey(graph, start));
    }
  });

  it('restores confirmation order when a mid-sequence route is reversed', () => {
    const graph = model(recoverableEpisode);
    let state = expectApplied(
      graph,
      createInitialState(graph),
      { kind: 'insert-plug', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
      100,
    );
    state = expectApplied(graph, state, { kind: 'confirm-route', callerId: 'caller-ruth' }, 200);
    state = expectApplied(
      graph,
      state,
      { kind: 'insert-plug', callerId: 'caller-silas', destinationId: 'destination-orchard' },
      300,
    );
    state = expectApplied(graph, state, { kind: 'confirm-route', callerId: 'caller-silas' }, 400);
    assert.deepEqual([...state.confirmationOrder], ['caller-ruth', 'caller-silas']);

    const snapshot = serializeState(graph, state);
    const disconnected = applyMove(
      graph,
      state,
      { kind: 'disconnect-route', callerId: 'caller-ruth' },
      { timestampOffsetMs: 500 },
    );
    assert.equal(disconnected.status, 'applied');
    if (disconnected.status !== 'applied') {
      return;
    }
    assert.deepEqual([...disconnected.state.confirmationOrder], ['caller-silas']);
    const restored = reverseMove(disconnected.state, disconnected.journal);
    assert.deepEqual(serializeState(graph, restored), snapshot);
    assert.deepEqual([...restored.confirmationOrder], ['caller-ruth', 'caller-silas']);
  });

  it('reports an illegal move without changing state', () => {
    const graph = model(recoverableEpisode);
    const start = createInitialState(graph);
    const outcome = applyMove(
      graph,
      start,
      { kind: 'confirm-route', callerId: 'caller-ruth' },
      { timestampOffsetMs: 10 },
    );
    assert.equal(outcome.status, 'illegal');
    if (outcome.status !== 'illegal') {
      return;
    }
    assert.equal(outcome.reason, 'no-plug-present');
  });
});

describe('recovery proof completeness at episode scale (R4.5)', () => {
  it('proves recoverability exhaustively for a four-caller episode', () => {
    const report = computeProofReport(fourCallerEpisode);

    // The whole point: at this size the sweep must finish, because a `verified`
    // status that rests on a truncated sweep is an unproven claim.
    assert.equal(report.recoverability.exhaustive, true);
    assert.deepEqual([...report.recoverability.unrecoverableStateKeys], []);
    assert.equal(report.status, 'verified');
    assert.equal(report.solutionCount, 1);
    assert.equal(report.shortestSolutionLength, 4);
    assert.equal(report.intendedSolutionMatches, true);
    assert.ok(
      report.recoverability.statesChecked > 2000,
      `expected the four-caller graph to exceed the old 2000-state ceiling, ` +
        `checked ${report.recoverability.statesChecked}`,
    );
  });

  it('agrees with an independent sweep of the reachable state space', () => {
    const graph = model(fourCallerEpisode);
    const audit = auditRecoverability(graph);

    // Walk the space without the audit's own bookkeeping, so the count is
    // corroborated rather than self-reported.
    const initial = createInitialState(graph);
    const seen = new Set<string>([stateKey(graph, initial)]);
    const queue: RoutingState[] = [initial];
    let visited = 0;
    while (queue.length > 0) {
      const state = queue.shift();
      if (state === undefined) {
        break;
      }
      visited += 1;
      assert.ok(canRecover(graph, state), `unrecoverable state ${stateKey(graph, state)}`);
      for (const move of legalMoves(graph, state)) {
        const outcome = applyMove(graph, state, move, { timestampOffsetMs: 0 });
        if (outcome.status === 'illegal') {
          continue;
        }
        const key = stateKey(graph, outcome.state);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(outcome.state);
        }
      }
    }

    assert.equal(audit.exhaustive, true);
    assert.equal(audit.statesChecked, visited);
  });

  it('rejects rather than verifies when the sweep truncates', () => {
    // Same episode, a ceiling too low to cover it. The audit already reported
    // this honestly; the regression is the gate treating it as a pass.
    const report = computeProofReport(fourCallerEpisode, { recoveryStateLimit: 200 });

    assert.equal(report.recoverability.exhaustive, false);
    assert.deepEqual([...report.recoverability.unrecoverableStateKeys], []);
    assert.equal(report.status, 'rejected');
    assert.equal(report.failingSeed, fourCallerEpisode.seed);
    assert.ok(
      report.issues.some((issue) => issue.code === 'RECOVERY_PROOF_INCOMPLETE'),
      `expected RECOVERY_PROOF_INCOMPLETE, got ${report.issues.map((i) => i.code).join(', ')}`,
    );
  });

  it('does not blame recovery when the episode simply has no solution', () => {
    // The sweep is skipped entirely for an unsolvable episode, so its
    // non-exhaustive empty audit must not add a second, misleading issue.
    const report = computeProofReport(noSolutionEpisode);

    assert.equal(report.status, 'rejected');
    assert.ok(report.issues.some((issue) => issue.code === 'NO_SOLUTION'));
    assert.equal(
      report.issues.some((issue) => issue.code === 'RECOVERY_PROOF_INCOMPLETE'),
      false,
    );
  });
});
