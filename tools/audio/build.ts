import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { AudioIndex, SoundDef, TrackDef } from '../../src/audio/manifest';
import { BITRATE, type SoundRecipe, type TrackRecipe } from './catalog';
import { mulberry32, seedOf, SR, type Stereo } from './dsp/core';
import { activeRmsDb, integratedLufs, loopSeam, momentaryLufs, peakDb, silence } from './dsp/measure';
import { toMono } from './dsp/sfxlib';
import { encodeFile, type Format } from './encode';

/**
 * THE BUILD OF THE AUDIO (docs/PROMPT18-LOG.md): renders every recipe of the catalogue, measures it, encodes it to Ogg Opus and MP3, names each file after its content (so a changed sound is a new file and a cache
 * never serves a stale one) and writes the manifest the engine reads (`public/audio/index.json`) and, apart, the measurements the checks read (`tools/audio/measures.json`).
 */

export const ROOT = resolve(import.meta.dirname, '../..');
export const AUDIO_DIR = join(ROOT, 'public/audio');
export const INDEX_PATH = join(AUDIO_DIR, 'index.json');
export const MEASURES_PATH = join(ROOT, 'tools/audio/measures.json');

export const ORIGIN = 'Synthesized in this repository by tools/audio (code of the project: oscillators, noise, filters, reverberation and scores written for this game). No recording, sample, library or third-party material is used: nothing here has an author other than the project.';

/** What was measured of one file (what was made, before encoding). */
export interface Measure {
  frames: number;
  seconds: number;
  peakDb: number;
  /** Integrated loudness for sounds of 3 s or more, the loudest 400 ms for the rest. */
  lufs: number;
  activeRmsDb: number;
  silentMs: number;
  /** For loops: the step at the seam over the usual step (1 is smooth), and how different the level of the last 50 ms is from the first. */
  seamStep?: number;
  seamLevelDb?: number;
  /** The step at the seam in dBFS: a step that is large against its neighbourhood is harmless when it is this low. */
  seamJumpDb?: number;
  /**
   * What the files that ship are, once a decoder has made them back into samples: their loudness measured as `lufs` is (the mean of the two formats'), and their peak (the higher of the two), before any trim. A lossy
   * codec takes the top of a bright sound off — a sword's swish comes out two LU quieter in Opus — so the trims are set from these (`audio:balance` writes them).
   */
  playedLufs?: number;
  playedPeakDb?: number;
}
export type Measures = Record<string, Measure>;

const kindOf = (r: SoundRecipe): 'sfx' | 'ambience' | 'music' => (r.bus === 'music' ? 'music' : r.bus === 'ambience' ? 'ambience' : 'sfx');

function bitrateFor(kind: 'sfx' | 'ambience' | 'music', channels: 1 | 2): { opus: number; mp3: number } {
  if (kind === 'music') return channels === 1 ? BITRATE.musicMono : BITRATE.music;
  if (kind === 'ambience') return channels === 1 ? BITRATE.ambienceMono : BITRATE.ambience;
  return channels === 1 ? BITRATE.sfxMono : BITRATE.sfxStereo;
}

const stem = (id: string, variant: number, variants: number): string => `${id.replace(/\./g, '_')}${variants > 1 ? `_${variant + 1}` : ''}`;

/** A pool of `limit` jobs at a time. */
async function pool<T>(jobs: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const k = next++;
      out[k] = await (jobs[k] as () => Promise<T>)();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return out;
}

function measure(pcm: Stereo, loop: boolean): Measure {
  const frames = pcm.l.length;
  const seconds = frames / SR;
  const long = seconds >= 3;
  const m: Measure = {
    frames,
    seconds: Math.round(seconds * 1000) / 1000,
    peakDb: round1(peakDb(pcm)),
    lufs: round1(long ? integratedLufs(pcm) : momentaryLufs(pcm)),
    activeRmsDb: round1(activeRmsDb(pcm)),
    silentMs: silence(pcm).longestMs,
  };
  if (loop) {
    const s = loopSeam(pcm);
    m.seamStep = Math.round(s.step * 100) / 100;
    m.seamLevelDb = round1(s.levelDb);
    m.seamJumpDb = round1(s.jumpDb);
  }
  return m;
}
const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Encodes `pcm` to every format and returns the files' paths relative to the audio folder. */
async function write(kind: 'sfx' | 'ambience' | 'music', name: string, pcm: Stereo, channels: 1 | 2): Promise<{ opus: string; mp3: string }> {
  const rates = bitrateFor(kind, channels);
  const source = channels === 1 ? toMono(pcm) : pcm;
  const out = {} as { opus: string; mp3: string };
  for (const fmt of ['opus', 'mp3'] as Format[]) {
    const ext = fmt === 'opus' ? 'opus' : 'mp3';
    const tmp = join(AUDIO_DIR, kind, `${name}.tmp.${ext}`);
    await encodeFile(source, tmp, fmt, { bitrate: rates[fmt] });
    const hash = createHash('sha256').update(readFileSync(tmp)).digest('hex').slice(0, 8);
    const finalPath = join(AUDIO_DIR, kind, `${name}.${hash}.${ext}`);
    renameSync(tmp, finalPath);
    out[fmt] = relative(AUDIO_DIR, finalPath).split('\\').join('/');
  }
  return out;
}

