import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeProofReport } from '@line-13/graph';

import type { EpisodeManifestV1 } from '../contracts.ts';
import { cuesForEvents } from '../haunting/cues.ts';
import {
  ENDING_CLEAN,
  ENDING_CROSSED,
  ENDING_POSSESSED,
  endingIdFor,
} from '../game/endings.ts';
import { LINE_13_VOICE, replay } from '../game/reducer.ts';
import type { GameAction, GameState } from '../game/types.ts';
import { DEFAULT_SETTINGS } from '../settings/settings.ts';
import { BUNDLED_EPISODE } from './bundled-episode.ts';

const EPISODE: EpisodeManifestV1 = BUNDLED_EPISODE;

const RUTH = 'caller-ruth';
const AMOS = 'caller-amos';
const TOBIAS = 'caller-tobias';
const INES = 'caller-ines';

const TOWER = 'destination-bell-tower';
const ORCHARD = 'destination-orchard';
const MORGUE = 'destination-morgue';
const CHAPEL = 'destination-chapel';
const CISTERN = 'destination-cistern';

const SOLUTION: Readonly<Record<string, string>> = {
  [RUTH]: TOWER,
  [AMOS]: ORCHARD,
  [TOBIAS]: CISTERN,
  [INES]: MORGUE,
};

/** Tiny driver: every action gets the next tick so the log stays ordered. */
class Shift {
  private readonly actions: GameAction[] = [];
  private clock = 0;

  public constructor() {
    this.do({ type: 'OPEN_EXCHANGE', atMs: 0 });
    this.do({ type: 'FINISH_INTRO', atMs: 0, skipped: true });
  }

  private do(action: GameAction): this {
    this.clock += 500;
    this.actions.push({ ...action, atMs: this.clock });
    return this;
  }

  public answer(callerId: string): this {
    return this.do({ type: 'ANSWER_CALL', atMs: 0, callerId });
  }

  public lift(callerId: string): this {
    return this.do({ type: 'LIFT_CORD', atMs: 0, callerId });
  }

  public plug(destinationId: string): this {
    return this.do({ type: 'PLUG_CORD', atMs: 0, destinationId });
  }

  public close(): this {
    return this.do({ type: 'CLOSE_CIRCUIT', atMs: 0 });
  }

  public pull(): this {
    return this.do({ type: 'PULL_CORD', atMs: 0 });
  }

  public reopen(callerId: string): this {
    return this.do({ type: 'REOPEN_CIRCUIT', atMs: 0, callerId });
  }

  /** Lift, plug and try to close a circuit. */
  public route(callerId: string, destinationId: string): this {
    return this.lift(callerId).plug(destinationId).close();
  }

  /** A wrong attempt followed by the pull that clears it. */
  public cross(callerId: string, destinationId: string): this {
    return this.route(callerId, destinationId).pull();
  }

  public ending(): this {
    const state = this.state();
    return this.do({
      type: 'SELECT_ENDING',
      atMs: 0,
      endingId: endingIdFor(state.crossedLineCount),
    });
  }

  public state(): GameState {
    return replay(this.actions, EPISODE);
  }

  public log(): readonly GameAction[] {
    return this.actions;
  }
}

/** The whole night, answered in ring order and routed correctly. */
function clean(shift: Shift = new Shift()): Shift {
  for (const callerId of [RUTH, AMOS, TOBIAS, INES]) {
    shift.answer(callerId).route(callerId, SOLUTION[callerId] ?? '');
  }
  return shift;
}

