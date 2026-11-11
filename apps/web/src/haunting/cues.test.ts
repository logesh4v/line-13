import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GameEvent } from '../contracts.ts';
import { SLICE_EPISODE } from '../episode/slice-episode.ts';
import { replay } from '../game/reducer.ts';
import type { GameAction } from '../game/types.ts';
import { DEFAULT_SETTINGS } from '../settings/settings.ts';
import {
  activeCues,
  cuesForEvent,
  cuesForEvents,
  silentCaptions,
  strongestOnChannel,
} from './cues.ts';

const EPISODE = SLICE_EPISODE;
const MUTED = { ...DEFAULT_SETTINGS, muted: true };
const STILL = { ...DEFAULT_SETTINGS, reducedMotion: true };

const RINGING: GameEvent = {
  type: 'CALL_RINGING',
  sequence: 1,
  timestampOffsetMs: 0,
  callerId: 'caller-ruth',
  lineId: 'line-03',
};

const ANSWERED: GameEvent = {
  type: 'CALL_ANSWERED',
  sequence: 2,
  timestampOffsetMs: 50,
  callerId: 'caller-ruth',
};

const REJECTED: GameEvent = {
  type: 'ROUTE_REJECTED',
  sequence: 3,
  timestampOffsetMs: 100,
  callerId: 'caller-ruth',
  destinationId: 'destination-morgue',
  reason: 'constraint',
};

describe('reviewed event-to-cue integration', () => {
  it('rings a visible lamp, synthesizes a bell, and focuses the line', () => {
    const channels = cuesForEvent(EPISODE, RINGING, DEFAULT_SETTINGS, 0)
      .map((entry) => entry.cue.channel)
      .sort();
    assert.deepEqual(channels, ['camera', 'lamp', 'sound']);
  });

  it('turns a rejected route into visible, audible, and tactile consequences', () => {
    const channels = cuesForEvent(EPISODE, REJECTED, DEFAULT_SETTINGS, 0)
      .map((entry) => entry.cue.channel)
      .sort();
    assert.deepEqual(channels, ['environment', 'haptic', 'lamp', 'sound', 'transcript']);
  });

  it('maps crossed speech instead of silently dropping the event', () => {
    const crossed: GameEvent = {
      type: 'CALL_BLEED_STARTED',
      sequence: 4,
      timestampOffsetMs: 150,
      sourceCallerId: 'caller-ruth',
      affectedCallerId: 'caller-ruth',
    };
    const channels = new Set(
      cuesForEvent(EPISODE, crossed, DEFAULT_SETTINGS, 0).map(
        (entry) => entry.cue.channel,
      ),
    );
    assert.equal(channels.has('voice-filter'), true);
    assert.equal(channels.has('environment'), true);
  });

  it('traces every cue to the event sequence that caused it', () => {
    for (const entry of cuesForEvent(EPISODE, REJECTED, DEFAULT_SETTINGS, 0)) {
      assert.equal(entry.eventSequence, REJECTED.sequence);
    }
  });
});

describe('sound cut and subtitles', () => {
  it('replaces an inaudible effect with the visual signal it declares', () => {
    const sound = cuesForEvent(EPISODE, REJECTED, MUTED, 0).find(
      (entry) => entry.cue.channel === 'sound',
    );
    assert.ok(sound !== undefined);
    assert.equal(sound.audible, false);
    assert.equal(sound.visualSignal, true);
  });

  it('uses the exact authored caller subtitle when speech is muted', () => {
    const voice = cuesForEvent(EPISODE, ANSWERED, MUTED, 0).find(
      (entry) => entry.cue.channel === 'voice-filter',
    );
    assert.ok(voice !== undefined);
    assert.equal(voice.caption, EPISODE.callers[0]?.subtitle);
  });

  it('leaves sound audible after the player unlocks it', () => {
    const sound = cuesForEvent(EPISODE, REJECTED, DEFAULT_SETTINGS, 0).find(
      (entry) => entry.cue.channel === 'sound',
    );
    assert.ok(sound !== undefined);
    assert.equal(sound.audible, true);
    assert.equal(sound.caption, null);
  });

  it('never leaves an inaudible authored channel without an alternative', () => {
    const resolved = cuesForEvents(EPISODE, [RINGING, ANSWERED, REJECTED], MUTED);
    for (const entry of resolved) {
      if (entry.cue.channel !== 'sound' && entry.cue.channel !== 'voice-filter') {
        continue;
      }
      assert.ok(
        entry.caption !== null || entry.visualSignal,
        `cue ${entry.cue.id} is inaudible and imperceptible`,
      );
    }
  });

  it('lists duplicate spoken captions only once', () => {
    const captions = silentCaptions(
      cuesForEvents(EPISODE, [ANSWERED, { ...ANSWERED, sequence: 4 }], MUTED),
    );
    assert.deepEqual(captions, [EPISODE.callers[0]?.subtitle]);
  });
});