export interface BuildOptions {
  /** Only the sounds (and tracks) whose id starts with one of these: the rest of what is on disk is kept. */
  only?: string[];
  log?: (line: string) => void;
  recipes: { sounds: readonly SoundRecipe[]; tracks: readonly TrackRecipe[] };
}

export function readIndex(): AudioIndex | null {
  if (!existsSync(INDEX_PATH)) return null;
  return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as AudioIndex;
}

export function readMeasures(): Measures {
  return existsSync(MEASURES_PATH) ? (JSON.parse(readFileSync(MEASURES_PATH, 'utf8')) as Measures) : {};
}

const sorted = <T>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export async function buildAudio(o: BuildOptions): Promise<AudioIndex> {
  const log = o.log ?? (() => undefined);
  const wants = (id: string): boolean => !o.only || o.only.some((p) => id.startsWith(p));
  const previous = o.only ? readIndex() : null;
  const sounds: Record<string, SoundDef> = { ...(previous?.sounds ?? {}) };
  const tracks: Record<string, TrackDef> = { ...(previous?.tracks ?? {}) };
  const measures: Measures = o.only ? readMeasures() : {};
  for (const kind of ['sfx', 'ambience', 'music']) mkdirSync(join(AUDIO_DIR, kind), { recursive: true });

  const jobs: Array<() => Promise<void>> = [];
  for (const r of o.recipes.sounds) {
    if (!wants(r.id)) continue;
    jobs.push(async () => {
      const kind = kindOf(r);
      const variants: SoundDef['variants'] = [];
      let seconds = 0;
      for (let v = 0; v < r.variants; v++) {
        const pcm = r.render(v, mulberry32(seedOf(r.id, v)));
        const name = stem(r.id, v, r.variants);
        const m = measure(pcm, r.loop === true);
        measures[name] = m;
        const files = await write(kind, name, pcm, r.channels);
        variants.push({ opus: files.opus, mp3: files.mp3, seconds: m.seconds });
        seconds = m.seconds;
      }
      const def: SoundDef = {
        bus: r.bus,
        group: r.group,
        variants,
        channels: r.channels,
        gainDb: r.gainDb ?? 0,
        pitchCents: r.pitchCents ?? 0,
        gainJitterDb: r.gainJitterDb ?? 0,
        cooldownMs: r.cooldownMs ?? 0,
        voices: r.voices ?? 4,
        priority: r.priority ?? 5,
        reverb: r.reverb ?? 0,
      };
      if (r.duck) def.duck = r.duck;
      if (r.loop) def.loop = { start: 0, end: seconds };
      sounds[r.id] = def;
      log(`  ${r.id}  (${r.variants} × ${seconds.toFixed(2)} s)`);
    });
  }
  for (const t of o.recipes.tracks) {
    if (!wants(t.id)) continue;
    jobs.push(async () => {
      const layers = t.render(mulberry32(seedOf(t.id)));
      const ids: Record<string, string> = {};
      const bus = t.bus ?? 'music';
      let seconds = 0;
      for (const [layer, pcm] of Object.entries(layers)) {
        const id = `${t.id}.${layer}`;
        const name = id.replace(/\./g, '_');
        const m = measure(pcm, true);
        measures[name] = m;
        const channels: 1 | 2 = t.mono?.includes(layer) ? 1 : 2;
        const files = await write(bus, name, pcm, channels);
        seconds = m.seconds;
        sounds[id] = {
          bus,
          // the base layer comes with the piece; the others (the drive) are groups of their own, fetched when the game first asks for them
          group: layer === 'base' ? t.group : `${t.group}.${layer}`,
          variants: [{ opus: files.opus, mp3: files.mp3, seconds: m.seconds }],
          channels,
          gainDb: t.layerDb?.[layer] ?? 0,
          pitchCents: 0,
          gainJitterDb: 0,
          cooldownMs: 0,
          voices: 1,
          priority: bus === 'music' ? 10 : 1,
          reverb: 0,
          loop: { start: 0, end: m.seconds },
        };
        ids[layer] = id;
      }
      tracks[t.id] = { group: t.group, layers: ids, seconds, bpm: t.bpm, bars: t.bars };
      log(`  ${t.id}  (${Object.keys(layers).join(', ')}; ${seconds.toFixed(1)} s)`);
    });
  }
  await pool(jobs, 3);

  const index: AudioIndex = { version: 1, sampleRate: SR, origin: ORIGIN, sounds: sorted(sounds), tracks: sorted(tracks) };
  writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`);
  writeFileSync(MEASURES_PATH, `${JSON.stringify(sorted(measures), null, 1)}\n`);
  prune(index); // (what the manifest now names is kept, whether it was made by this run or an earlier one)
  return index;
}

/** The files a manifest names. */
export function filesOf(index: AudioIndex): string[] {
  const out: string[] = [];
  for (const s of Object.values(index.sounds)) for (const v of s.variants) for (const p of [v.opus, v.mp3]) if (p) out.push(p);
  return out;
}

/** Deletes what is in the audio folder and the manifest does not name (the files of a sound that changed or was taken out). */
export function prune(index: AudioIndex): string[] {
  const keep = new Set(filesOf(index));
  const removed: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const rel = relative(AUDIO_DIR, p).split('\\').join('/');
        if (rel !== 'index.json' && !keep.has(rel)) {
          rmSync(p);
          removed.push(rel);
        }
      }
    }
  };
  if (existsSync(AUDIO_DIR)) walk(AUDIO_DIR);
  return removed;
}

