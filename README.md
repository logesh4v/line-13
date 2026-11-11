# LINE 13

**Connect the dead before the last line calls you.**

**Play it now, no login: https://d38usbzsyul1ro.cloudfront.net**

LINE 13 is a browser puzzle game. You are the night operator of a reopened 1930s manual telephone exchange. Callers ring one at a time, you read their clues, plug a cord into a destination, and every connection also draws part of a ritual. Built for Kiroween 2026, category **Resurrection** (obsolete technology brought back with a modern idea).

Author: S Logesh. License: MIT.

## Who it is for

- Anyone who wants a short, atmospheric puzzle they can finish in one sitting (about 3 to 5 minutes for a first night).
- Players who cannot hear, cannot take motion, or only have a phone or keyboard: every sound has a caption or visual signal, and the game plays with keyboard only, muted, with reduced motion, and in high contrast.
- Anyone who cares about fair puzzles. Puzzle content from people or language models is often unfair (no answer, three answers, or a dead end). Here a deterministic solver proves that each episode has exactly one solution and cannot trap the player.

## Judge path: 60 seconds

1. Open https://d38usbzsyul1ro.cloudfront.net (or run it locally, see Setup). Skip the entrance with a click, a tap, any key or Escape.
2. Answer the ringing lamp. Read the ticket of clues.
3. Tap the ringing line, then tap a destination to plug the cord. Press **Close the circuit**.
4. Route one caller wrongly on purpose. A wrong route is a consequence, not a game over: the haunt level rises, another voice cuts in, and **Pull the cord** lets you try again.
5. Finish all four callers. The thirteenth lamp rings, a sigil draws from your routes, and one of three endings plays (it depends only on how many lines you crossed).

Sound is optional; caller voices are pre-generated with Amazon Polly and everything has captions.

## How Kiro was used

The project was built with Kiro Crew (specialist agents for UI, graph engine, haunting/audio, backend, plus independent reviewers), driven by Kiro specs, steering and hooks that are committed in [`.kiro/`](.kiro):

- **Specs**: [`.kiro/specs/line-13/`](.kiro/specs/line-13) (requirements, design, tasks).
- **Steering**: [`.kiro/steering/`](.kiro/steering) (product, architecture, AWS-only, testing, visual language). Two files load only on matching files (`inclusion: fileMatch`).
- **Hooks**: [`.kiro/hooks/`](.kiro/hooks) validate an episode on save, run affected-package tests on save, and enforce the steering rules on save.
- **Property-based testing**: 10,000 generated episodes checked against a brute-force oracle; it found a real solver defect (an "unwinnable but verified" episode), now fixed with a regression test.
- **CI gate** for the Kiroween rule itself: [`scripts/check-kiro.mjs`](scripts/check-kiro.mjs).
- **Companion Kiro Crew app**: Night Operator, which authors episodes behind the same solver (separate repo, linked below).

Evidence, with commits, inputs and outputs:

- [Kiro evidence ledger](docs/submission/kiro-evidence.md)
- [Kiro depth: hooks, steering, PBT, CI](docs/evidence/kiro-depth.md)
- [Full four-caller episode](docs/evidence/full-episode.md)
- [Amazon Polly voices](docs/evidence/polly-voices.md)
- [Integration and verification](docs/evidence/integration.md)
- [Deploy evidence](docs/evidence/deploy.md)

Honest limit: hooks were exercised by a local harness script that runs the same commands the hook files declare; they were not recorded firing inside the Kiro IDE.

## Setup

Requires Node 22.18 or newer (tests run TypeScript directly with type stripping) and npm.

```bash
git clone https://github.com/logesh4v/line-13.git
cd line-13
npm ci
npm run dev -w @line-13/web      # local dev server on 127.0.0.1
```

Verify everything (lint, `.kiro` check, typecheck, unit tests, property tests, build):

```bash
npm run verify
```

Browser tests (Playwright, Chromium, WebKit, Firefox at three widths, axe-core on every screen):

```bash
cd apps/web && npx playwright install chromium && cd ../..
E2E_PROJECT_FILTER='chromium-(1440|390)' npm run e2e
```

Run the E2E suite against the live site: `BASE_URL=https://d38usbzsyul1ro.cloudfront.net npm run e2e`.

## Architecture

```
apps/web          React + TypeScript + Vite client. The full episode, haunting engine and
                  Polly voice files ship inside the static bundle. No login, no backend call,
                  no model call in the playable path.
apps/api          Optional daily-episode and share-code API (Lambda, API Gateway, DynamoDB).
packages/contracts  Episode schema and validator shared by game, API and Night Operator.
packages/graph    Deterministic solver: zero-solution, ambiguity, ordering and recovery proof.
packages/haunting Event engine: every route changes light, voice, interference and story state.
infra/cloudformation  S3 + CloudFront hosting, optional API and storage stacks (least-privilege, lint-tested).
.kiro/            Specs, steering, hooks.
```

Reliability rule: the complete bundled episode works with no login and no backend response. AWS services extend the game but never gate it.

AWS only for AI and voice: Amazon Nova through Amazon Bedrock (build-time authoring and critique, in Night Operator), Amazon Polly (pre-generated caller voices), Amazon S3 and CloudFront (hosting), optional API Gateway, Lambda, DynamoDB. No third-party models.

Deploy your own copy: `npm run deploy` (see [`infra/README.md`](infra/README.md)). It needs your own AWS credentials and creates resources in your account.

## Companion app

[Night Operator](https://github.com/logesh4v/night-operator) is a Kiro Crew app with six role agents. It produces one sealed `episode.json` that LINE 13 imports, and refuses to ship anything the LINE 13 solver cannot prove has exactly one answer.

## Author

S Logesh
