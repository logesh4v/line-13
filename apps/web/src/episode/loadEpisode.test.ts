import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_EPISODE } from './bundled-episode.ts';
import {
  NOTICE_REMOTE_REFUSED,
  adoptRemoteEpisode,
  loadBundledEpisode,
  openingCaller,
} from './loadEpisode.ts';

describe('the bundled episode', () => {
  it('passes the shared validator, so the judge path never needs the network', () => {
    const load = loadBundledEpisode();
    assert.equal(load.source, 'bundled');
    assert.equal(load.notice, null);
    assert.equal(load.episode.episodeId, 'night-roll-v1');
  });

  it('declares four callers, four intended routes and three endings', () => {
    const { episode } = loadBundledEpisode();
    assert.equal(episode.callers.length, 4);
    assert.equal(episode.intendedRoutes.length, 4);
    assert.equal(episode.endings.length, 3);
  });

  it('carries a solver proof (checked against the solver in bundled-episode.test.ts)', () => {
    assert.equal(BUNDLED_EPISODE.solverProof.status, 'verified');
    assert.notEqual(BUNDLED_EPISODE.solverProof.proofHash, 'pending');
  });

  it('references only clues, destinations and assets it actually declares', () => {
    const { episode } = loadBundledEpisode();
    const clueIds = new Set(episode.clues.map((clue) => clue.id));
    const destinationIds = new Set(episode.destinations.map((destination) => destination.id));
    const assetIds = new Set(episode.assets.map((asset) => asset.id));

    for (const caller of episode.callers) {
      for (const clueId of caller.clueIds) {
        assert.ok(clueIds.has(clueId), `caller references missing clue ${clueId}`);
      }
    }
    for (const clue of episode.clues) {
      if (clue.kind !== 'exclusion') {
        continue;
      }
      for (const destinationId of clue.excludedDestinationIds) {
        assert.ok(destinationIds.has(destinationId), `clue excludes unknown ${destinationId}`);
      }
    }
    for (const cue of episode.cues) {
      if (cue.channel === 'sound') {
        assert.ok(assetIds.has(cue.assetId), `cue references missing asset ${cue.assetId}`);
      }
    }
  });

  it('gives every sound cue a caption, so no cue is audio-only', () => {
    const { episode } = loadBundledEpisode();
    for (const cue of episode.cues) {
      if (cue.channel !== 'sound' && cue.channel !== 'voice-filter') {
        continue;
      }
      assert.notEqual(
        cue.silentAlternative,
        'none',
        `cue ${cue.id} would be silent with no visual equivalent`,
      );
    }
  });

  it('gives every motion cue a reduced-motion alternative', () => {
    const { episode } = loadBundledEpisode();
    for (const cue of episode.cues) {
      if (cue.channel !== 'environment' && cue.channel !== 'camera') {
        continue;
      }
      assert.notEqual(cue.reducedMotionAlternative, 'none', `cue ${cue.id} has no still form`);
    }
  });

  it('ships every spoken caller line with an exact subtitle', () => {
    const { episode } = loadBundledEpisode();
    for (const caller of episode.callers) {
      assert.notEqual(caller.subtitle.trim(), '');
    }
  });
});

describe('the remote boundary', () => {
  it('refuses unknown input and falls back to the bundle with a status line', () => {
    const load = adoptRemoteEpisode({ schemaVersion: '0.9.0', nonsense: true });
    assert.equal(load.source, 'bundled');
    assert.equal(load.notice, NOTICE_REMOTE_REFUSED);
    assert.ok(load.rejectedIssues.length > 0);
    assert.equal(load.episode.episodeId, 'night-roll-v1');
  });

  it('never throws, whatever it is handed', () => {
    const hostile: readonly unknown[] = [
      null,
      undefined,
      0,
      '',
      '<script>alert(1)</script>',
      [],
      { schemaVersion: '1.0.0' },
      { schemaVersion: '1.0.0', publishedAt: 'not-a-date' },
    ];
    for (const value of hostile) {
      const load = adoptRemoteEpisode(value);
      assert.equal(load.source, 'bundled');
      assert.equal(load.notice, NOTICE_REMOTE_REFUSED);
    }
  });

  it('adopts a manifest that does validate', () => {
    const load = adoptRemoteEpisode(structuredClone(BUNDLED_EPISODE));
    assert.equal(load.source, 'remote');
    assert.equal(load.notice, null);
  });
});

describe('openingCaller', () => {
  it('is the first caller the episode declares', () => {
    assert.equal(openingCaller(BUNDLED_EPISODE).id, 'caller-ruth');
  });
});
