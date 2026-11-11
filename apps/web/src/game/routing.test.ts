import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SLICE_EPISODE } from '../episode/slice-episode.ts';
import { evaluateRoute, intendedDestinationFor, intendedRouteStillReachable } from './routing.ts';

const EPISODE = SLICE_EPISODE;
const CALLER = 'caller-ruth';

describe('evaluateRoute', () => {
  it('accepts the destination the episode requires', () => {
    const verdict = evaluateRoute(EPISODE, CALLER, 'destination-bell-tower', []);
    assert.deepEqual(verdict, { ok: true });
  });

  it('refuses a forbidden jack and says why in words', () => {
    const verdict = evaluateRoute(EPISODE, CALLER, 'destination-orchard', []);
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.reason, 'constraint');
      assert.equal(verdict.message, 'The line will not hold there.');
    }
  });

  it('refuses any jack other than the required one', () => {
    for (const destination of EPISODE.destinations) {
      const verdict = evaluateRoute(EPISODE, CALLER, destination.id, []);
      assert.equal(
        verdict.ok,
        destination.id === 'destination-bell-tower',
        `unexpected verdict for ${destination.id}`,
      );
    }
  });

  it('refuses a jack already carrying another caller closed circuit', () => {
    const verdict = evaluateRoute(EPISODE, CALLER, 'destination-bell-tower', [
      { callerId: 'caller-someone-else', destinationId: 'destination-bell-tower', order: 1 },
    ]);
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.reason, 'occupied');
    }
  });

  it('is pure: the same arguments always give the same verdict', () => {
    const once = evaluateRoute(EPISODE, CALLER, 'destination-morgue', []);
    const twice = evaluateRoute(EPISODE, CALLER, 'destination-morgue', []);
    assert.deepEqual(once, twice);
  });
});

describe('the authored solution', () => {
  it('names exactly one intended destination for the caller', () => {
    assert.equal(intendedDestinationFor(EPISODE, CALLER), 'destination-bell-tower');
  });

  it('agrees with the required-route constraint', () => {
    const required = EPISODE.constraints.find(
      (constraint) => constraint.kind === 'required-route' && constraint.callerId === CALLER,
    );
    assert.ok(required !== undefined && required.kind === 'required-route');
    assert.equal(required.destinationId, intendedDestinationFor(EPISODE, CALLER));
  });

  it('stays reachable before anything has been routed', () => {
    assert.equal(intendedRouteStillReachable(EPISODE, CALLER, []), true);
  });

  it('is the only accepted route, so the slice has one solution', () => {
    const accepted = EPISODE.destinations.filter(
      (destination) => evaluateRoute(EPISODE, CALLER, destination.id, []).ok,
    );
    assert.equal(accepted.length, 1);
    assert.equal(EPISODE.solverProof.solutionCount, accepted.length);
  });
});