describe('the bundled episode is a verified puzzle', () => {
  const report = computeProofReport(EPISODE);

  it('has exactly one intended solution and a complete recovery sweep', () => {
    assert.equal(report.status, 'verified', JSON.stringify(report.issues));
    assert.equal(report.solutionCount, 1);
    assert.equal(report.solutionsTruncated, false);
    assert.equal(report.intendedSolutionMatches, true);
    assert.equal(report.recoverability.exhaustive, true);
    assert.deepEqual([...report.recoverability.unrecoverableStateKeys], []);
    assert.deepEqual([...report.unreachableNodeIds], [CHAPEL]);
  });

  it('ships a manifest proof that is the solver proof, not a hand-typed one', () => {
    assert.equal(EPISODE.solverProof.status, report.status);
    assert.equal(EPISODE.solverProof.solutionCount, report.solutionCount);
    assert.equal(EPISODE.solverProof.shortestSolutionLength, report.shortestSolutionLength);
    assert.equal(EPISODE.solverProof.proofHash, report.proofHash);
    assert.equal(EPISODE.solverProof.validatorVersion, report.validatorVersion);
    assert.deepEqual([...EPISODE.solverProof.unreachableNodeIds], [...report.unreachableNodeIds]);
  });

  it('is solvable from the opening clues alone: every recovery whisper is redundant', () => {
    const whispers = new Set(
      EPISODE.callers.map((caller) => caller.clueIds[caller.clueIds.length - 1] ?? ''),
    );
    const stripped: EpisodeManifestV1 = {
      ...EPISODE,
      clues: EPISODE.clues.filter((clue) => !whispers.has(clue.id)),
      callers: EPISODE.callers.map((caller) => ({
        ...caller,
        clueIds: caller.clueIds.filter((id) => !whispers.has(id)),
      })),
    };
    const opening = computeProofReport(stripped);
    assert.equal(opening.status, 'verified', JSON.stringify(opening.issues));
    assert.equal(opening.solutionCount, 1);
  });

  it('gives every caller an exact subtitle and a route the players can reach', () => {
    for (const caller of EPISODE.callers) {
      assert.notEqual(caller.subtitle.trim(), '');
      assert.ok(EPISODE.intendedRoutes.some((route) => route.callerId === caller.id));
    }
  });
});

describe('a clean night', () => {
  it('rings one lamp at a time, in order, as each call is answered', () => {
    const shift = new Shift();
    assert.deepEqual(shift.state().callerStatus, { [RUTH]: 'ringing' });
    shift.answer(RUTH);
    assert.equal(shift.state().callerStatus[AMOS], 'ringing');
    assert.equal(shift.state().callerStatus[TOBIAS], undefined);
  });

  it('closes four circuits, wakes Line 13 and earns the first ending', () => {
    const state = clean().state();
    assert.equal(state.phase, 'LINE_13');
    assert.equal(state.line13Awake, true);
    assert.equal(state.crossedLineCount, 0);
    assert.equal(state.confirmedRoutes.length, 4);
    assert.equal(state.haunt, 0);

    const ended = clean().ending().state();
    assert.equal(ended.phase, 'ENDING');
    assert.equal(ended.endingId, ENDING_CLEAN);
  });

  it('never fires a rejection, a bleed or a possession', () => {
    const types = new Set(clean().state().events.map((event) => event.type));
    for (const forbidden of ['ROUTE_REJECTED', 'CALL_BLEED_STARTED', 'LINE_POSSESSED']) {
      assert.equal(types.has(forbidden as never), false, `${forbidden} fired on a clean night`);
    }
  });

  it('reduces to identical state every time the same log is replayed', () => {
    const shift = clean();
    assert.deepEqual(replay(shift.log(), EPISODE), replay(shift.log(), EPISODE));
  });
});

