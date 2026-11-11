import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GameEvent } from '@line-13/contracts';
import { buildGraphModel } from '../src/model.ts';
import { applyMove, createInitialState, isComplete } from '../src/moves.ts';
import { hashState, replayEvents, serializeState } from '../src/replay.ts';
import type { GraphModel, GraphMove, RoutingState } from '../src/types.ts';
import { twoCallerEpisode } from './fixtures.ts';

function model(): GraphModel {
  const built = buildGraphModel(twoCallerEpisode);
  assert.ok(built.ok, JSON.stringify(built.ok ? [] : built.issues));
  if (!built.ok) {
    throw new Error('fixture must build');
  }
  return built.model;
}

interface Drive {
  readonly state: RoutingState;
  readonly events: readonly GameEvent[];
}

function drive(
  graph: GraphModel,
  moves: readonly GraphMove[],
  start?: RoutingState,
): Drive {
  let state = start ?? createInitialState(graph);
  const events: GameEvent[] = [];
  let offset = 0;
  for (const move of moves) {
    offset += 250;
    const outcome = applyMove(graph, state, move, { timestampOffsetMs: offset });
    assert.notEqual(outcome.status, 'illegal', `illegal move: ${JSON.stringify(move)}`);
    if (outcome.status === 'illegal') {
      continue;
    }
    state = outcome.state;
    events.push(...outcome.events);
  }
  return { state, events };
}

const solvePath: readonly GraphMove[] = [
  { kind: 'insert-plug', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
  { kind: 'confirm-route', callerId: 'caller-ruth' },
  { kind: 'insert-plug', callerId: 'caller-silas', destinationId: 'destination-cellar' },
  { kind: 'confirm-route', callerId: 'caller-silas' },
];

describe('deterministic replay (R5.3)', () => {
  it('rebuilds the same state and hash from the same event sequence', () => {
    const graph = model();
    const played = drive(graph, solvePath);
    assert.ok(isComplete(graph, played.state));

    const first = replayEvents(graph, played.events);
    const second = replayEvents(graph, played.events);

    assert.deepEqual(first.issues, []);
    assert.equal(first.timeline.length, played.events.length);
    assert.equal(first.stateHash, second.stateHash);
    assert.deepEqual(serializeState(graph, first.state), serializeState(graph, second.state));
    assert.equal(first.stateHash, hashState(graph, played.state));
    assert.deepEqual(serializeState(graph, first.state), serializeState(graph, played.state));
    assert.ok(isComplete(graph, first.state));
  });

  it('builds the same seeded model on every build', () => {
    const first = buildGraphModel(twoCallerEpisode);
    const second = buildGraphModel(twoCallerEpisode);
    assert.ok(first.ok && second.ok);
    if (!first.ok || !second.ok) {
      return;
    }
    assert.deepEqual([...first.model.callerOrder], [...second.model.callerOrder]);
    assert.deepEqual([...first.model.destinationOrder], [...second.model.destinationOrder]);
    assert.deepEqual([...first.model.canonicalOrder], [...second.model.canonicalOrder]);
    assert.deepEqual([...first.model.canonicalOrder], ['caller-ruth', 'caller-silas']);
  });

  it('carries non-routing events into the timeline without touching graph state', () => {
    const graph = model();
    // Start the routing events at sequence 2 so the ring can occupy sequence 1.
    const played = drive(graph, solvePath, { ...createInitialState(graph), sequence: 2 });
    const decorated: readonly GameEvent[] = [
      { sequence: 1, timestampOffsetMs: 0, type: 'CALL_RINGING', callerId: 'caller-ruth', lineId: 'line-03' },
      ...played.events,
      {
        sequence: 99,
        timestampOffsetMs: 9000,
        type: 'ENDING_SELECTED',
        endingId: 'ending-first-connection',
      },
    ];
    const replayed = replayEvents(graph, decorated);
    assert.deepEqual(replayed.issues, []);
    assert.equal(replayed.timeline.length, decorated.length);
    assert.deepEqual(
      serializeState(graph, replayed.state).confirmations,
      serializeState(graph, played.state).confirmations,
    );
  });

  it('skips and reports an event whose sequence does not advance', () => {
    const graph = model();
    const played = drive(graph, solvePath);
    const first = played.events[0];
    assert.ok(first !== undefined);
    if (first === undefined) {
      return;
    }
    const replayed = replayEvents(graph, [first, first]);
    assert.equal(replayed.timeline.length, 1);
    assert.equal(replayed.issues.length, 1);
    assert.equal(replayed.issues[0]?.code, 'INVALID_VALUE');
  });

  it('skips and reports an event referencing an unknown caller', () => {
    const graph = model();
    const replayed = replayEvents(graph, [
      {
        sequence: 1,
        timestampOffsetMs: 0,
        type: 'PLUG_INSERTED',
        callerId: 'caller-nobody',
        destinationId: 'destination-cellar',
      },
    ]);
    assert.deepEqual(replayed.timeline, []);
    assert.equal(replayed.issues[0]?.code, 'MISSING_REFERENCE');
  });

  it('rejects a confirmation whose ordering predecessor is unconfirmed', () => {
    const graph = model();
    const start = createInitialState(graph);
    const plugged = applyMove(
      graph,
      start,
      { kind: 'insert-plug', callerId: 'caller-silas', destinationId: 'destination-cellar' },
      { timestampOffsetMs: 10 },
    );
    assert.equal(plugged.status, 'applied');
    if (plugged.status !== 'applied') {
      return;
    }
    const confirmed = applyMove(
      graph,
      plugged.state,
      { kind: 'confirm-route', callerId: 'caller-silas' },
      { timestampOffsetMs: 20 },
    );
    assert.equal(confirmed.status, 'rejected');
    if (confirmed.status !== 'rejected') {
      return;
    }
    assert.equal(confirmed.rejection.reason, 'ordering');
    assert.equal(confirmed.state.plugs.get('caller-silas'), 'destination-cellar');
    assert.equal(confirmed.events[0]?.type, 'ROUTE_REJECTED');
  });
});
