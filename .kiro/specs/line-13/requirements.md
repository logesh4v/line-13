# LINE 13 Requirements

## R1 — Immediate category and theme recognition

1. WHEN the application opens, THE SYSTEM SHALL present a first-person occult telephone-exchange experience rather than a generic landing page or dashboard.
2. WITHIN five seconds, THE EXPERIENCE SHALL communicate that an obsolete switchboard has returned to service and is receiving calls from the dead.
3. THE PRODUCT SHALL remain recognizably Kiroween-themed when all explanatory copy is removed.
4. THE RESURRECTION CATEGORY SHALL be demonstrated by the interaction itself, not only by the title or submission text.

## R2 — Cinematic entrance

1. THE INTRO SHALL last no more than seven seconds.
2. THE INTRO SHALL be skippable with mouse, touch, keyboard, and Escape.
3. THE INTRO SHALL begin with darkness and a ringing signal, reveal the abandoned exchange, and finish by handing control directly to the first live line.
4. WHEN reduced motion is enabled, THE SYSTEM SHALL replace camera movement, flicker, and rush effects with readable fades and a static reveal.
5. THE CORE GAME SHALL remain understandable if the intro is skipped.

## R3 — Playable episode

1. THE BUNDLED EPISODE SHALL contain four primary callers and a Line 13 finale.
2. THE FIRST CALL SHALL teach listen, inspect, connect, disconnect, and confirm through play rather than a blocking tutorial.
3. EACH CALLER SHALL provide clues that constrain one intended destination.
4. INCORRECT CONNECTIONS SHALL trigger recoverable consequences rather than immediate failure.
5. THE FINALE SHALL offer at least three meaningful outcomes derived from the player's routes and final choice.
6. A FIRST-TIME PLAYER SHALL be able to reach an ending in three to five minutes.

## R4 — Verified routing graph

1. EVERY published episode SHALL conform to a versioned manifest schema.
2. A GIVEN episode seed SHALL always produce the same callers, clues, graph, cues, and intended solution.
3. THE VALIDATOR SHALL reject an episode with no complete solution.
4. THE VALIDATOR SHALL reject an episode with more than one unintended complete solution unless ambiguity is explicitly part of the authored episode.
5. NO legal intermediate action SHALL leave the player unable to recover or finish.
6. THE VALIDATOR SHALL produce a machine-readable proof report containing solution count, shortest solution, unreachable nodes, and failing seed.

## R5 — Unified haunting engine

1. EVERY routing action SHALL emit a typed game event.
2. LIGHTING, audio, transcript corruption, environmental motion, caller state, and ending eligibility SHALL derive from game events rather than independent timers.
3. REPLAYING the same event sequence SHALL reproduce the same haunting state.
4. A visual or audio failure SHALL NOT corrupt graph state or prevent completion.

## R6 — AWS-only AI and speech

1. ONLY Amazon first-party foundation models accessed through Amazon Bedrock MAY be used for model-generated project content.
2. Amazon Nova MAY draft caller histories, clue variations, dialogue, and critiques during episode production.
3. ALL model-produced episode content SHALL pass schema validation, solver validation, safety review, and human approval before publication.
4. Amazon Polly SHALL generate production caller speech; every spoken line SHALL have an exact subtitle.
5. NO model invocation SHALL be required during the judge's core playthrough.
6. NO third-party model API SHALL be present in source, configuration, deployment, or documentation.

## R7 — Audio behavior

1. THE FIRST explicit player interaction SHALL unlock browser audio without relying on autoplay.
2. EVERY audio cue SHALL have an equivalent visual cue.
3. THE PLAYER SHALL be able to mute all audio at any point.
4. VOICE playback failure SHALL fall back to subtitles without blocking progression.
5. MUSIC and sound effects SHALL be original, synthesized, licensed for redistribution, or public-domain with attribution.

## R8 — Backend and fallback

1. THE STATIC APPLICATION SHALL include a complete bundled episode.
2. THE API MAY provide a daily episode, signed episode manifest, anonymous aggregate ending counts, and short replay codes.
3. API failure, timeout, invalid signature, or malformed content SHALL activate the bundled episode and a non-blocking status message.
4. THE CORE GAME SHALL require no account, personal data, upload, payment, camera, or microphone.
5. THE PUBLIC EXPERIENCE SHALL remain free and available through the end of judging.

## R9 — Accessibility and device support

1. EVERY switchboard action SHALL be operable by keyboard, pointer, and touch.
2. FOCUS order and focus appearance SHALL remain visible inside the diegetic interface.
3. THE APPLICATION SHALL support mute, subtitles, reduced motion, and high contrast.
4. NO required information SHALL be conveyed by colour, sound, or motion alone.
5. THE PRIMARY desktop layout SHALL scale down to a usable mobile layout without hiding required controls.
6. FLASHING SHALL remain below accepted seizure-risk thresholds.

## R10 — Performance and resilience

1. THE FIRST playable control SHALL become available within 2.5 seconds on a typical broadband desktop connection after cached assets are excluded.
2. AUDIO SHALL load progressively and SHALL NOT block first interaction.
3. THE BUNDLED episode and critical visual assets SHALL work after a successful service-worker cache.
4. RUNTIME errors SHALL be captured without exposing secrets, personal data, dialogue prompts, or AWS credentials.

## R11 — Kiro evidence

1. THE ROOT repository SHALL include the complete `.kiro` directory and SHALL NOT ignore any part of it.
2. EVERY claimed Kiro feature SHALL be tied to a concrete decision, generated artifact, prevented defect, or measured workflow improvement.
3. THE BUILD SHALL preserve examples of spec-driven development, steering, custom agents, hooks, MCP use, PBT, Kiro CLI, Kiro Web, and Kiro Crew where genuinely used.
4. REVIEW evidence SHALL name the exact commit reviewed.
5. QUANTITY alone SHALL NOT be presented as proof of effective Kiro usage.

## R12 — Submission completeness

1. THE repository SHALL be public on GitHub and display an open-source licence.
2. THE submission SHALL provide a functioning public URL requiring no login.
3. THE judge video SHALL be public on YouTube and shorter than three minutes.
4. THE video SHALL show the complete playable loop on its intended device.
5. THE submission SHALL use only permitted trademarks, music, fonts, images, voices, and other assets.
6. ALL submission materials SHALL be available in English.