describe('wrong routes escalate, and every one is recoverable', () => {
  it('first crossed line: a different caller cuts in and the haunt is 1', () => {
    const state = new Shift().answer(RUTH).route(RUTH, MORGUE).state();
    assert.equal(state.crossedLineCount, 1);
    assert.equal(state.haunt, 1);
    assert.equal(state.cord.kind, 'rejected');
    // Only one other lamp is lit yet, and it is Amos.
    const bleed = state.events.find((event) => event.type === 'CALL_BLEED_STARTED');
    assert.ok(bleed !== undefined && bleed.type === 'CALL_BLEED_STARTED');
    assert.equal(bleed.affectedCallerId, AMOS);
    assert.equal(state.phase, 'ROUTING');
  });

  it('second, third and fourth: LINE 13 listens, speaks, then takes the line', () => {
    const shift = new Shift().answer(RUTH);
    const seen: number[] = [];
    for (const wrong of [MORGUE, ORCHARD, CHAPEL, CISTERN]) {
      shift.cross(RUTH, wrong);
      const state = shift.state();
      seen.push(state.haunt);
      if (state.crossedLineCount >= 2) {
        const last = state.transcript.filter((line) => line.speaker === 'line-13').at(-1);
        assert.equal(last?.text, LINE_13_VOICE[state.crossedLineCount - 2]);
        assert.equal(last?.spoken, true, 'LINE 13 speech carries an exact subtitle');
      }
    }
    assert.deepEqual(seen, [1, 2, 3, 4]);
    const state = shift.state();
    assert.equal(state.phase, 'ESCALATION');
    assert.deepEqual(state.possessedLineIds, ['line-13']);
    const intensities = state.events.flatMap((event) =>
      event.type === 'LINE_POSSESSED' ? [event.intensity] : [],
    );
    assert.deepEqual(intensities, [1, 2, 3]);
  });

  it('the haunt level never falls once raised, and the fifth crossing adds no new level', () => {
    const shift = new Shift().answer(RUTH);
    for (const wrong of [MORGUE, ORCHARD, CHAPEL, CISTERN, MORGUE]) {
      shift.cross(RUTH, wrong);
    }
    assert.equal(shift.state().haunt, 4);
    shift.route(RUTH, TOWER);
    assert.equal(shift.state().haunt, 4);
  });

  it('all wrong first, then recovery: every wrong jack for every caller, then the board completes', () => {
    const shift = new Shift();
    for (const callerId of [RUTH, AMOS, TOBIAS, INES]) {
      shift.answer(callerId);
      for (const destination of EPISODE.destinations) {
        if (destination.id !== SOLUTION[callerId]) {
          shift.cross(callerId, destination.id);
        }
      }
      shift.route(callerId, SOLUTION[callerId] ?? '');
    }
    const state = shift.state();
    assert.equal(state.phase, 'LINE_13');
    assert.equal(state.confirmedRoutes.length, 4);
    assert.ok(state.crossedLineCount >= 4);
  });

  it('wrong route FIRST on a first call: pulled back, nothing lost, the call still routes', () => {
    const shift = new Shift().answer(RUTH).cross(RUTH, ORCHARD);
    assert.equal(shift.state().cord.kind, 'idle');
    shift.route(RUTH, TOWER);
    assert.equal(shift.state().callerStatus[RUTH], 'connected');
  });

  it('a wrong plug that the rules allow can be undone with a reopen', () => {
    // Tobias looks like a legal fit for the tower on his own clues. Taking it
    // strands Ruth, whose only route is the tower; the board says whose
    // circuit is in the way and reopening it frees the jack.
    const shift = new Shift().answer(RUTH).answer(AMOS).answer(TOBIAS);
    shift.route(TOBIAS, TOWER);
    assert.equal(shift.state().callerStatus[TOBIAS], 'connected');

    shift.lift(RUTH).plug(TOWER).close();
    const stuck = shift.state();
    assert.equal(stuck.cord.kind, 'rejected');
    assert.ok(
      stuck.transcript.some((line) => line.text.includes("Tobias Wren's circuit")),
      'the refusal names the circuit in the way',
    );
    shift.pull().reopen(TOBIAS);
    assert.equal(shift.state().callerStatus[TOBIAS], 'answered');
    assert.equal(shift.state().confirmedRoutes.length, 0);

    shift.route(RUTH, TOWER).route(AMOS, ORCHARD).route(TOBIAS, CISTERN);
    shift.answer(INES).route(INES, MORGUE);
    assert.equal(shift.state().phase, 'LINE_13');
  });

  it('answering Ines before Amos is refused as an ordering rule, and recoverable', () => {
    const shift = new Shift().answer(RUTH).answer(AMOS).answer(TOBIAS).answer(INES);
    shift.route(INES, MORGUE);
    const refused = shift.state().events.find((event) => event.type === 'ROUTE_REJECTED');
    assert.ok(refused !== undefined && refused.type === 'ROUTE_REJECTED');
    assert.equal(refused.reason, 'ordering');
    shift.pull().route(RUTH, TOWER).route(AMOS, ORCHARD).route(TOBIAS, CISTERN).route(INES, MORGUE);
    assert.equal(shift.state().phase, 'LINE_13');
  });

  it('a crossed line reveals the whisper clue, which a clean night never needs', () => {
    const clean1 = new Shift().answer(RUTH).state();
    assert.equal(clean1.revealedClueIds.includes('clue-ruth-indoors'), false);
    const crossed = new Shift().answer(RUTH).route(RUTH, MORGUE).state();
    assert.equal(crossed.revealedClueIds.includes('clue-ruth-indoors'), true);
  });
});

