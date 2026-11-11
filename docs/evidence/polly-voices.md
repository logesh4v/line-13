# Amazon Polly caller voices (Milestone 5)

Branch `feat/polly-voices` (from `feat/full-episode`), worktree `/Users/logesh/workplace/line-13-voices`. Not pushed.

- Code commit: `2bb51d154a14017e09d609bf0128ce800f75f496` (this evidence file is committed right after it)
- AWS: default profile, account user `logesh-admin`, region `us-east-1`, Polly **neural** engine, `aws polly synthesize-speech` via CLI. No credential env vars exported.

## Voices

| Speaker | Polly voice | Rate | Notes |
|---|---|---|---|
| Ruth Bell | Joanna (en-US) | 88% | |
| Amos Kettle | Arthur (en-GB) | 82% | |
| Tobias Wren | Gregory (en-US) | 86% | |
| Ines Marrow | Amy (en-GB) | 90% | |
| LINE 13 | Stephen (en-US) | 72% | all four lines soft |
| Judge-video narrator | Matthew (en-US) | 94% | calm, no telephone filter |

Recovery whispers (each caller's last clue) and LINE 13 use soft volume and a 10% slower rate. Polly neural rejects `phonation="soft"` and the whispered effect (`Unsupported Neural feature`), so a whisper is `prosody volume="soft"` instead.
Pauses: 250 ms lead-in and 350 ms after each sentence. Post (ffmpeg): 320 Hz high-pass, 3.3 kHz low-pass, compressor, light bit-crush, +6 dB with limiter, plus seeded (`seed=13`) pink-noise hiss mixed in; mono 24 kHz MP3 with metadata stripped. The ffmpeg stage is byte-deterministic (two runs gave the same sha256).

## Numbers

- Lines voiced: **21 game lines** (4 caller openings, 13 clues, LINE 13 wake and 3 haunt lines) + **11 judge-video narration lines** (all 11 rows of `/Users/logesh/workplace/line-13-submission/video-script.md`, quoted text exact) = 32 files.
- Audio length: 112 s game lines, 89 s narration. Directory 33 files (32 mp3 + manifest).
- Characters: 1,275 (game) + 1,357 (narration) = 2,632 plain characters per full run. The game lines were synthesized twice (a first pass, then again after raising gain), so about 3,907 characters were billed in total.
- Cost estimate at the neural list price of $16 per million characters: about **$0.06** (upper bound $0.14 if SSML tags were counted, which Polly does not). Not checked against the AWS bill.

## Where things are

- Reviewable text input: `scripts/voices/voices.input.json` (every line, speaker, style; `text` is the exact caption)
- Generator: `scripts/voices/generate.mjs` (`--dry-run` cost preview, `--verify` offline check; skips lines whose input hash is unchanged, so no repeat spend)
- Assets: `apps/web/public/audio/voices/<sha256>.mp3`
- Manifest: `apps/web/public/audio/voices/manifest.json` (line id → file, sha256, durationMs, text, voice; groups `lines` for the game and `narration` for the video)
- Web wiring: `apps/web/src/audio/voices.ts` (strict manifest parser, lookup by exact caption), `apps/web/src/audio/exchangeAudio.ts` (`speak`), `apps/web/src/hooks/useExchange.ts` (speaks new spoken transcript lines). The manifest is bundled, so the client still calls no `fetch` (the house rule test stays green); only the mp3 files are static assets.
- `packages/haunting` was not changed.

## Invariants and tests

- Caption equals audio script: a voice is found only by exact caption text, and the test checks every spoken caption in the bundled episode, `LINE_13_VOICE` and `OPERATOR_COPY.line13Wakes` has a manifest entry with identical text, and that input, manifest and spoken captions are the same set (21).
- Deterministic by hash: file name is the sha256 of its bytes (tested for all 21 + 11 files); re-running the generator spent nothing and changed nothing.
- Muted or files missing: `speak` returns early when muted, with no `Audio`, or with no match; play errors are swallowed; captions are untouched. Existing reducer/game tests (complete runs need no audio) still pass.
- Missing-manifest and corrupted-manifest cases: `parseVoiceManifest` returns no voices for undefined, null, wrong types, wrong schema version, or `lines` not an object, and drops entries with a non-hash file name, a path-like name, empty text or non-positive duration.

Commands run in `/Users/logesh/workplace/line-13-voices`:
- `npm test -w @line-13/web`: 131 pass, 0 fail
- `npm run typecheck -w @line-13/web`: clean
- `npm run build -w @line-13/web`: built, mp3 files copied to `dist/audio/voices/`
- `npm test -w @line-13/haunting` (60 pass) and `npm run typecheck -w @line-13/haunting`: clean
- `node scripts/voices/generate.mjs --verify`: verified 32 lines

## Skipped or not checked

- No listening pass in a real browser (autoplay, speaker levels, how a voice overlaps the sound effects); only decoded and level-checked with ffmpeg.
- Nothing is wired for the narration into the game (it is for the video editor).
- Voice pairing is my choice, not auditioned by the user; swap a `voiceId` in the input file and re-run to change one.
- The `/api` publication path and `episode.schema.json` asset hashes were not touched; the bundled episode still lists no Polly assets, and the web finds voices by caption.
- Bill not checked.
