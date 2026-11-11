# LINE 13 Design

## Winner thesis

LINE 13 wins attention by making the Kiroween category inseparable from the experience. The player does not visit a website about a haunted switchboard; the browser becomes the switchboard. The dead technology is resurrected, every cable is a story decision, and the completed graph becomes the ritual.

## Chosen visual specification

**Occult Exchange with a first-person cinematic entrance.**

The visual language uses black walnut, aged brass, cloth-covered cords, ivory routing tickets, amber lamps, restrained green phosphor, smoke, and deep shadow. It avoids application chrome, dashboards, statistic cards, generic navigation, neon-purple SaaS styling, copied Kiro mascot assets, and decorative Halloween stickers.

The existing design mockup is the baseline. Production implementation must match its hierarchy and physicality while improving responsive behavior, controls, state feedback, and accessibility.

## Intro sequence

Target length: 6 seconds.

1. **0.0–1.2:** black screen; one exchange bell rings; a thin amber signal line appears.
2. **1.2–2.7:** a brass plate emerges: “NIGHT EXCHANGE — CLOSED OCTOBER 31, 1931.”
3. **2.7–4.5:** the operator-room door opens through layered 2D parallax; dormant switchboard lamps appear.
4. **4.5–6.0:** Line 01 rings, the camera settles at the desk, and control passes to the player without a menu.

The intro borrows the immersive entrance principle from the supplied House of Kiro references, not their footage, artwork, logos, or scene assets.

## System boundaries

### Web application

Owns rendering, input, accessibility, local episode state, audio playback, offline fallback, and replay. It never needs a live model call.

### Episode schema

Defines callers, destinations, constraints, dialogue, cue references, intended solutions, ending conditions, content version, and integrity metadata. It is shared by the generator, validator, backend, and client.

### Graph engine

A framework-free TypeScript package of pure functions. It owns graph creation, legal transitions, validation, solution enumeration, difficulty calculation, event reduction, and deterministic replay.

### Haunting engine

Consumes typed game events and returns declarative cues. It owns no graph decisions. Cue classes include lamp, environment, transcript, voice filter, sound effect, haptic, camera, and ending transition.

### Audio pipeline

Amazon Polly produces immutable speech assets during episode publication. Web Audio applies gain, filtering, convolution, panning, interference, and cross-line leakage in the browser. Exact subtitles ship in the episode manifest.

### AWS extension path

- CloudFront distributes the web build and audio from private S3 origins.
- API Gateway exposes read-only daily episode and replay endpoints plus anonymous ending aggregation.
- Lambda validates requests and signed manifests.
- DynamoDB stores published episode metadata, replay codes, and aggregate ending counters.
- Bedrock with Amazon Nova is available only to the separate content-production workflow.
- CloudWatch records operational metrics without dialogue, prompts, credentials, or player identifiers.

## Core data contracts

### EpisodeManifest

- schemaVersion
- episodeId
- seed
- title
- callers
- destinations
- constraints
- cues
- endings
- assets
- solverProof
- publishedAt
- integrity

### GameEvent

- sequence
- type
- timestampOffset
- actorId
- sourceId
- destinationId
- payload

Representative event types: CALL_RINGING, CALL_ANSWERED, PLUG_INSERTED, ROUTE_CONFIRMED, ROUTE_REJECTED, CALL_BLEED_STARTED, CLUE_REVEALED, LINE_POSSESSED, FINALE_UNLOCKED, ENDING_SELECTED.

### HauntCue

- eventSequence
- channel
- cueId
- intensity
- duration
- reducedMotionAlternative
- silentAlternative

## State model

The application uses a typed reducer and explicit phases:

BOOT → INTRO → ORIENTATION → ROUTING → ESCALATION → LINE_13 → ENDING → REPLAY

Graph state is deterministic. Ephemeral presentational state may animate independently but must always reconcile to reduced graph state.

## Failure strategy

- Invalid remote manifest: reject and load bundled episode.
- API unavailable: load bundled episode.
- Polly audio unavailable: show exact subtitles and visual signals.
- Web Audio unsupported: play plain audio elements.
- Service worker unavailable: continue online without offline claim.
- Share code invalid: open bundled episode with an explanation.

## Security and privacy

The game accepts no arbitrary HTML, executable content, file uploads, microphone, camera, account credentials, or free-text model prompts. Episode text is rendered as text, not HTML. Remote manifests are schema-validated and integrity-checked. AWS access stays server-side under least-privilege roles.

## Separate Night Operator Kiro Crew app

The companion repository orchestrates six roles:

1. Folklorist drafts caller histories and clue language.
2. Puzzle Architect creates graph constraints.
3. Solver enumerates and challenges solutions.
4. Stage Director maps graph events to audiovisual cues.
5. Accessibility Examiner verifies alternatives and safety limits.
6. Packager emits a versioned manifest and proof report.

Generated packs remain drafts until human approval. The app never pushes content directly to production.

## Evidence strategy

- Static UI: screenshots at desktop and mobile breakpoints.
- Intro, routing, possession, and endings: recordings from the real application.
- Graph correctness: unit and property-test output with reproducible seeds.
- AWS fallback: captured network-failure E2E run.
- Kiro claims: exact spec, hook, agent, MCP, defect, commit, and resulting change.
