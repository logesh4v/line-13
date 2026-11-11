import type {
  Caller,
  Clue,
  Destination,
  Ending,
  EpisodeAsset,
  EpisodeManifestV1,
  HauntCue,
  RouteConstraint,
} from '../contracts.ts';

/**
 * THE BUNDLED EPISODE: "The Night Roll", four callers and the Line 13 finale.
 *
 * This is a first-class production path. It ships inside the bundle so the
 * judge's playthrough needs no network, no account and no model call.
 *
 * Every caller's LAST clue is a recovery whisper: it is only spoken after a
 * crossed line, and it is redundant by construction. The opening clues alone
 * (everything except each caller's last clue) already pin down exactly one
 * solution, which `bundled-episode.test.ts` proves with the graph solver, so a
 * player can finish with zero crossed lines and a player who crosses a line is
 * only ever helped, never required to.
 *
 * The audio assets are synthesized in the browser by the Web Audio exchange, so
 * they carry no file hash. Each one's `transcript` is the exact caption shown
 * when sound is cut. Milestone 5 replaces caller speech with Polly files.
 */

const callers: readonly Caller[] = [
  {
    id: 'caller-ruth',
    displayName: 'Ruth Bell',
    departedOn: 'October 31, 1931',
    initialLineId: 'line-03',
    clueIds: ['clue-ruth-clock', 'clue-ruth-orchard', 'clue-ruth-indoors'],
    subtitle: 'Operator. Put me where the clock rang after midnight.',
  },
  {
    id: 'caller-amos',
    displayName: 'Amos Kettle',
    departedOn: 'November 2, 1931',
    initialLineId: 'line-07',
    clueIds: ['clue-amos-ground', 'clue-amos-cold', 'clue-amos-tower'],
    subtitle: 'Operator. Forty winters I dug that hill. Find me a place where the ground is mine.',
  },
  {
    id: 'caller-tobias',
    displayName: 'Tobias Wren',
    departedOn: 'November 4, 1931',
    initialLineId: 'line-11',
    clueIds: ['clue-tobias-water', 'clue-tobias-dry', 'clue-tobias-tower'],
    subtitle: 'Operator. The river kept the ferry and let go of the bell. Ring me through.',
  },
  {
    id: 'caller-ines',
    displayName: 'Ines Marrow',
    departedOn: 'November 6, 1931',
    initialLineId: 'line-09',
    clueIds: ['clue-ines-count', 'clue-ines-quiet', 'clue-ines-after-amos', 'clue-ines-water'],
    subtitle: 'Operator. Nine beds on my ward and I counted every one. Count me last.',
  },
];

const destinations: readonly Destination[] = [
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
  {
    id: 'destination-chapel',
    label: 'Chapel',
    description: 'Sealed since the fire. Nobody has asked for it.',
  },
  {
    id: 'destination-cistern',
    label: 'Cistern',
    description: 'Black water under the mill, standing still.',
  },
];

const clues: readonly Clue[] = [
  { id: 'clue-ruth-clock', kind: 'text', text: 'Put me where the clock rang after midnight.' },
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

  {
    id: 'clue-amos-ground',
    kind: 'text',
    text: 'Forty winters on that hill, operator. I want the ground, not a roof over me.',
  },
  {
    id: 'clue-amos-cold',
    kind: 'exclusion',
    text: 'No cold drawers, no standing water, and the chapel door was always shut to me.',
    excludedDestinationIds: ['destination-morgue', 'destination-cistern', 'destination-chapel'],
  },
  {
    id: 'clue-amos-tower',
    kind: 'text',
    text: 'The bell tower belongs to Ruth Bell. Leave me the apple trees.',
  },

  {
    id: 'clue-tobias-water',
    kind: 'text',
    text: 'I went under at the mill race. Put me where the water still stands.',
  },
  {
    id: 'clue-tobias-dry',
    kind: 'exclusion',
    text: 'Not the orchard, not the drawers, not the chapel. None of them are wet.',
    excludedDestinationIds: ['destination-orchard', 'destination-morgue', 'destination-chapel'],
  },
  {
    id: 'clue-tobias-tower',
    kind: 'text',
    text: 'The tower already has its operator. Do not ring me there.',
  },

  {
    id: 'clue-ines-count',
    kind: 'text',
    text: 'Nine beds on my ward, and I counted them all. Count me last.',
  },
  {
    id: 'clue-ines-quiet',
    kind: 'exclusion',
    text: 'No bells, no weather, no psalms. I want it quiet.',
    excludedDestinationIds: ['destination-bell-tower', 'destination-orchard', 'destination-chapel'],
  },
  {
    id: 'clue-ines-after-amos',
    kind: 'relationship',
    text: 'Amos Kettle goes in before me. He always did the heavy lifting.',
    relatedCallerId: 'caller-amos',
    relation: 'after',
  },
  {
    id: 'clue-ines-water',
    kind: 'exclusion',
    text: 'And keep me out of the water. I have seen what it does.',
    excludedDestinationIds: ['destination-cistern'],
  },
];

