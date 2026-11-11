# @line-13/haunting

The exchange's haunting layer. It turns typed `GameEvent`s into declarative
`HauntCue`s and plays the audio those cues describe.

## Boundary

This package owns no puzzle truth. It never decides whether a route is legal,
which destination a caller wants, or whether an ending is reachable. The graph
engine decides all of that and reports its decisions as events; this package
only reacts to what already happened.

It also holds no media addresses. The exchange's own sounds are synthesized from
oscillators and seeded noise at runtime, and published caller speech is loaded
through a function the host supplies.

## UI integration contract

```ts
import {
  createHauntingEngine,
  createHauntingAudio,
  playFrame,
} from '@line-13/haunting';

const engine = createHauntingEngine({
  settings: { muted: false, audioAvailable: true, reducedMotion: prefersReducedMotion, subtitles: true, highContrast: false },
  subtitleSource: { callers: episode.callers, assets: episode.assets },
  cueMapping: { endingEffects: { 'ending-sever': 'sever' } },
});

const audio = createHauntingAudio({
  webAudio: {
    createContext: () => new AudioContext(),
    loadAsset: (assetId) => loadPublishedAudio(assetId),
  },
  plainAudio: { createElement: (assetId) => new Audio(assetUrl(assetId)) },
});
```

### 1. Unlock from a real gesture

`audio.unlock()` must be called from the handler of an explicit player
interaction. Nothing is created or played before it: no `AudioContext` exists,
and every cue sent earlier returns `outcome: 'locked'`. The game is fully
playable in that state.

`unlock()` picks the best pipeline the device actually supports, in order:
Web Audio, then media elements, then silence. Each step down loses fidelity and
never loses playability.

### 2. Feed every event in, render the frame

```ts
const frame = engine.handle(event);
```

A `HauntingFrame` is plain data — no timers, no promises, no DOM handles — so it
can be snapshotted, logged, or replayed. It carries:

| Field | Use |
|---|---|
| `cues` | The authored cue list for this event. |
| `presentations` | Those cues with the player's settings applied. **Render from this, not from `cues`.** |
| `subtitles` | Exact authored text for every spoken cue. Never paraphrased or generated. |
| `missingSubtitles` | Spoken cues with no authored text. A content defect to surface, not a blocker. |
| `state` | Escalation state after this event. |

Each presentation is a discriminated union on `mode`, and the renderer must
handle all four:

- `as-authored` — play the cue as written.
- `reduced-motion` — play `alternative` (`'fade'` or `'static'`) instead of the movement.
- `silent` — show `alternative` (`'caption'` or `'visual-signal'`) instead of the sound.
- `suppressed` — render nothing for this cue; another cue in the same frame carries the beat.

Settings change presentation only. Two players on the same event log always get
the same `cues`, so a muted, still playthrough is the same playthrough.

### 3. Hand the audible cues to the adapter

```ts
const { needsSilentAlternative } = await playFrame(audio, frame, voiceAssetFor);
```

`voiceAssetFor(targetId)` maps a caller to their manifest audio asset; return
`null` for subtitles only. The caller-to-asset mapping stays with the manifest
owner, so this package never looks episode content up for itself.

Anything in `needsSilentAlternative` could not be rendered as audio — locked,
muted, missing asset, failed decode — and the UI must show that cue's silent
alternative. The adapter never throws for a broken asset, because a voice that
will not load must not stop the game.

### 4. Settings and teardown

```ts
engine.updateSettings({ muted: true });
audio.setMuted(true);   // also cuts voices already sounding
audio.stopAll();        // on scene change
await audio.dispose();  // releases every node and closes the context
```

Mute is immediate: it silences new cues and stops current ones rather than
letting tails finish. After `dispose()` every cue returns
`fallback: 'disposed'` and the adapter stays closed.

## Determinism

- `mapEvent` and `mapEvents` are pure. No clock, no unseeded randomness, no
  graph lookup.
- Cue ids are `cue-<sequence>-<channel>-<ordinal>`, so a replay reproduces every
  id exactly.
- Escalation is **derived** from the event log and cannot be injected. Pressure
  is `rejections + 2 × bleeds + 3 × possessions`; level 2 at 2, level 3 at 6,
  and the finale forces level 3.
- Rejection escalation is per caller: first refusal flickers, second raises the
  exchange's voice, third adds the camera jolt.
- Synthesis noise is seeded from the cue id, so a recording of one playthrough
  matches a replay of it.

## Accessibility guarantees, as tests

- Every event type maps to at least one cue, and any frame that makes a sound
  also shows something.
- Every audible cue has a usable silent alternative, so no event is carried by
  sound alone.
- Every event stays perceivable with audio off and motion off at once.
- A cue whose reduced-motion alternative is `none` is dropped rather than faked.

## Commands

```sh
npm test --workspace @line-13/haunting   # node --test "test/*.test.ts"
npm run typecheck --workspace @line-13/haunting
```

Tests run on Node 22's native runner and type stripping, with no test framework
and no build step. `tsconfig.test.json` typechecks the tests and needs
`@types/node`; `tsconfig.json` covers `src` with no ambient types at all.

## Audio design

The soundscape is diegetic and finite. Every voice gets an explicit stop time,
so nothing outlives its scene and there is no decorative loop anywhere.

| Asset | Sound |
|---|---|
| `sfx.bell.ring` | Switchboard bell, two struck partials a fifth apart. |
| `sfx.bell.thirteen` | Line 13's bell: lower, longer, in no working register. |
| `sfx.jack.contact` | Brass tip meeting a jack, plus contact grit. |
| `sfx.cord.pull` | Cloth cord dragged out of the panel. |
| `sfx.relay.click` | Relay closing. Almost all transient. |
| `sfx.line.static` | Dead-air hiss on a crossed pair. |
| `sfx.line.hum` | Mains hum under the floor, bounded by its cue. |
| `sfx.line.reverse` | The swell when a line answers backwards. |
| `sfx.ticket.stamp` | Routing ticket stamped. Paper and wood. |
| `sfx.exchange.close` | The exchange closing for the night. |

Published speech is immutable. The haunting only changes how a voice is heard —
`telephone`, `crossed-line`, `distant-room`, `possessed` — so one Amazon Polly
line is reusable across every cue that needs it.
