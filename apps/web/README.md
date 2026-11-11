# LINE 13 — web client

The browser becomes an abandoned telephone exchange. This package is the
**ninety-second vertical slice** of Milestone 2: the entrance, the board, one
caller, one wrong route you can always come back from, one correct route, and a
miniature ending.

React + TypeScript + Vite. No state library, no UI kit, no 3D engine, no remote
font, no model call at runtime. The bundled episode ships inside the bundle, so
the whole path works with the network off.

## Running it

```sh
npm install          # from the repository root; this is an npm workspace
npm run dev    -w @line-13/web
npm run build  -w @line-13/web
npm run test   -w @line-13/web        # node --test, no test framework needed
npm run typecheck -w @line-13/web
```

The dev and preview servers bind `127.0.0.1` only.

`npm run test` uses Node's own test runner against the TypeScript sources
directly (Node ≥ 22.6 strips the types), so the suite runs **before** anything
is installed. That is deliberate: it is what let this slice be validated in a
worktree with no `node_modules`.

## The ninety-second path

| Beat | What the operator does | Event emitted |
|---|---|---|
| Entrance | watches, or skips with a click, a tap, any key or Escape | — |
| A lamp rings | answers Line 03 | `CALL_RINGING`, `CALL_ANSWERED`, `CLUE_REVEALED` ×2 |
| Lifts the cord | taps the ringing line, or drags from it | — |
| Plugs a jack | taps a destination, or drops the drag on it | `PLUG_INSERTED` |
| Closes the circuit | presses **Close the circuit** | `ROUTE_CONFIRMED` or `ROUTE_REJECTED` |
| Crossed line | presses **Pull the cord** and tries again | `PLUG_REMOVED`, `CLUE_REVEALED` |
| Thirteenth lamp | answers it | `FINALE_UNLOCKED`, `ENDING_SELECTED` |

Ruth Bell wants the Bell Tower. The Orchard and the Morgue are both refused,
and each refusal hands over the clue that explains it — so a wrong connection
teaches rather than punishes, and the intended route is reachable from every
legal intermediate state. There is a test for exactly that.

### Three ways through, all equal

- **Pointer** — tap the ringing line, then tap a jack. Dragging between them
  works too, as an enhancement that nothing depends on.
- **Touch** — the same taps; every operable target clears 44px.
- **Keyboard** — Tab or the arrow keys move along the board, Home and End jump
  to its ends, Enter or Space lifts and plugs. Focus moves to the ringing lamp
  by itself when the entrance ends.

## Architecture

```
src/
  contracts.ts            the single seam onto @line-13/contracts
  episode/                the bundled episode + the validating loader
  game/      types, reducer, routing verdicts, exact status text
  haunting/  typed events -> declarative cues
  selectors.ts            the board, the ticket, the subtitle, the ending
  audio/     the synthesized Web Audio exchange
  settings/  the four accessibility switches
  intro/     the entrance, as data
  components/ + hooks/    everything that touches the DOM
```

The rule the package holds to: **the UI owns no puzzle truth**. Every routing
rule is read out of `episode.constraints`, every cue out of `episode.cues`, and
the reducer reads no clock — `atMs` arrives in the action — so replaying an
action list reproduces byte-identical state and the same cue set.

### What an episode may claim on screen

- Every state is readable as words. A lamp carries `RINGING`, `CROSSED`,
  `CONNECTED`, `LISTENING` next to its colour and its motion, and the engraved
  plate always says what the exchange is doing in full.
- Every sound cue has an exact caption or a visible mark. Cutting the sound
  loses nothing, and so does a browser with no Web Audio at all.
- Every motion cue has a still alternative, taken from the cue's own
  `reducedMotionAlternative`.
- Episode text is rendered as text. Never as markup.

## Integration needs

Three seams are **slice-local stand-ins** for packages that did not exist at
commit `1933bd4`. Each is pure, reads only the manifest, and is meant to be
replaced by a call rather than rewritten:

| File | Replaced by | Note |
|---|---|---|
| `src/game/routing.ts` | `@line-13/graph` | `evaluateRoute` is the whole surface the reducer uses. |
| `src/haunting/cues.ts` | `@line-13/haunting` | `ResolvedCue` is the shape the components consume; keep it. |
| `src/contracts.ts` | `@line-13/contracts` | One line: swap the relative import for the package name. |

Four more things the integration owner needs to decide:

1. **`EpisodeAsset` has no shape for a synthesized sound.** The slice's audio is
   generated in the browser, so its assets carry `sha256:
   "synthesized-at-runtime"`, which is a placeholder in a hash field. Either the
   contract grows a synthesized-asset variant, or Milestone 5 publishes real
   Polly files and real hashes. Each asset's `transcript` is already the exact
   caption, which is what makes the silent path work.
2. **`solverProof.status` is `draft`.** The bundled episode has not been through
   the graph validator. The slice asserts one accepted route by exhaustion over
   three destinations; that is not a proof report.
3. **Dependency versions are conservative floors**, pinned to releases known to
   exist rather than to the newest. Bump them with the lockfile.
4. **No test framework is declared.** The suite runs on `node --test`. If the
   repository standardises on Vitest for the React component tests, these files
   port by swapping the `node:test` import; the assertions do not change.

## What is verified, and what is not

Verified in this worktree, with no `node_modules`:

- **101 unit tests pass** (`node --test`) over the reducer, the routing
  verdicts, the exact status strings, the board selectors, the cue mapper, the
  entrance timeline, the settings, the episode loader and the house rules.
- **Every source file transpiles** — 26 modules, via `bun build` with React
  external.

**Not verified:** `tsc --noEmit` has never run, because TypeScript is not
installed and this agent was told not to install packages. So the *types* of the
React components are unchecked, and nothing has been rendered in a browser:
layout, the measured cord geometry, the pointer-drag path, focus order on screen
and the audio graph are all unexercised. The pure logic underneath them is
covered by the tests above. Run `npm install && npm run typecheck -w @line-13/web`
first, then play the slice.
