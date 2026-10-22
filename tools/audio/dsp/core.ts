/**
 * THE CORE OF THE SYNTHESIS (docs/PROMPT18-LOG.md): the sample rate, a seeded random generator, the units (seconds → samples, decibels, notes → Hz) and the few operations on buffers everything else is built on.
 * Every sound and every piece of music of the game is made from these functions and the ones next to them (`osc`, `filter`, `env`, `fx`, `voices`): no sample of anybody else's. All of it is DETERMINISTIC — the same
 * recipe, the same seed, the same bytes — so a sound can be rebuilt and checked.
 */

/** The sample rate of everything that is made here: 48 kHz, the rate Opus decodes at (the browser resamples to its own, when it is another). */
export const SR = 48000;

/** One channel of audio. */
export type Buf = Float32Array;

/** Two channels. */
export interface Stereo {
  l: Buf;
  r: Buf;
}

/** A number that is constant or one per sample (a frequency that glides, a cutoff that sweeps). */
export type Param = number | Float32Array;

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A small, fast, good-enough seeded generator (mulberry32): `() => [0, 1)`. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit seed from any parts (FNV-1a): the id of a sound and its variant give that variant the same randomness every time. */
export function seedOf(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Seconds → samples. */
export const secs = (s: number): number => Math.max(0, Math.round(s * SR));
/** Decibels → linear amplitude, and back. */
export const dbToLin = (db: number): number => 10 ** (db / 20);
export const linToDb = (x: number): number => 20 * Math.log10(Math.max(x, 1e-12));

const SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `'D4'`, `'F#3'`, `'Bb2'` → MIDI number (C4 = 60). */
export function midiOf(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`not a note: ${note}`);
  const base = SEMITONES[m[1] as string] as number;
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return base + accidental + (Number(m[3]) + 1) * 12;
}

/** A note name or MIDI number → Hz (A4 = 440). */
export function hz(note: string | number): number {
  const midi = typeof note === 'number' ? note : midiOf(note);
  return 440 * 2 ** ((midi - 69) / 12);
}

/** A frequency moved by `cents`. */
export const detune = (f: number, cents: number): number => f * 2 ** (cents / 1200);

export const buf = (n: number): Buf => new Float32Array(Math.max(0, n));
export const stereo = (n: number): Stereo => ({ l: buf(n), r: buf(n) });

/** A constant or per-sample parameter, read at sample `i`. */
export const at = (p: Param, i: number): number => (typeof p === 'number' ? p : (p[i] as number));

/** Adds `src` into `dst` from sample `at` on (what does not fit is dropped), times `gain`. */
export function mixInto(dst: Buf, src: Buf, atSample = 0, gain = 1): void {
  const start = Math.max(0, atSample);
  const skip = start - atSample; // a negative `at`: the first samples of `src` are before the start
  const n = Math.min(src.length - skip, dst.length - start);
  for (let i = 0; i < n; i++) dst[start + i] = (dst[start + i] as number) + (src[skip + i] as number) * gain;
}

/** Adds a stereo buffer into another. */
export function mixStereoInto(dst: Stereo, src: Stereo, atSample = 0, gain = 1): void {
  mixInto(dst.l, src.l, atSample, gain);
  mixInto(dst.r, src.r, atSample, gain);
}

/** A new buffer: `b` times `k` (a per-sample pitch multiplier times a note's frequency is a frequency per sample). */
export function scaled(b: Buf, k: number): Buf {
  const out = buf(b.length);
  for (let i = 0; i < b.length; i++) out[i] = (b[i] as number) * k;
  return out;
}

export function scale(b: Buf, g: number): Buf {
  for (let i = 0; i < b.length; i++) b[i] = (b[i] as number) * g;
  return b;
}

/** Multiplies `b` by `e` sample by sample (the shorter one decides how many). */
export function times(b: Buf, e: Buf): Buf {
  const n = Math.min(b.length, e.length);
  for (let i = 0; i < n; i++) b[i] = (b[i] as number) * (e[i] as number);
  for (let i = n; i < b.length; i++) b[i] = 0;
  return b;
}

export function copy(b: Buf): Buf {
  return Float32Array.from(b);
}

export function peak(b: Buf): number {
  let p = 0;
  for (let i = 0; i < b.length; i++) {
    const v = Math.abs(b[i] as number);
    if (v > p) p = v;
  }
  return p;
}

export const peakStereo = (s: Stereo): number => Math.max(peak(s.l), peak(s.r));

export function rms(b: Buf, from = 0, to = b.length): number {
  let sum = 0;
  const end = Math.min(to, b.length);
  for (let i = from; i < end; i++) sum += (b[i] as number) ** 2;
  return Math.sqrt(sum / Math.max(1, end - from));
}

/** A linear fade from silence over the first `n` samples. */
export function fadeIn(b: Buf, n: number): Buf {
  const len = Math.min(n, b.length);
  for (let i = 0; i < len; i++) b[i] = (b[i] as number) * (i / len);
  return b;
}

/** A linear fade to silence over the last `n` samples. */
export function fadeOut(b: Buf, n: number): Buf {
  const len = Math.min(n, b.length);
  for (let i = 0; i < len; i++) b[b.length - 1 - i] = (b[b.length - 1 - i] as number) * (i / len);
  return b;
}

/** Removes a constant offset. */
export function removeDc(b: Buf): Buf {
  let sum = 0;
  for (let i = 0; i < b.length; i++) sum += b[i] as number;
  const mean = sum / Math.max(1, b.length);
  for (let i = 0; i < b.length; i++) b[i] = (b[i] as number) - mean;
  return b;
}

/** Scales the stereo buffer so its highest peak is `targetDb` dBFS; returns the gain it applied. */
export function normalizePeak(s: Stereo, targetDb: number): number {
  const p = peakStereo(s);
  if (p < 1e-9) return 1;
  const g = dbToLin(targetDb) / p;
  scale(s.l, g);
  scale(s.r, g);
  return g;
}

/** A mono buffer as a stereo one (the same signal in both). */
export function dual(b: Buf): Stereo {
  return { l: b, r: copy(b) };
}

/** Constant-power pan of a mono buffer: -1 left … 1 right. */
export function pan(b: Buf, p: number): Stereo {
  const a = ((clamp(p, -1, 1) + 1) * Math.PI) / 4;
  const l = buf(b.length);
  const r = buf(b.length);
  const gl = Math.cos(a);
  const gr = Math.sin(a);
  for (let i = 0; i < b.length; i++) {
    l[i] = (b[i] as number) * gl;
    r[i] = (b[i] as number) * gr;
  }
  return { l, r };
}

/** A buffer `from … to` samples of another (a copy). */
export function slice(b: Buf, from: number, to: number): Buf {
  return Float32Array.from(b.subarray(from, to));
}

/** How long (samples) a set of buffers is: the longest one. */
export const longest = (...bs: Buf[]): number => bs.reduce((m, b) => Math.max(m, b.length), 0);
