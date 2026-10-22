import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { AudioIndex } from '../../src/audio/manifest';
import { healLoop, seamCloses, seamMetric, type SeamMetric } from '../../src/audio/seam';
import { AUDIO_DIR, INDEX_PATH } from './build';
import { SR } from './dsp/core';
import { integratedLufs, momentaryLufs, peakDb, truePeakDb } from './dsp/measure';
import { decodeFile } from './encode';
import { measureName, PEAK_CEILING, targetOf } from './levels';

/**
 * THE VERIFICATION OF THE FILES THAT SHIP (docs/PROMPT18-LOG.md): `audio:check` reads the numbers the build wrote down; this decodes the files themselves — each sound, each variation, in both formats, with a decoder that is
 * not the one that made them — and measures what a player's browser is given. It is the slow half (a few seconds per hundred files), and answers the questions the numbers cannot:
 *
 *   • the file is as long as the manifest says (a loop is only a loop to the sample),
 *   • a lossy codec has not made it clip (the peak after decoding, with the trim the engine puts on it, is under full scale),
 *   • it plays at the loudness the mix is built on — the decoded file, with its trim, against the target of its kind — in the format the browser takes first and in the other,
 *   • a loop closes: the step across its seam, as it comes out of the decoder and after the loader has closed it again (`src/audio/seam.ts`).
 */
export interface VerifyRow {
  id: string;
  format: 'opus' | 'mp3';
  variant: number;
  frames: number;
  /** The decoded file's length against the manifest's (ms). */
  lengthMs: number;
  /** Peak after decoding, with the trim (dBFS). */
  peakDb: number;
  truePeakDb: number;
  /** Loudness after decoding, with the trim, against the target of its kind (LU; positive: louder than the target). */
  levelError: number;
  seam?: { raw: SeamMetric; mended: SeamMetric };
}

export interface VerifyReport {
  errors: string[];
  warnings: string[];
  rows: VerifyRow[];
}

/** The decoded loudness may be this far from the target of its kind (LU) before it is an error, or a warning. */
export const LEVEL_TOLERANCE = { error: 1.6, warn: 0.9 } as const;
/** How far the quietest variation of a sound may be under its loudest (LU): a light blow is under a heavy one, but a variation that is not the same sound is a different sound. */
export const VARIATION_SPREAD = { error: 5, warn: 3.5 } as const;
/**
 * A file may be this far from the length the manifest says (ms). A loop is a loop only to the sample, and the manifest keeps milliseconds: 0.6 ms. A sound that plays once may end up to two milliseconds long or short — a
 * decoder that keeps the padding of an MP3 frame leaves a thousandth of a second of silence at the end of it.
 */
export const LENGTH_TOLERANCE_MS = { loop: 0.6, once: 2 } as const;
/** The peak of a decoded sound with its trim must be under this (dBFS): a codec overshoots a peak by up to a decibel, and the limiter is a safety net, not part of the sound. */
export const DECODED_PEAK_LIMIT = -0.3;

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

/**
 * What a decoder gives back of each file, before any trim — the loudness (measured as the build measures it) and the sample peak — by the name `measures.json` keeps its numbers under. `audio:balance` sets the trims from
 * these: a codec takes the top of a bright sound off, and it is the decoded file that a player's browser plays. A browser takes Opus first and MP3 if it has no Opus, and the two come out up to two LU apart on a swishing
 * sound; one trim has to serve both, so the loudness is the mean of the two (each is then within a LU of the target) and the peak is the higher of the two.
 */
export async function measurePlayed(): Promise<Record<string, { lufs: number; peakDb: number }>> {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as AudioIndex;
  const found: Record<string, Array<{ lufs: number; peakDb: number }>> = {};
  const jobs: Array<() => Promise<void>> = [];
  for (const [id, def] of Object.entries(index.sounds)) {
    def.variants.forEach((variant, k) => {
      for (const format of ['opus', 'mp3'] as const) {
        const path = variant[format];
        if (!path) continue;
        jobs.push(async () => {
          const pcm = await decodeFile(join(AUDIO_DIR, path), def.channels);
          const seconds = pcm.l.length / SR;
          (found[measureName(id, k, def.variants.length)] ??= []).push({ lufs: seconds >= 3 ? integratedLufs(pcm) : momentaryLufs(pcm), peakDb: peakDb(pcm) });
        });
      }
    });
  }
  await pool(jobs, 4);
  const round1 = (v: number): number => Math.round(v * 10) / 10;
  return Object.fromEntries(
    Object.entries(found).map(([name, list]) => [name, { lufs: round1(list.reduce((a, b) => a + b.lufs, 0) / list.length), peakDb: round1(Math.max(...list.map((x) => x.peakDb))) }]),
  );
}

