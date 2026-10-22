import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { namedSounds, STINGER_RANK } from '../../src/audio/soundMap';
import { parseIndex, type AudioIndex } from '../../src/audio/manifest';
import { BOSS_MUSIC, ZONES } from '../../src/audio/zoneAudio';
import { AUDIO_DIR, INDEX_PATH, MEASURES_PATH, type Measure } from './build';
import { measuredLufs, measuredPeak, measureName, PEAK_CEILING, targetOf } from './levels';
import { SOUNDS, TRACKS } from './sounds';

/**
 * THE CHECK OF THE AUDIO (docs/PROMPT18-LOG.md): what has to be true of the files the game ships, read from the files themselves — no ffmpeg, no rendering, a second or two — so that it can run with every test and
 * with the build. A sound that is named and has no file, a file nobody names, a file that is not what its name says, a loop that clicks, a sound that has no level of its own or that clips, a piece whose layers are not
 * the same length: each is an error, and the check says which. (`audio:verify` is the slow half: it decodes the encoded files and measures what they became.)
 */
export interface CheckReport {
  errors: string[];
  warnings: string[];
  /** What was looked at, for the log. */
  counts: { sounds: number; files: number; tracks: number; bytes: number };
}

/** The most the audio folder may weigh (bytes): the manifest and every file in both formats — a browser fetches ONE format (about half of this) and only the sounds of the place it is in. */
export const SIZE_BUDGET_BYTES = 16 * 1024 * 1024;
/** The longest a sound effect may be (s); the stingers and the one-off big sounds may be longer. */
export const LONGEST_SFX_SECONDS = 9;
/** A loop closes if the step at its seam is within this many of its neighbourhood's steps, or is lower than this (dBFS). */
export const SEAM = { step: 4, jumpDb: -45 } as const;

