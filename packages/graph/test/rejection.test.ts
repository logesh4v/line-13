import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGraphModel } from '../src/model.ts';
import { computeProofReport, validateEpisode } from '../src/proof.ts';
import { enumerateSolutions } from '../src/solve.ts';
import { multiSolutionEpisode, noSolutionEpisode, zeroSolutionEpisode } from './fixtures.ts';

function codes(issues: readonly { readonly code: string }[]): readonly string[] {
  return issues.map((issue) => issue.code);
}

describe('zero-solution rejection (R4.3)', () => {
  it('rejects a caller whose required route is also forbidden', () => {
    const built = buildGraphModel(zeroSolutionEpisode);
    assert.equal(built.ok, false);
    if (built.ok) {
      return;
    }
    assert.ok(codes(built.issues).includes('EMPTY_DOMAIN'));

    const report = computeProofReport(zeroSolutionEpisode);
    assert.equal(report.status, 'rejected');
    assert.equal(report.solutionCount, 0);
    assert.equal(report.failingSeed, zeroSolutionEpisode.seed);
    assert.equal(report.intendedSolutionMatches, false);
  });

  it('rejects constraints that admit no complete assignment', () => {
    const built = buildGraphModel(noSolutionEpisode);
    assert.ok(built.ok, JSON.stringify(built.ok ? [] : built.issues));
    if (!built.ok) {
      return;
    }
    assert.equal(enumerateSolutions(built.model).solutions.length, 0);

    const report = computeProofReport(noSolutionEpisode);
    assert.equal(report.status, 'rejected');
    assert.equal(report.solutionCount, 0);
    assert.equal(report.shortestSolutionLength, 0);
    assert.ok(codes(report.issues).includes('NO_SOLUTION'));
    assert.equal(report.failingSeed, noSolutionEpisode.seed);

    const validation = validateEpisode(noSolutionEpisode);
    assert.equal(validation.ok, false);
  });
});

describe('multi-solution rejection (R4.4)', () => {
  it('rejects an unconstrained caller with more than one complete solution', () => {
    const report = computeProofReport(multiSolutionEpisode);
    assert.equal(report.status, 'rejected');
    assert.equal(report.solutionCount, 2);
    assert.equal(report.solutionsTruncated, false);
    assert.ok(codes(report.issues).includes('MULTIPLE_SOLUTIONS'));
    assert.equal(report.failingSeed, multiSolutionEpisode.seed);
    assert.deepEqual([...report.unreachableNodeIds], []);
  });

  it('accepts the same episode when ambiguity is declared authored', () => {
    const report = computeProofReport(multiSolutionEpisode, { allowAmbiguity: true });
    assert.equal(report.status, 'verified', JSON.stringify(report.issues));
    assert.equal(report.solutionCount, 2);
    assert.equal(report.intendedSolutionMatches, true);
    assert.equal(report.failingSeed, null);
    assert.ok(!codes(report.issues).includes('MULTIPLE_SOLUTIONS'));
  });

  it('reports truncation and still rejects when enumeration is capped', () => {
    const report = computeProofReport(multiSolutionEpisode, { solutionLimit: 1 });
    assert.equal(report.solutionCount, 1);
    assert.equal(report.solutionsTruncated, true);
    assert.equal(report.status, 'rejected');
    assert.ok(codes(report.issues).includes('MULTIPLE_SOLUTIONS'));
  });
});