export async function verifyAudio(log: (line: string) => void = () => undefined): Promise<VerifyReport> {
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as AudioIndex;
  const errors: string[] = [];
  const warnings: string[] = [];
  const jobs: Array<() => Promise<VerifyRow>> = [];
  for (const [id, def] of Object.entries(index.sounds)) {
    def.variants.forEach((variant, k) => {
      for (const format of ['opus', 'mp3'] as const) {
        const path = variant[format];
        if (!path) continue;
        jobs.push(async () => {
          const pcm = await decodeFile(join(AUDIO_DIR, path), def.channels);
          const trim = 10 ** (def.gainDb / 20);
          const frames = pcm.l.length;
          const seconds = frames / SR;
          const row: VerifyRow = {
            id,
            format,
            variant: k,
            frames,
            lengthMs: (seconds - variant.seconds) * 1000,
            peakDb: 0,
            truePeakDb: 0,
            levelError: 0,
          };
          // what the engine plays: the decoded file under its trim
          const played = { l: pcm.l.map((v) => v * trim), r: pcm.r.map((v) => v * trim) };
          row.peakDb = peakDb(played);
          row.truePeakDb = truePeakDb(played);
          const target = targetOf(id);
          const lufs = seconds >= 3 ? integratedLufs(played) : momentaryLufs(played);
          row.levelError = target ? lufs - target.lufs : 0;
          if (def.loop) {
            const raw = seamMetric([pcm.l, pcm.r]);
            healLoop([pcm.l, pcm.r], SR);
            row.seam = { raw, mended: seamMetric([pcm.l, pcm.r]) };
          }
          return row;
        });
      }
    });
  }
  const rows = await pool(jobs, 4);
  for (const r of rows) {
    const who = `${r.id} (${r.format}, variation ${r.variant + 1})`;
    if (Math.abs(r.lengthMs) > (r.seam ? LENGTH_TOLERANCE_MS.loop : LENGTH_TOLERANCE_MS.once)) errors.push(`${who}: decoded it is ${r.lengthMs.toFixed(2)} ms from the length the manifest says`);
    if (r.peakDb > DECODED_PEAK_LIMIT) errors.push(`${who}: peaks at ${r.peakDb.toFixed(2)} dBFS once decoded and trimmed (the limit is ${DECODED_PEAK_LIMIT}; the build's ceiling was ${PEAK_CEILING} before the codec)`);
    if (r.truePeakDb > 0.5) warnings.push(`${who}: its true peak is ${r.truePeakDb.toFixed(2)} dBTP`);
    if (r.seam && !seamCloses(r.seam.mended)) errors.push(`${who}: the seam does not close even once mended (×${r.seam.mended.step.toFixed(2)}, ${r.seam.mended.jumpDb.toFixed(1)} dBFS)`);
  }
  // loudness, by sound and format: a sound's trim is made for its loudest variation (the others are a little under it, as a light blow is under a heavy one), so it is the loudest that must be at the target — and the
  // variations must not be so far apart that one of them is a different sound
  const groups = new Map<string, VerifyRow[]>();
  for (const r of rows) groups.set(`${r.id}\u0000${r.format}`, [...(groups.get(`${r.id}\u0000${r.format}`) ?? []), r]);
  const spreads: Array<{ id: string; format: string; spread: number }> = [];
  for (const [key, list] of groups) {
    const [id, format] = key.split('\u0000') as [string, string];
    const loudest = Math.max(...list.map((r) => r.levelError));
    const spread = loudest - Math.min(...list.map((r) => r.levelError));
    if (targetOf(id)) {
      if (Math.abs(loudest) > LEVEL_TOLERANCE.error) errors.push(`${id} (${format}): its loudest variation plays ${loudest > 0 ? '+' : ''}${loudest.toFixed(1)} LU from the target of its kind`);
      else if (Math.abs(loudest) > LEVEL_TOLERANCE.warn) warnings.push(`${id} (${format}): its loudest variation plays ${loudest > 0 ? '+' : ''}${loudest.toFixed(1)} LU from its target`);
    }
    if (list.length > 1) {
      spreads.push({ id, format, spread });
      if (spread > VARIATION_SPREAD.error) errors.push(`${id} (${format}): its variations are ${spread.toFixed(1)} LU apart`);
      else if (spread > VARIATION_SPREAD.warn) warnings.push(`${id} (${format}): its variations are ${spread.toFixed(1)} LU apart`);
    }
  }
  const opened = rows.filter((r) => r.seam && !seamCloses(r.seam.raw));
  const widest = [...spreads].sort((a, b) => b.spread - a.spread).slice(0, 3);
  log(`the widest spreads between variations (LU): ${widest.map((w) => `${w.id}/${w.format} ${w.spread.toFixed(1)}`).join(', ') || 'none'}`);
  log(`${rows.length} files decoded (${new Set(rows.map((r) => r.id)).size} sounds): ${opened.length} loops open at the seam as the decoder leaves them (${opened.map((r) => `${r.id}/${r.format}`).join(', ') || 'none'}), all closed once mended`);
  return { errors, warnings, rows };
}