const rel = (p: string): string => relative(AUDIO_DIR, p).split('\\').join('/');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function checkAudio(): CheckReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts = { sounds: 0, files: 0, tracks: 0, bytes: 0 };
  if (!existsSync(INDEX_PATH)) return { errors: ['public/audio/index.json does not exist: run `npm run audio:build`'], warnings, counts };
  const index: AudioIndex | null = parseIndex(JSON.parse(readFileSync(INDEX_PATH, 'utf8')));
  if (!index) return { errors: ['public/audio/index.json is not a manifest'], warnings, counts };
  const measures: Record<string, Measure> = existsSync(MEASURES_PATH) ? (JSON.parse(readFileSync(MEASURES_PATH, 'utf8')) as Record<string, Measure>) : {};
  counts.sounds = Object.keys(index.sounds).length;
  counts.tracks = Object.keys(index.tracks).length;

  // ---- the files: each exists, is what its name says (the name carries the first eight hex digits of its SHA-256), and nothing else is there
  const named = new Set<string>();
  for (const [id, s] of Object.entries(index.sounds)) {
    s.variants.forEach((v, k) => {
      for (const path of [v.opus, v.mp3]) {
        if (!path) {
          errors.push(`${id} (variation ${k + 1}) has no file in one of the two formats`);
          continue;
        }
        named.add(path);
        const abs = join(AUDIO_DIR, path);
        if (!existsSync(abs)) {
          errors.push(`${id}: ${path} does not exist`);
          continue;
        }
        const bytes = readFileSync(abs);
        counts.files++;
        counts.bytes += bytes.length;
        if (bytes.length < 200) errors.push(`${id}: ${path} is ${bytes.length} bytes — it is not a sound`);
        const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
        if (!path.includes(`.${hash}.`)) errors.push(`${id}: ${path} is not what its name says (its content is ${hash})`);
      }
    });
  }
  for (const p of walk(AUDIO_DIR)) {
    const r = rel(p);
    if (r === 'index.json') continue;
    if (!named.has(r)) errors.push(`${r} is in the audio folder and no sound names it`);
  }
  const total = counts.bytes + statSync(INDEX_PATH).size;
  if (total > SIZE_BUDGET_BYTES) errors.push(`the audio weighs ${(total / 1048576).toFixed(1)} MiB: the budget is ${(SIZE_BUDGET_BYTES / 1048576).toFixed(0)} MiB`);

  // ---- the recipes and the manifest say the same sounds
  const recipes = new Set(SOUNDS.map((r) => r.id));
  for (const t of TRACKS) for (const layer of layersOf(t.id, index)) recipes.add(layer); // (a piece's layers are named by what it rendered: the manifest has them)
  for (const id of Object.keys(index.sounds)) if (!recipes.has(id)) errors.push(`${id} is in the manifest and no recipe makes it`);
  for (const r of SOUNDS) if (!index.sounds[r.id]) errors.push(`${r.id} has a recipe and is not in the manifest: run \`npm run audio:build\``);
  for (const t of TRACKS) if (!index.tracks[t.id]) errors.push(`piece ${t.id} has a recipe and is not in the manifest`);

  // ---- every sound the game asks for exists, on the bus it plays on
  const need = (id: string, bus: string, who: string): void => {
    const s = index.sounds[id];
    if (!s) errors.push(`${who} asks for ${id}, which the manifest does not have`);
    else if (s.bus !== bus) errors.push(`${who} plays ${id} on the ${bus} bus and the manifest has it on the ${s.bus} bus`);
  };
  for (const id of namedSounds()) {
    const stinger = STINGER_RANK[id] !== undefined;
    const bus = id.startsWith('ui.') ? 'ui' : stinger ? 'music' : 'sfx';
    need(id, bus, 'the sound table');
  }
  need('hero.heartbeat', 'sfx', 'the conductor');
  const groups = new Set(Object.values(index.sounds).map((s) => s.group));
  for (const [room, z] of Object.entries(ZONES)) {
    for (const [what, id] of [['music', z.track], ['bed', z.bed]] as const) {
      if (!id) continue;
      const t = index.tracks[id];
      if (!t) errors.push(`${room} plays the ${what} "${id}", which the manifest does not have`);
      else if (what === 'bed' && index.sounds[t.layers['base'] as string]?.bus !== 'ambience') errors.push(`${room}: the bed "${id}" is not on the ambience bus`);
    }
    for (const sc of z.scatter) {
      need(sc.id, 'ambience', `${room}'s small sounds`);
      const g = index.sounds[sc.id]?.group;
      if (g && g !== 'core' && !(z.groups ?? []).includes(g)) errors.push(`${room} plays ${sc.id}, which is in the group "${g}", and does not hold that group: it would never be in memory`);
    }
    for (const g of z.groups ?? []) if (!groups.has(g)) errors.push(`${room} holds the group "${g}", which the manifest does not have`);
  }
  for (const [boss, id] of Object.entries(BOSS_MUSIC)) if (!index.tracks[id]) errors.push(`${boss}'s piece "${id}" is not in the manifest`);

  // ---- the pieces: the layers are all there, the same length, closing on themselves
  for (const [id, t] of Object.entries(index.tracks)) {
    const secs = Object.values(t.layers).map((lid) => index.sounds[lid]?.variants[0]?.seconds ?? 0);
    if (Math.max(...secs) - Math.min(...secs) > 0.002) errors.push(`piece ${id}: its layers are not the same length (${secs.join(', ')} s)`);
    if (!t.layers['base']) errors.push(`piece ${id} has no base layer`);
  }

  // ---- levels, peaks, silences and seams, from the measurements
  for (const [id, s] of Object.entries(index.sounds)) {
    const lufs = measuredLufs(id, s.variants.length, measures);
    const peak = measuredPeak(id, s.variants.length, measures);
    if (lufs === null || peak === null) {
      errors.push(`${id} has no measurement in tools/audio/measures.json: run \`npm run audio:build\``);
      continue;
    }
    const target = targetOf(id);
    if (!target) errors.push(`${id} has no loudness target in tools/audio/levels.ts`);
    else if (Math.abs(lufs + s.gainDb - target.lufs) > 1.1) errors.push(`${id} plays at ${(lufs + s.gainDb).toFixed(1)} LUFS and its target is ${target.lufs}: run \`npm run audio:balance\``);
    if (peak + Math.max(0, s.gainDb) > PEAK_CEILING + 0.05) errors.push(`${id} peaks at ${(peak + Math.max(0, s.gainDb)).toFixed(1)} dBFS once its trim is on: the ceiling is ${PEAK_CEILING}`);
    s.variants.forEach((v, k) => {
      const m = measures[measureName(id, k, s.variants.length)];
      if (!m) return;
      if (Math.abs(m.seconds - v.seconds) > 0.002) errors.push(`${id} (${k + 1}): the manifest says ${v.seconds} s and it was measured at ${m.seconds} s`);
      if (m.peakDb < -40) errors.push(`${id} (${k + 1}) is almost silent (peak ${m.peakDb} dBFS)`);
      if (s.loop) {
        if (m.silentMs > 100) errors.push(`${id} is a loop with a silence of ${m.silentMs} ms in it`);
        const closes = (m.seamStep ?? Infinity) <= SEAM.step || (m.seamJumpDb ?? 0) <= SEAM.jumpDb;
        if (!closes) errors.push(`${id} does not close on itself: its seam steps ×${m.seamStep} and ${m.seamJumpDb} dBFS`);
        if ((m.seamLevelDb ?? 0) > 6 && s.bus !== 'music') errors.push(`${id}: the level at the end of the loop is ${m.seamLevelDb} dB from the level at the start`);
      } else if (s.bus === 'sfx' || s.bus === 'ui') {
        if (v.seconds > LONGEST_SFX_SECONDS) errors.push(`${id} is ${v.seconds} s long: the longest an effect may be is ${LONGEST_SFX_SECONDS}`);
        if (m.silentMs > 450) warnings.push(`${id} (${k + 1}) has ${m.silentMs} ms of silence inside it`);
      }
    });
    if (s.loop && Math.abs(s.loop.end - s.variants[0]!.seconds) > 0.002) errors.push(`${id}: the loop ends at ${s.loop.end} s and the file is ${s.variants[0]!.seconds} s long`);
    if (s.cooldownMs < 0 || s.voices < 1) errors.push(`${id}: a cooldown or a voice count that makes no sense`);
  }
  return { errors, warnings, counts };
}

/** The ids of the layers of piece `id`, from the manifest (a piece is made of sounds named `<piece>.<layer>`). */
function layersOf(id: string, index: AudioIndex): string[] {
  return Object.values(index.tracks[id]?.layers ?? {});
}
