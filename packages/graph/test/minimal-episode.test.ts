import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGraphModel } from '../src/model.ts';
import { computeProofReport, VALIDATOR_VERSION } from '../src/proof.ts';
import { enumerateSolutions, intendedSolution, solutionKey } from '../src/solve.ts';
import { minimalEpisode } from './fixtures.ts';

describe('minimal bundled episode', () => {
  it('builds a model whose domains reflect every forbidden route', () => {
    const built = buildGraphModel(minimalEpisode);
    assert.ok(built.ok, `build failed: ${JSON.stringify(built.ok ? [] : built.issues)}`);
    if (!built.ok) {
      return;
    }
    assert.deepEqual([...built.model.callerOrder], ['caller-ruth']);
    assert.deepEqual([...(built.model.domains.get('caller-ruth') ?? [])], ['destination-bell-tower']);
    assert.equal(built.model.clueDependencyCount, 1);
    assert.deepEqual([...built.model.canonicalOrder], ['caller-ruth']);
  });

  it('enumerates exactly the authored solution', () => {
    const built = buildGraphModel(minimalEpisode);
    assert.ok(built.ok);
    if (!built.ok) {
      return;
    }
    const { solutions, truncated } = enumerateSolutions(built.model);
    assert.equal(truncated, false);
    assert.equal(solutions.length, 1);
    const solution = solutions[0];
    assert.ok(solution !== undefined);
    if (solution === undefined) {
      return;
    }
    assert.deepEqual([...solution.assignments], [
      { callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
    ]);
    assert.deepEqual([...solution.routes], [
      { callerId: 'caller-ruth', destinationId: 'destination-bell-tower', order: 1 },
    ]);
    const authored = intendedSolution(built.model);
    assert.ok(authored !== null);
    if (authored === null) {
      return;
    }
    assert.equal(solutionKey(solution), solutionKey(authored));
  });

  it('verifies the episode and reports the decoy destination as unreachable', () => {
    const report = computeProofReport(minimalEpisode);
    assert.equal(report.status, 'verified', JSON.stringify(report.issues));
    assert.equal(report.validatorVersion, VALIDATOR_VERSION);
    assert.equal(report.solutionCount, 1);
    assert.equal(report.solutionsTruncated, false);
    assert.equal(report.shortestSolutionLength, 1);
    assert.equal(report.intendedSolutionMatches, true);
    assert.equal(report.failingSeed, null);
    assert.deepEqual([...report.unreachableNodeIds], ['destination-orchard']);
    assert.deepEqual([...report.recoverability.unrecoverableStateKeys], []);
    assert.equal(report.recoverability.exhaustive, true);
    assert.ok(report.recoverability.statesChecked > 0);
  });

  it('measures difficulty from solution length, clue dependencies and decoys', () => {
    const report = computeProofReport(minimalEpisode);
    assert.deepEqual(report.difficulty, {
      score: 20,
      solutionLength: 1,
      clueDependencyCount: 1,
      decoyDestinationCount: 1,
    });
  });

  it('produces a byte-stable proof hash across runs', () => {
    const first = computeProofReport(minimalEpisode);
    const second = computeProofReport(minimalEpisode);
    assert.equal(first.proofHash, second.proofHash);
    assert.equal(first.proofHash.length, 16);
    assert.deepEqual(first, second);
  });
});
