# LINE 13 integration evidence

Branch `feat/integration` (worktree `/Users/logesh/workplace/line-13-integration`), from `feat/foundation` 70c1dde. Never pushed. No AWS calls. Main untouched.

## Merges

| Merge | Commit | Conflicts |
|---|---|---|
| `feat/full-episode` (99a1105) | 454cde4 | none |
| `feat/kiro-depth` (e8efef5) | 483dab5 | none |

Both merged with `--no-ff`, no rebase. The branches touch disjoint files except `packages/graph/src/solve.ts` (only kiro-depth) and `.github/workflows/ci.yml` (only kiro-depth), so no design choice was needed. The solver fix (`consistent()` rejects a destination already assigned) survived: `shared-destination.test.ts` passes, and the four-caller "Night Roll" still verifies (1 solution, 2,760 / 3,552-state recovery sweep per the branches' own evidence; `npm run check:episodes` PASS). I did not re-derive the 3,552 vs 2,760 difference (the two branches report different sweep sizes: full-episode's number came from the pre-fix solver).

## E2E (apps/web/e2e, `npm run e2e`, wired into `.github/workflows/ci.yml`)

33 tests per project: intro skip (Escape, button, click), unattended entrance, first paint, correct route, wrong-route recovery, endings 1/2/3, reopen, replay (and second-shift ending), ending focus, no overflow, mute (+caption), reduced motion (switch and OS), high contrast (switch and OS), subtitles, keyboard-only full night, 44px/accessible-name audit, touch full night, API timeout, API invalid JSON, offline mid-game, same-origin only, no Web Audio, throwing AudioContext, blocked localStorage, slow script (boot plate), failed script, bundle budget, axe x2.

| Engine | 1440 | 820 | 390 |
|---|---|---|---|
| Chromium | 33/33 | 33/33 | 33/33 |
| WebKit | 33/33 | 33/33 | 33/33 |
| Firefox | **not run locally** | not run | not run |

Final run after all fixes: 198 passed (chromium+webkit, 4.6 min). Firefox 159 (Playwright build) cannot start on this Mac: headless exits with "Could not find profile folder" even with plain `firefox -headless` outside Playwright (the bundle also fails `codesign -v`; sandbox/GPU helper errors). CI installs firefox and runs all nine projects; that is unverified until it runs on GitHub.

## Accessibility (axe-core 4.14 via @axe-core/playwright, wcag2a/aa, 2.1, 2.2 aa, best-practice)

Screens scanned: entrance, first ring, call held, cord in hand, patched, crossed line, first circuit closed, line 13 + sigil, ending; default and (reduced motion + high contrast). Chromium, WebKit, all widths in the matrix.
- Before: 1 serious, `label-content-name-mismatch` on every operable jack (accessible name did not start with the visible text).
- Fix: `Switchboard.tsx` name is now `label name state, verb` in visible order, with spaces between flex children.
- After: 0 serious / 0 critical on every screen.

## Performance (production build, `vite preview`, localhost)

| | Before | After |
|---|---|---|
| JS | 300.75 kB (92.63 kB gzip) | 300.80 kB (92.67 kB gzip) |
| CSS | 26.01 kB (6.33 kB gzip) | 26.02 kB |
| Requests / transfer | 3 / ~100 kB | 3 / ~100 kB |
| Desktop Chromium load / skip button visible | 22 ms / 47 ms | unchanged |
| Skip to ringing lamp | ~125 ms (webkit ~20 ms) | unchanged |
| AudioContext resume | 0-2 ms warm (52 ms first) chromium, ~20 ms webkit | unchanged |
| Mobile 390, CPU 4x, 1.6 Mbps/150 ms: first paint | 920-948 ms, **empty body** | 404-452 ms, text visible |

Blocking issue fixed: HTML had an empty `#exchange` so first paint was a blank page until the 92 kB script ran. Now a static boot plate plus matching background paint with the HTML (React replaces it); a `<noscript>` rule hides it without JS. Audio needs a gesture; cues before it fall back to captions (existing behaviour, tested).

## New-player review (one fresh subagent, 5.26 credits, saw only the preview URL)

Reached "The First Connection" on desktop and phone. Time to first success (answered Ruth): ~7.5 s; first correct circuit: ~11.6 s desktop, ~11.5 s phone (phone pass reused learned solution, not cold). Understood the goal in ~10 s.

Findings and what I did:
1. No feedback that a placement is right until the ending: not fixed (design change).
2. Phone: clue card and Close/Pull buttons below the fold (~1995 px page): not fixed (layout change, risky).
3. First action not stated, second tap to lift unexpected: **fixed** prompt now "A lamp is ringing. Tap it to answer, tap again to lift the cord. Any order works." (also covers finding 6).
4. Skip control small: not changed (already 44px, focused first).
5. Line 13 unlabeled as finale: not fixed.
7. Text 8-10 px on phone: **fixed**, floor raised to 11px across both stylesheets (the 44px touch-target and no-overflow tests still pass at all widths).
8. Cord drawn over labels: not fixed.
9. Ending screen does not say how to earn other endings: not fixed (the panel already lists requirements, the reviewer missed them).
Before/after of the fixed items is by copy/CSS diff; I did not re-run a second cold review.

## Test totals (final)

typecheck 0 errors; unit 156 + 124 + 27 + 60 + 24 = 391 pass / 0 fail; lint clean (92 files); PBT seed 1113, 10,000 cases, passed; build ok; e2e 198 pass (chromium+webkit).

## Nearby inputs tested beyond the requested list
Entrance left to run unattended; skip by button and by click; Reopen then re-route; second shift after ending reaching a different ending; ending focus; 1-3 vs 4 crossings boundary; OS prefers-reduced-motion and prefers-contrast from first paint; subtitles toggle; Web Audio absent; AudioContext constructor throwing; localStorage blocked; offline mid-game; third-party request audit; slow and failed script load; bundle budget; 44px target/accessible-name audit on every control; horizontal overflow at each width.

## Skipped / not checked
Firefox (cannot launch here); real audio output and real Safari/phone hardware; Windows; drag-to-plug with a real finger; a second cold new-player pass after fixes; new-player findings 1, 2, 4, 5, 8, 9 left open; the CI workflow has not run on GitHub.
