import type { EpisodeManifestV1 } from '../contracts.ts';

/**
 * THE NINETY-SECOND SLICE — kept as a single-caller test fixture.
 *
 * This is the ninety-second slice of "The First Ring": one caller, one intended
 * destination, two wrong jacks that are always recoverable, and a miniature
 * ending. It ships inside the bundle so the judge's playthrough needs no
 * network, no account and no model call.
 *
 * Two fields are deliberately honest rather than flattering:
 *
 * - `solverProof.status` is `draft`. The graph engine has not enumerated this
 *   episode yet, so nothing here claims verification it does not have.
 * - the audio assets are synthesized in the browser by the Web Audio exchange,
 *   so they carry no file hash. Each one's `transcript` is the exact caption
 *   shown when sound is cut, which is how an audio cue keeps a visual
 *   equivalent. Milestone 5 replaces them with published Polly files and real
 *   hashes.
 */
export const SLICE_EPISODE = {
  schemaVersion: '1.0.0',
  episodeId: 'first-ring-slice',
  seed: 'line-13-first-ring-v1',
  title: 'The First Ring',

  callers: [
    {
      id: 'caller-ruth',
      displayName: 'Ruth Bell',
      departedOn: 'October 31, 1931',
      initialLineId: 'line-03',
      clueIds: ['clue-ruth-clock', 'clue-ruth-orchard', 'clue-ruth-indoors'],
      subtitle: 'Operator. Put me where the clock rang after midnight.',
    },
  ],

  destinations: [
    {
      id: 'destination-bell-tower',
      label: 'Bell Tower',
      description: 'The clock stopped at three minutes past three.',
    },
    {
      id: 'destination-orchard',
      label: 'Orchard',
      description: 'Something out there has learned her voice.',
    },
    {
      id: 'destination-morgue',
      label: 'Morgue',
      description: 'Cold, catalogued, and nobody waiting.',
    },
  ],

  clues: [
    {
      id: 'clue-ruth-clock',
      kind: 'text',
      text: 'Put me where the clock rang after midnight.',
    },
    {
      id: 'clue-ruth-orchard',
      kind: 'exclusion',
      text: 'Do not place me beside the orchard. Something there has learned my voice.',
      excludedDestinationIds: ['destination-orchard'],
    },
    {
      id: 'clue-ruth-indoors',
      kind: 'exclusion',
      text: 'I did not die indoors, operator. Do not file me with the cold ones.',
      excludedDestinationIds: ['destination-morgue'],
    },
  ],

  constraints: [
    {
      kind: 'required-route',
      callerId: 'caller-ruth',
      destinationId: 'destination-bell-tower',
    },
    {
      kind: 'forbidden-route',
      callerId: 'caller-ruth',
      destinationId: 'destination-orchard',
    },
    {
      kind: 'forbidden-route',
      callerId: 'caller-ruth',
      destinationId: 'destination-morgue',
    },
  ],

  intendedRoutes: [
    {
      callerId: 'caller-ruth',
      destinationId: 'destination-bell-tower',
      order: 1,
    },
  ],

  cues: [
    {
      id: 'cue-ring-line-03',
      triggerEventType: 'CALL_RINGING',
      channel: 'lamp',
      targetId: 'line-03',
      effect: 'ring',
      intensity: 1,
      durationMs: 1800,
      reducedMotionAlternative: 'fade',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-ring-bell',
      triggerEventType: 'CALL_RINGING',
      channel: 'sound',
      assetId: 'sound-bell',
      effect: 'plain',
      intensity: 1,
      durationMs: 1800,
      reducedMotionAlternative: 'none',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-answer-reveal',
      triggerEventType: 'CALL_ANSWERED',
      channel: 'transcript',
      targetId: 'caller-ruth',
      effect: 'reveal',
      intensity: 1,
      durationMs: 2400,
      reducedMotionAlternative: 'static',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-answer-hum',
      triggerEventType: 'CALL_ANSWERED',
      channel: 'sound',
      assetId: 'sound-line-hum',
      effect: 'line-hum',
      intensity: 1,
      durationMs: 2200,
      reducedMotionAlternative: 'none',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-answer-voice',
      triggerEventType: 'CALL_ANSWERED',
      channel: 'voice-filter',
      targetId: 'caller-ruth',
      effect: 'telephone',
      intensity: 1,
      durationMs: 2400,
      reducedMotionAlternative: 'none',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-plug-contact',
      triggerEventType: 'PLUG_INSERTED',
      channel: 'sound',
      assetId: 'sound-jack-contact',
      effect: 'plain',
      intensity: 1,
      durationMs: 320,
      reducedMotionAlternative: 'none',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-unplug-contact',
      triggerEventType: 'PLUG_REMOVED',
      channel: 'sound',
      assetId: 'sound-jack-contact',
      effect: 'plain',
      intensity: 1,
      durationMs: 320,
      reducedMotionAlternative: 'none',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-crossed-lamp',
      triggerEventType: 'ROUTE_REJECTED',
      channel: 'lamp',
      targetId: 'line-03',
      effect: 'flicker',
      intensity: 2,
      durationMs: 900,
      reducedMotionAlternative: 'fade',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-crossed-voltage',
      triggerEventType: 'ROUTE_REJECTED',
      channel: 'environment',
      effect: 'voltage-drop',
      intensity: 2,
      durationMs: 900,
      reducedMotionAlternative: 'fade',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-crossed-static',
      triggerEventType: 'ROUTE_REJECTED',
      channel: 'sound',
      assetId: 'sound-crossed-static',
      effect: 'static',
      intensity: 2,
      durationMs: 1200,
      reducedMotionAlternative: 'none',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-crossed-transcript',
      triggerEventType: 'ROUTE_REJECTED',
      channel: 'transcript',
      targetId: 'caller-ruth',
      effect: 'corrupt',
      intensity: 2,
      durationMs: 1400,
      reducedMotionAlternative: 'static',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-line-13-listens',
      triggerEventType: 'LINE_POSSESSED',
      channel: 'lamp',
      targetId: 'line-13',
      effect: 'flicker',
      intensity: 2,
      durationMs: 1600,
      reducedMotionAlternative: 'fade',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-clue-reveal',
      triggerEventType: 'CLUE_REVEALED',
      channel: 'transcript',
      targetId: 'caller-ruth',
      effect: 'reveal',
      intensity: 1,
      durationMs: 1600,
      reducedMotionAlternative: 'static',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-closed-lamp',
      triggerEventType: 'ROUTE_CONFIRMED',
      channel: 'lamp',
      targetId: 'line-03',
      effect: 'steady',
      intensity: 1,
      durationMs: 1200,
      reducedMotionAlternative: 'none',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-closed-relay',
      triggerEventType: 'ROUTE_CONFIRMED',
      channel: 'sound',
      assetId: 'sound-relay-close',
      effect: 'plain',
      intensity: 1,
      durationMs: 420,
      reducedMotionAlternative: 'none',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-closed-transcript',
      triggerEventType: 'ROUTE_CONFIRMED',
      channel: 'transcript',
      targetId: 'caller-ruth',
      effect: 'restore',
      intensity: 1,
      durationMs: 1800,
      reducedMotionAlternative: 'static',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-line-13-wake',
      triggerEventType: 'FINALE_UNLOCKED',
      channel: 'lamp',
      targetId: 'line-13',
      effect: 'ring',
      intensity: 3,
      durationMs: 2600,
      reducedMotionAlternative: 'fade',
      silentAlternative: 'visual-signal',
    },
    {
      id: 'cue-line-13-bell',
      triggerEventType: 'FINALE_UNLOCKED',
      channel: 'sound',
      assetId: 'sound-bell',
      effect: 'reverse-tail',
      intensity: 3,
      durationMs: 2600,
      reducedMotionAlternative: 'none',
      silentAlternative: 'caption',
    },
    {
      id: 'cue-ending-connect',
      triggerEventType: 'ENDING_SELECTED',
      channel: 'ending-transition',
      endingId: 'ending-first-connection',
      effect: 'connect',
      intensity: 2,
      durationMs: 1600,
      reducedMotionAlternative: 'fade',
      silentAlternative: 'visual-signal',
    },
  ],

  endings: [
    {
      id: 'ending-first-connection',
      label: 'The First Connection',
      description: 'The bell stops. A thirteenth lamp wakes behind you.',
      requiredEventTypes: ['ROUTE_CONFIRMED'],
    },
  ],

  assets: [
    {
      id: 'sound-bell',
      kind: 'audio',
      source: 'webaudio:bell-strike',
      sha256: 'synthesized-at-runtime',
      transcript: 'Exchange bell ringing.',
      voiceEngine: 'original',
    },
    {
      id: 'sound-line-hum',
      kind: 'audio',
      source: 'webaudio:line-hum',
      sha256: 'synthesized-at-runtime',
      transcript: 'The line opens and hums.',
      voiceEngine: 'original',
    },
    {
      id: 'sound-jack-contact',
      kind: 'audio',
      source: 'webaudio:jack-contact',
      sha256: 'synthesized-at-runtime',
      transcript: 'Jack contact.',
      voiceEngine: 'original',
    },
    {
      id: 'sound-crossed-static',
      kind: 'audio',
      source: 'webaudio:crossed-static',
      sha256: 'synthesized-at-runtime',
      transcript: 'Static rises. Other voices cross the line.',
      voiceEngine: 'original',
    },
    {
      id: 'sound-relay-close',
      kind: 'audio',
      source: 'webaudio:relay-close',
      sha256: 'synthesized-at-runtime',
      transcript: 'The relay closes.',
      voiceEngine: 'original',
    },
  ],

  solverProof: {
    status: 'draft',
    solutionCount: 1,
    shortestSolutionLength: 1,
    unreachableNodeIds: [],
    proofHash: 'pending-graph-validator',
    validatorVersion: '0.1.0',
  },

  publishedAt: '2026-11-03T18:09:00.000Z',

  integrity: {
    algorithm: 'SHA-256',
    manifestHash: 'pending-publication',
  },
} satisfies EpisodeManifestV1;

