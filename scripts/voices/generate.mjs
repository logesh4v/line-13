#!/usr/bin/env node
// LINE 13 caller voices: Amazon Polly (neural) -> period-telephone filter (ffmpeg) -> hashed assets + manifest.
//   node scripts/voices/generate.mjs            synthesize lines that are new or changed
//   node scripts/voices/generate.mjs --dry-run  print character count and estimated cost, call nothing
//   node scripts/voices/generate.mjs --verify   offline: input <-> manifest <-> files, no AWS
// Credentials come from the default AWS profile; nothing is read from or written to the environment.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const INPUT = join(here, 'voices.input.json');
const OUT_DIR = join(here, '..', '..', 'apps', 'web', 'public', 'audio', 'voices');
const MANIFEST = join(OUT_DIR, 'manifest.json');
// Bump when the SSML shaping or the ffmpeg chain changes so every line is re-synthesized.
const PIPELINE_VERSION = 'telephone-2';
const NEURAL_USD_PER_MILLION_CHARS = 16;

// Band-pass to the telephone band, light compression, and quiet seeded hiss so output is repeatable.
const FILTER =
  '[0:a]highpass=f=320,lowpass=f=3300,acompressor=threshold=-20dB:ratio=3,acrusher=bits=11:mode=lin:mix=0.25,volume=6dB,alimiter=limit=0.9[v];' +
  'anoisesrc=d=30:c=pink:a=0.010:seed=13:r=24000,highpass=f=1800,lowpass=f=4800[n];' +
  '[v][n]amix=inputs=2:duration=first:normalize=0[o]';

// Judge-video narration: same voice pipeline, no telephone band-pass (a calm clean read).
const FILTER_NARRATION = '[0:a]volume=3dB,alimiter=limit=0.9[o]';
// Game lines and narration are separate manifest groups; the game only reads `lines`.
const GROUPS = ['lines', 'narration'];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildSsml(line, voice) {
  const text = escapeXml(line.text).replace(/([.!?]) (?=\S)/g, '$1 <break time="350ms"/>');
  const soft = line.style === 'whisper';
  const rate = soft ? `${Math.round(parseInt(voice.rate, 10) * 0.9)}%` : voice.rate;
  const attrs = `rate="${rate}"${soft ? ' volume="soft"' : ''}`;
  const lead = line.style === 'narration' ? '' : '<break time="250ms"/>';
  return `<speak>${lead}<prosody ${attrs}>${text}</prosody></speak>`;
}

const inputHash = (input, line, ssml) =>
  sha256(JSON.stringify([PIPELINE_VERSION, input.engine, input.voices[line.speaker], ssml, line.text]));

function loadInput() {
  const input = JSON.parse(readFileSync(INPUT, 'utf8'));
  const ids = new Set();
  for (const line of GROUPS.flatMap((g) => input[g] ?? [])) {
    if (ids.has(line.id)) throw new Error(`duplicate line id ${line.id}`);
    ids.add(line.id);
    if (!input.voices[line.speaker]) throw new Error(`no voice for speaker ${line.speaker}`);
    if (!line.text.trim()) throw new Error(`empty text for ${line.id}`);
  }
  return input;
}

function loadManifest() {
  return existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;
}

function duration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Math.round(parseFloat(out.toString()) * 1000);
}

function synthesize(input, line, ssml, work) {
  const voice = input.voices[line.speaker];
  const raw = join(work, 'raw.mp3');
  const out = join(work, 'out.mp3');
  execFileSync('aws', [
    'polly', 'synthesize-speech', '--engine', input.engine, '--voice-id', voice.voiceId,
    '--language-code', voice.languageCode, '--sample-rate', input.sampleRate,
    '--output-format', 'mp3', '--text-type', 'ssml', '--text', ssml, raw,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', raw, '-filter_complex', line.style === 'narration' ? FILTER_NARRATION : FILTER, '-map', '[o]', '-ac', '1', '-ar', '24000',
    '-c:a', 'libmp3lame', '-q:a', '5', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', out,
  ]);
  return { bytes: readFileSync(out), out };
}

function generate({ dryRun }) {
  const input = loadInput();
  const previous = loadManifest();
  const groups = { lines: {}, narration: {} };
  let chars = 0;
  const work = mkdtempSync(join(tmpdir(), 'line13-voices-'));
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [group, line] of GROUPS.flatMap((g) => (input[g] ?? []).map((l) => [g, l]))) {
      const voice = input.voices[line.speaker];
      const ssml = buildSsml(line, voice);
      const inputSha = inputHash(input, line, ssml);
      const old = previous?.[group]?.[line.id];
      if (old && old.inputSha === inputSha && existsSync(join(OUT_DIR, old.file))) {
        groups[group][line.id] = old;
        continue;
      }
      chars += ssml.length;
      if (dryRun) { console.log(`would synthesize ${line.id} (${ssml.length} chars)`); continue; }
      const { bytes, out } = synthesize(input, line, ssml, work);
      const digest = sha256(bytes);
      const file = `${digest}.mp3`;
      writeFileSync(join(OUT_DIR, file), bytes);
      groups[group][line.id] = {
        file, sha256: digest, durationMs: duration(out), text: line.text, speaker: line.speaker,
        voiceId: voice.voiceId, style: line.style, inputSha,
      };
      console.log(`${line.id} -> ${file.slice(0, 12)}… ${groups[group][line.id].durationMs}ms`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`${dryRun ? 'would bill' : 'billed'} ${chars} SSML chars ≈ $${((chars * NEURAL_USD_PER_MILLION_CHARS) / 1e6).toFixed(4)}`);
  if (dryRun) return;
  const manifest = {
    schemaVersion: 1, engine: input.engine, pipeline: PIPELINE_VERSION, ...groups,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  // Remove audio no longer referenced so the directory is exactly the manifest.
  const keep = new Set(Object.values(groups).flatMap((g) => Object.values(g)).map((l) => l.file));
  for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.mp3') && !keep.has(f)) rmSync(join(OUT_DIR, f));
}

function verify() {
  const input = loadInput();
  const manifest = loadManifest();
  const problems = [];
  if (!manifest) problems.push('manifest missing');
  const all = GROUPS.flatMap((g) => (input[g] ?? []).map((l) => [g, l]));
  for (const [group, line] of all) {
    const e = manifest?.[group]?.[line.id];
    if (!e) { problems.push(`${line.id}: not in manifest`); continue; }
    if (e.text !== line.text) problems.push(`${line.id}: manifest text differs from input`);
    const p = join(OUT_DIR, e.file);
    if (!existsSync(p)) { problems.push(`${line.id}: ${e.file} missing`); continue; }
    if (sha256(readFileSync(p)) !== e.sha256 || e.file !== `${e.sha256}.mp3`) problems.push(`${line.id}: hash mismatch`);
    if (!(e.durationMs > 0)) problems.push(`${line.id}: bad duration`);
  }
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`verified ${all.length} lines`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--verify')) verify();
  else generate({ dryRun: process.argv.includes('--dry-run') });
}