/**
 * Authored truth that no clue states on its own: Ruth's tower, and that no two
 * callers may share a jack (the board physically holds one circuit per jack,
 * so the solver must only ever count injective assignments).
 */
const constraints: readonly RouteConstraint[] = [
  { kind: 'required-route', callerId: 'caller-ruth', destinationId: 'destination-bell-tower' },
  { kind: 'distinct-destination', callerIds: ['caller-ruth', 'caller-amos'] },
  { kind: 'distinct-destination', callerIds: ['caller-ruth', 'caller-tobias'] },
  { kind: 'distinct-destination', callerIds: ['caller-ruth', 'caller-ines'] },
  { kind: 'distinct-destination', callerIds: ['caller-amos', 'caller-tobias'] },
  { kind: 'distinct-destination', callerIds: ['caller-amos', 'caller-ines'] },
  { kind: 'distinct-destination', callerIds: ['caller-tobias', 'caller-ines'] },
];

const SOUND_ASSETS: readonly EpisodeAsset[] = [
  ['sfx.bell.ring', 'bell-strike', 'Exchange bell ringing.'],
  ['sfx.bell.thirteen', 'bell-thirteen', 'The thirteenth bell rings, one beat too slow.'],
  ['sfx.jack.contact', 'jack-contact', 'Jack contact.'],
  ['sfx.cord.pull', 'cord-pull', 'Cloth cord drawn from the jack.'],
  ['sfx.relay.click', 'relay-close', 'The relay closes.'],
  ['sfx.line.static', 'crossed-static', 'Static rises. Other voices cross the line.'],
  ['sfx.line.hum', 'line-hum', 'The line hums, and a second voice breathes on it.'],
  ['sfx.line.reverse', 'reverse-tail', 'A sound played backwards, from Line 13.'],
  ['sfx.ticket.stamp', 'ticket-stamp', 'A ticket is stamped.'],
  ['sfx.exchange.close', 'exchange-close', 'The exchange powers down.'],
].map(([id, name, transcript]) => ({
  id: id as string,
  kind: 'audio' as const,
  source: `webaudio:${name}`,
  sha256: 'synthesized-at-runtime',
  transcript: transcript as string,
  voiceEngine: 'original' as const,
}));

/*
 * Declared cues. The haunting package derives the live cues from the event
 * log; these are the authored statement of what each beat looks and sounds
 * like, with the alternative that keeps it readable when sound or motion is
 * cut. Every sound cue names a caption or visual signal.
 */
