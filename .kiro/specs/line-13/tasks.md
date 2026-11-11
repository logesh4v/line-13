# LINE 13 Tasks

## Milestone 0 — Direction lock

- [x] Research current Kiroween rules and judging criteria.
- [x] Study referenced 2025 winners and extract repeatable patterns.
- [x] Select Resurrection as the primary category.
- [x] Select Occult Exchange plus an immersive first-person entrance.
- [x] Confirm AWS-only model and voice policy.
- [ ] Perform final name, licence, and concept-collision search.
- [x] Convert mockup decisions into production design tokens.

## Milestone 1 — Repository and contracts

- [x] Scaffold the TypeScript web application and test harness.
- [ ] Establish lint, typecheck, unit-test, PBT, build, and E2E commands. (lint, typecheck, test, pbt, build done at the root; E2E still open)
- [x] Define EpisodeManifest JSON Schema.
- [x] Define GameEvent and HauntCue TypeScript contracts.
- [x] Add a valid minimal bundled episode fixture.
- [x] Add CI checks that prove `.kiro` is tracked and required assets exist.

## Milestone 2 — Ninety-second vertical slice

- [x] Implement the six-second skippable entrance.
- [x] Render the physical switchboard and routing ticket.
- [x] Implement keyboard, pointer, and touch plug interactions.
- [x] Implement one caller, one correct route, one incorrect route, and recovery.
- [x] Connect graph events to lamp, transcript, and sound cues.
- [x] Reach one miniature ending.
- [ ] Verify a new player can complete the slice in under 90 seconds.

## Milestone 3 — Graph engine

- [x] Implement deterministic seeded graph creation.
- [x] Implement legal move and recovery rules.
- [x] Implement complete solution enumeration.
- [x] Reject zero-solution and unintended multi-solution episodes.
- [x] Calculate difficulty from path length, clue dependencies, and decoys.
- [x] Produce machine-readable solver proof reports.
- [x] Add property tests and minimized failing-seed output.

## Milestone 4 — Full haunting experience

- [x] Author four production callers and destinations.
- [x] Implement escalating crossed-line and possession states.
- [x] Implement the ritual graph reveal.
- [x] Implement Line 13 and three endings.
- [x] Add exact subtitles and no-audio completion.
- [x] Add reduced-motion and high-contrast modes.
- [x] Complete desktop, tablet, and mobile interaction layouts.

## Milestone 5 — AWS pipeline

- [ ] Create Polly voice-generation workflow with reviewable text inputs.
- [ ] Store immutable audio assets with content hashes.
- [ ] Create static S3 and CloudFront deployment.
- [ ] Create daily episode and replay API.
- [ ] Create DynamoDB episode and aggregate-ending records.
- [ ] Add signed manifest verification.
- [ ] Prove bundled fallback under API timeout and invalid response.

## Milestone 6 — Night Operator Crew app

- [ ] Create a separate repository with author displayed as S Logesh.
- [ ] Define Folklorist, Puzzle Architect, Solver, Stage Director, Accessibility Examiner, and Packager roles.
- [ ] Use Amazon Nova through Bedrock for permitted generation steps.
- [ ] Require schema, solver, safety, and human review gates.
- [ ] Generate and import one complete episode without manual format repair.
- [ ] Publish a feature and architecture write-up for the bonus entry.

## Milestone 7 — Quality gate

- [x] Unit-test reducers, graph operations, schema validation, and cue mapping.
- [ ] Run at least 10,000 property-generated episode cases.
- [ ] E2E-test intro skip, correct route, wrong route recovery, mute, reduced motion, offline fallback, finale, and replay.
- [ ] Test current Chrome, Safari, Firefox, and mobile viewports.
- [ ] Run accessibility and first-time non-technical user reviews.
- [ ] Verify performance budgets and audio startup behavior.
- [ ] Audit source, history, deployment, and recordings for secrets and personal data.

## Milestone 8 — Submission

- [ ] Publish main and companion repositories with visible licences.
- [ ] Verify root `.kiro` visibility and complete setup instructions.
- [ ] Deploy the public no-login experience.
- [ ] Record the real end-to-end application in a judge video shorter than three minutes.
- [ ] Record a vertical House-of-Kiro-inspired teaser using only original project media.
- [ ] Publish the Kiroween blog and qualifying Social Blitz post.
- [ ] Test every link from a logged-out browser.
- [ ] Submit by December 2, preserving a two-day repair buffer.
- [ ] Keep the deployment free and available through January 29, 2027.

## Cut order if schedule slips

1. Remove aggregate ending counts.
2. Remove short share codes.
3. Ship one daily episode rather than rotation.
4. Omit the companion bonus submission if unstable.
5. Never cut the bundled episode, solver, accessibility paths, visual polish, Kiro evidence, or judge video.
