# LINE 13 full episode: evidence

Branch `feat/full-episode` (from `feat/foundation` 70c1dde), worktree `/Users/logesh/workplace/line-13-episode`.
Code commit: **2aa5fb1** (an earlier commit on the branch, d80c2d1, holds the first cut; this file is committed after 2aa5fb1).
Never pushed. No AWS calls. `packages/graph` internals untouched.

## Gates (run on 2aa5fb1)

| Gate | Result |
|---|---|
| `npm run typecheck` (strict, all workspaces) | 0 errors |
| `npm test` (all workspaces) | 366 pass / 0 fail (four workspaces printed 156, 124, 26, 60; the 124 is web, up from 101, baseline total was 343) |
| `npm run build` | passes; JS 300.75 kB (92.63 kB gzip), CSS 26.01 kB |
| Web tests added | 23 in `apps/web/src/episode/bundled-episode.test.ts`; web went 101 to 124 |

I did not label the other three workspace counts individually.

## The episode ("The Night Roll", `apps/web/src/episode/bundled-episode.ts`)

Four callers (Ruth Bell / Amos Kettle / Tobias Wren / Ines Marrow), five destinations (Bell Tower, Orchard, Morgue, Chapel, Cistern), Line 13 finale.

Solver result from `@line-13/graph` `computeProofReport` (also asserted in a test, so the manifest proof cannot drift):
status `verified`, **solutionCount 1** (not truncated), intended solution matches, recoverability sweep **exhaustive, 3,552 states, 0 unrecoverable**, unreachable decoy: Chapel, difficulty 86, proofHash `554367632d6d90d7`.

The intended solution is Ruth to Bell Tower, Amos to Orchard, Tobias to Cistern, Ines to Morgue.

Fairness invariant, also tested: each caller's last clue is a recovery whisper, spoken only after a crossed line. With every whisper removed the episode still verifies with exactly one solution, so a clean night never needs a crossing, and a crossing only helps.

## What each ending requires (`apps/web/src/game/endings.ts`)

Chosen by routes, not a menu. Ending is earned only if the event log contains the events the manifest declares for it (`endingForLog`).

| Ending | Requires | Transition |
|---|---|---|
| The First Connection | all four circuits closed, **0** crossed lines | connect |
| The Crossed Line | all four closed after **1 to 3** crossed lines | reverse |
| The Thirteenth Operator | all four closed after **4 or more** crossed lines | sever |

The ending panel lists all three with their requirements and marks which one was reached; "Take another shift" restarts.

## Escalation (`reducer.ts`, `haunt.css`)

| Crossed lines | Haunt | What happens |
|---|---|---|
| 1 | 1 | another caller's voice cuts in (CALL_BLEED_STARTED), clue whisper revealed |
| 2 | 2 | LINE 13 lamp goes "LISTENING"; scanline interference; LINE 13 speaks (subtitled) |
| 3 | 3 | second bleed; chromatic fringe on state words; LINE 13 speaks again |
| 4 | 4 | LINE 13 takes the line: lamps shift to phosphor; heaviest vignette |

The level never falls. Every step is also words: lamp words, status plate, subtitle readout, captions.

## Ritual reveal

When the last circuit closes the cords pull taut into straight chords and a sigil draws itself from the player's own routes: each route's midpoint is a star node, Line 13 is the hub, two rings and 13 ticks close it, unused jacks are struck through as sealed. Reduced motion shows it complete and static. High contrast renders it white on black.

## Screenshots (`docs/evidence/screens/`, 26 files)

Desktop 1440x900: `desktop-entrance`, `desktop-first-ring`, `desktop-two-callers`, `desktop-all-routed`, `desktop-ending-1-clean-sigil/-ending`, `desktop-ending-2-crossed-sigil/-ending`.
Mobile 390x844 (touch, full page): `mobile-390-entrance`, `-first-ring`, `-crossed-1`, `-line13-listening`, `-line13-takes-line`, `-all-routed`, `-ending-3-possessed-sigil/-ending`.
Mobile 320x640: `mobile-320-holding`, `-sigil`, `-ending`.
Tablet 820x1180 touch: `tablet-820-routing`, `-sigil`, `-ending`.
Settings: `keyboard-muted-captions`, `reduced-motion-high-contrast-crossed`, `-sigil`, `-ending`.

Visual reference notes: `docs/evidence/visual-reference.md` (8 frames sampled from each video with ffmpeg; ideas only, no footage).

## Real-browser playthroughs (headless Chromium via playwright-core, one browser at a time, closed after each)

Scripts: `docs/evidence/playthrough/endings.mjs` and `inputs.mjs` (run against `vite` on 127.0.0.1:5199; need `playwright-core` installed outside the repo).

Nearby inputs tested, all reached the expected ending with 0 page errors and 0 console errors:
- **Clean night, mouse, desktop**: entrance plays out by itself, First Connection.
- **Wrong route first** (Ruth to Morgue before anything else): status returns to "LINE 03 HOLDING", then correct route, Crossed Line.
- **All wrong then recovery** (Ruth tried on all four wrong jacks, then correct, then the rest), on 390px **touch**: haunt reaches 4, Thirteenth Operator.
- **Keyboard only** (Tab/arrows/Enter/Space, no pointer), **muted via the SOUND switch**: First Connection; ending heading takes focus.
- **Muted**: captions render for every cue (screenshot).
- **Reduced motion + high contrast**: sigil strokes have no animation and full offset, crossed lines and ending still reachable.
- **Touch**: 390 phone, 820 tablet, 320 phone; no horizontal overflow at 390, 820 or 320; no enabled button under 44px at 320.
- **Intro skip** (Escape) on desktop, 320 and keyboard runs.

Bugs found and fixed through this: ticket mixed all callers' clues together (now only the active caller's); sigil rings were clipped off-board (now centred on the figure and clamped inside); high-contrast ticket rules struck through the text; Reopen key was 36px tall (now 44px).

## Skipped or not checked

- Real Safari, Firefox and a physical phone: only headless Chromium ran, touch was emulated.
- Real audio output: no sound was heard; audio is synthesized and I verified only that every audible cue has a caption or visual signal under mute (tested) and that the page runs with no errors.
- Automated axe or screen-reader pass: not run; accessibility is by construction (words for every state, live regions, focus management) plus the keyboard/mute/reduced-motion/contrast runs above.
- Polly voices, hashes and the AWS pipeline (Milestone 5): out of scope; assets are still synthesized.
- Drag-to-plug with a real finger: the drag hook was adapted for multiple callers but only tap routing was exercised in the browser.
- Reopen was covered by a reducer test, not clicked in the browser.
- Risk: the 4-wrong ceiling for the third ending means a player who never crosses 4 lines can't see it; this is intended and listed on the ending panel.