const cues: readonly HauntCue[] = [
  {
    id: 'cue-ring', triggerEventType: 'CALL_RINGING', channel: 'lamp', targetId: 'line-03',
    effect: 'ring', intensity: 1, durationMs: 1800, reducedMotionAlternative: 'static',
    silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-ring-bell', triggerEventType: 'CALL_RINGING', channel: 'sound', assetId: 'sfx.bell.ring',
    effect: 'plain', intensity: 1, durationMs: 1800, reducedMotionAlternative: 'none',
    silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-answer-voice', triggerEventType: 'CALL_ANSWERED', channel: 'voice-filter',
    targetId: 'caller-ruth', effect: 'telephone', intensity: 1, durationMs: 2400,
    reducedMotionAlternative: 'none', silentAlternative: 'caption',
  },
  {
    id: 'cue-answer-reveal', triggerEventType: 'CALL_ANSWERED', channel: 'transcript',
    targetId: 'caller-ruth', effect: 'reveal', intensity: 1, durationMs: 2400,
    reducedMotionAlternative: 'static', silentAlternative: 'caption',
  },
  {
    id: 'cue-plug-contact', triggerEventType: 'PLUG_INSERTED', channel: 'sound',
    assetId: 'sfx.jack.contact', effect: 'plain', intensity: 1, durationMs: 320,
    reducedMotionAlternative: 'none', silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-unplug', triggerEventType: 'PLUG_REMOVED', channel: 'sound', assetId: 'sfx.cord.pull',
    effect: 'plain', intensity: 1, durationMs: 320, reducedMotionAlternative: 'none',
    silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-crossed-static', triggerEventType: 'ROUTE_REJECTED', channel: 'sound',
    assetId: 'sfx.line.static', effect: 'static', intensity: 2, durationMs: 1200,
    reducedMotionAlternative: 'none', silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-crossed-voltage', triggerEventType: 'ROUTE_REJECTED', channel: 'environment',
    effect: 'voltage-drop', intensity: 2, durationMs: 900, reducedMotionAlternative: 'fade',
    silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-bleed', triggerEventType: 'CALL_BLEED_STARTED', channel: 'voice-filter',
    targetId: 'caller-amos', effect: 'crossed-line', intensity: 2, durationMs: 2400,
    reducedMotionAlternative: 'none', silentAlternative: 'caption',
  },
  {
    id: 'cue-possessed', triggerEventType: 'LINE_POSSESSED', channel: 'lamp', targetId: 'line-13',
    effect: 'flicker', intensity: 2, durationMs: 1600, reducedMotionAlternative: 'fade',
    silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-possessed-reverse', triggerEventType: 'LINE_POSSESSED', channel: 'sound',
    assetId: 'sfx.line.reverse', effect: 'reverse-tail', intensity: 2, durationMs: 1400,
    reducedMotionAlternative: 'none', silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-closed-relay', triggerEventType: 'ROUTE_CONFIRMED', channel: 'sound',
    assetId: 'sfx.relay.click', effect: 'plain', intensity: 1, durationMs: 420,
    reducedMotionAlternative: 'none', silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-finale-bell', triggerEventType: 'FINALE_UNLOCKED', channel: 'sound',
    assetId: 'sfx.bell.thirteen', effect: 'reverse-tail', intensity: 3, durationMs: 2600,
    reducedMotionAlternative: 'none', silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-finale-lamp', triggerEventType: 'FINALE_UNLOCKED', channel: 'lamp', targetId: 'line-13',
    effect: 'ring', intensity: 3, durationMs: 2600, reducedMotionAlternative: 'static',
    silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-ending-connect', triggerEventType: 'ENDING_SELECTED', channel: 'ending-transition',
    endingId: 'ending-first-connection', effect: 'connect', intensity: 2, durationMs: 3200,
    reducedMotionAlternative: 'fade', silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-ending-reverse', triggerEventType: 'ENDING_SELECTED', channel: 'ending-transition',
    endingId: 'ending-crossed-line', effect: 'reverse', intensity: 2, durationMs: 3200,
    reducedMotionAlternative: 'fade', silentAlternative: 'visual-signal',
  },
  {
    id: 'cue-ending-sever', triggerEventType: 'ENDING_SELECTED', channel: 'ending-transition',
    endingId: 'ending-thirteenth-operator', effect: 'sever', intensity: 3, durationMs: 3200,
    reducedMotionAlternative: 'fade', silentAlternative: 'visual-signal',
  },
];

const endings: readonly Ending[] = [
  {
    id: 'ending-first-connection',
    label: 'The First Connection',
    description: 'Four voices placed and not one line crossed. The bell stops, and a thirteenth lamp wakes behind you.',
    requiredEventTypes: ['FINALE_UNLOCKED'],
  },
  {
    id: 'ending-crossed-line',
    label: 'The Crossed Line',
    description: 'Every cord is home, but the voices that crossed did not all go back.',
    requiredEventTypes: ['ROUTE_REJECTED', 'FINALE_UNLOCKED'],
  },
  {
    id: 'ending-thirteenth-operator',
    label: 'The Thirteenth Operator',
    description: 'The line stopped asking and started answering. Your seat is no longer empty, and neither is the one beside it.',
    requiredEventTypes: ['ROUTE_REJECTED', 'LINE_POSSESSED', 'FINALE_UNLOCKED'],
  },
];

export const BUNDLED_EPISODE = {
  schemaVersion: '1.0.0',
  episodeId: 'night-roll-v1',
  seed: 'line-13-night-roll-v1',
  title: 'The Night Roll',
  callers,
  destinations,
  clues,
  constraints,
  intendedRoutes: [
    { callerId: 'caller-ruth', destinationId: 'destination-bell-tower', order: 1 },
    { callerId: 'caller-amos', destinationId: 'destination-orchard', order: 2 },
    { callerId: 'caller-tobias', destinationId: 'destination-cistern', order: 3 },
    { callerId: 'caller-ines', destinationId: 'destination-morgue', order: 4 },
  ],
  cues,
  endings,
  assets: SOUND_ASSETS,
  solverProof: {
    status: 'verified',
    solutionCount: 1,
    shortestSolutionLength: 4,
    unreachableNodeIds: ['destination-chapel'],
    proofHash: '554367632d6d90d7',
    validatorVersion: '0.1.0',
  },
  publishedAt: '2026-11-11T09:00:00.000Z',
  integrity: { algorithm: 'SHA-256', manifestHash: 'pending-publication' },
} satisfies EpisodeManifestV1;

/**
 * Dead lines on the face of the board. These are scenery of the room, not
 * episode content and not game state: they carry the word "NO CIRCUIT" and are
 * hidden from assistive technology because they tell the operator nothing the
 * live lines do not.
 */
export const DORMANT_LINE_LABELS: readonly string[] = [
  'Line 01',
  'Line 02',
  'Line 04',
  'Line 05',
  'East Wing',
  'Platform 0',
];
