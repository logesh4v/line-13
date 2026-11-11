import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeProofReport } from '../src/proof.ts';
import { noSolutionEpisode } from './fixtures.ts';

/**
 * Defect found by the property suite (seed 1, minimized to two callers whose only
 * legal destination is the same jack): the solver counted a shared destination as
 * a solution, but moves.ts refuses the second caller as 'occupied', so the episode
 * was reported `verified` and could never be finished.
 */
describe('shared destination (found by PBT)', () => {
  it('rejects an episode whose only assignment puts two callers on one destination', () => {
    const shared = {
      ...noSolutionEpisode,
      constraints: noSolutionEpisode.constraints.filter((c) => c.kind === 'required-route'),
    };
    const report = computeProofReport(shared);
    assert.equal(report.status, 'rejected');
    assert.equal(report.solutionCount, 0);
    assert.ok(report.issues.some((i) => i.code === 'NO_SOLUTION'));
  });
});