describe('three endings, driven by the routes', () => {
  it('maps crossed lines to the ending thresholds', () => {
    assert.equal(endingIdFor(0), ENDING_CLEAN);
    assert.equal(endingIdFor(1), ENDING_CROSSED);
    assert.equal(endingIdFor(3), ENDING_CROSSED);
    assert.equal(endingIdFor(4), ENDING_POSSESSED);
    assert.equal(endingIdFor(9), ENDING_POSSESSED);
  });

  it('reaches the crossed ending after one wrong route', () => {
    const shift = new Shift().answer(RUTH).cross(RUTH, MORGUE);
    shift.route(RUTH, TOWER);
    for (const callerId of [AMOS, TOBIAS, INES]) {
      shift.answer(callerId).route(callerId, SOLUTION[callerId] ?? '');
    }
    const ended = shift.ending().state();
    assert.equal(ended.endingId, ENDING_CROSSED);
    assert.equal(ended.phase, 'ENDING');
  });

  it('reaches the possessed ending after four wrong routes', () => {
    const shift = new Shift().answer(RUTH);
    for (const wrong of [MORGUE, ORCHARD, CHAPEL, CISTERN]) {
      shift.cross(RUTH, wrong);
    }
    shift.route(RUTH, TOWER);
    for (const callerId of [AMOS, TOBIAS, INES]) {
      shift.answer(callerId).route(callerId, SOLUTION[callerId] ?? '');
    }
    const ended = shift.ending().state();
    assert.equal(ended.endingId, ENDING_POSSESSED);
  });

  it('refuses a mismatched ending request', () => {
    const shift = clean();
    const state = shift.state();
    const wrong = replay(
      [...shift.log(), { type: 'SELECT_ENDING', atMs: 99_000, endingId: ENDING_POSSESSED }],
      EPISODE,
    );
    assert.equal(wrong.phase, state.phase);
    assert.equal(wrong.endingId, null);
  });

  it('declares, for each ending, events the log really contains when it is earned', () => {
    const logs = [
      clean().ending().state(),
      (() => {
        const s = new Shift().answer(RUTH).cross(RUTH, MORGUE).route(RUTH, TOWER);
        for (const c of [AMOS, TOBIAS, INES]) {
          s.answer(c).route(c, SOLUTION[c] ?? '');
        }
        return s.ending().state();
      })(),
    ];
    for (const state of logs) {
      const ending = EPISODE.endings.find((candidate) => candidate.id === state.endingId);
      assert.ok(ending !== undefined);
      const seen = new Set(state.events.map((event) => event.type));
      for (const type of ending.requiredEventTypes) {
        assert.ok(seen.has(type), `${ending.id} requires ${type}`);
      }
    }
  });
});

describe('every audible beat has a caption or a visual path', () => {
  const nights: readonly Shift[] = [
    clean(),
    (() => {
      const s = new Shift().answer(RUTH);
      for (const wrong of [MORGUE, ORCHARD, CHAPEL, CISTERN]) {
        s.cross(RUTH, wrong);
      }
      s.route(RUTH, TOWER);
      for (const c of [AMOS, TOBIAS, INES]) {
        s.answer(c).route(c, SOLUTION[c] ?? '');
      }
      return s.ending();
    })(),
  ];

  it('muted: no sound or voice cue is left without a caption or a visual signal', () => {
    const muted = { ...DEFAULT_SETTINGS, muted: true };
    for (const night of nights) {
      const cues = cuesForEvents(EPISODE, night.state().events, muted);
      const audible = cues.filter(
        (entry) => entry.cue.channel === 'sound' || entry.cue.channel === 'voice-filter',
      );
      assert.ok(audible.length > 0);
      for (const entry of audible) {
        assert.ok(
          entry.caption !== null || entry.visualSignal,
          `${entry.cue.channel}/${entry.cue.id} has no silent path`,
        );
      }
    }
  });

  it('reduced motion: every motion cue resolves to a still alternative or is dropped on purpose', () => {
    const still = { ...DEFAULT_SETTINGS, reducedMotion: true };
    for (const night of nights) {
      for (const entry of cuesForEvents(EPISODE, night.state().events, still)) {
        if (entry.cue.channel === 'environment' || entry.cue.channel === 'camera') {
          assert.notEqual(entry.motion, 'full', `${entry.cue.id} still moves`);
        }
      }
    }
  });
});