describe('motion held', () => {
  it('uses declared still alternatives and suppresses haptics', () => {
    const resolved = cuesForEvent(EPISODE, REJECTED, STILL, 0);
    const environment = resolved.find((entry) => entry.cue.channel === 'environment');
    const haptic = resolved.find((entry) => entry.cue.channel === 'haptic');
    assert.ok(environment !== undefined);
    assert.equal(environment.motion, 'static');
    assert.ok(haptic !== undefined);
    assert.equal(haptic.motion, 'none');
  });

  it('leaves motion full when the switch is not thrown', () => {
    for (const entry of cuesForEvent(EPISODE, REJECTED, DEFAULT_SETTINGS, 0)) {
      assert.equal(entry.motion, 'full');
    }
  });
});

describe('cue lifetime and replay', () => {
  it('expires each cue after its declared duration', () => {
    const resolved = cuesForEvent(EPISODE, RINGING, DEFAULT_SETTINGS, 1000);
    assert.equal(activeCues(resolved, 1100).length, resolved.length);
    assert.equal(activeCues(resolved, 10_000).length, 0);
  });

  it('selects the strongest live cue on a channel', () => {
    const lamp = strongestOnChannel(
      cuesForEvents(EPISODE, [RINGING, REJECTED], DEFAULT_SETTINGS),
      'lamp',
    );
    assert.ok(lamp !== null);
    assert.equal(lamp.cue.intensity, 1);
  });

  it('resolves byte-identical cues for the same complete event log', () => {
    const actions: readonly GameAction[] = [
      { type: 'OPEN_EXCHANGE', atMs: 0 },
      { type: 'FINISH_INTRO', atMs: 6000, skipped: false },
      { type: 'ANSWER_CALL', atMs: 6400, callerId: 'caller-ruth' },
      { type: 'LIFT_CORD', atMs: 7000, callerId: 'caller-ruth' },
      { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-morgue' },
      { type: 'CLOSE_CIRCUIT', atMs: 8000 },
      { type: 'PULL_CORD', atMs: 8600 },
      { type: 'LIFT_CORD', atMs: 8800, callerId: 'caller-ruth' },
      { type: 'PLUG_CORD', atMs: 9200, destinationId: 'destination-bell-tower' },
      { type: 'CLOSE_CIRCUIT', atMs: 9800 },
      { type: 'SELECT_ENDING', atMs: 11_000, endingId: 'ending-first-connection' },
    ];
    const log = replay(actions, EPISODE).events;
    assert.deepEqual(
      cuesForEvents(EPISODE, log, DEFAULT_SETTINGS),
      cuesForEvents(EPISODE, log, DEFAULT_SETTINGS),
    );
  });

  it('drives all presentation channels needed by the vertical slice', () => {
    const actions: readonly GameAction[] = [
      { type: 'OPEN_EXCHANGE', atMs: 0 },
      { type: 'FINISH_INTRO', atMs: 6000, skipped: false },
      { type: 'ANSWER_CALL', atMs: 6400, callerId: 'caller-ruth' },
      { type: 'LIFT_CORD', atMs: 7000, callerId: 'caller-ruth' },
      { type: 'PLUG_CORD', atMs: 7400, destinationId: 'destination-morgue' },
      { type: 'CLOSE_CIRCUIT', atMs: 8000 },
      { type: 'PULL_CORD', atMs: 8600 },
      { type: 'LIFT_CORD', atMs: 8800, callerId: 'caller-ruth' },
      { type: 'PLUG_CORD', atMs: 9200, destinationId: 'destination-bell-tower' },
      { type: 'CLOSE_CIRCUIT', atMs: 9800 },
      { type: 'SELECT_ENDING', atMs: 11_000, endingId: 'ending-first-connection' },
    ];
    const channels = new Set(
      cuesForEvents(EPISODE, replay(actions, EPISODE).events, DEFAULT_SETTINGS).map(
        (entry) => entry.cue.channel,
      ),
    );
    for (const channel of ['lamp', 'transcript', 'sound', 'environment', 'ending-transition']) {
      assert.ok(channels.has(channel as never), `the slice never fires a ${channel} cue`);
    }
  });
});
