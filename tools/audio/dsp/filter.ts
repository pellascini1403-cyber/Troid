import { buf, SR, TAU, type Buf, type Param } from './core';

/**
 * FILTERS: the biquad of Robert Bristow-Johnson's cookbook (low-pass, high-pass, band-pass, notch, peak, shelves, all-pass), able to follow a cutoff or a Q that changes with time, and a few small ones. The state
 * is kept in doubles; the coefficients of a moving filter are worked out every `BLOCK` samples (a cutoff does not change faster than that).
 */

export type FilterType = 'lp' | 'hp' | 'bp' | 'notch' | 'peak' | 'ls' | 'hs' | 'ap';

const BLOCK = 8;

const at = (p: Param, i: number): number => (typeof p === 'number' ? p : (p[i] as number));

/** The five coefficients, already divided by a0: `[b0, b1, b2, a1, a2]`. */
export function biquadCoefs(type: FilterType, fc: number, q: number, gainDb = 0): [number, number, number, number, number] {
  const f = Math.min(Math.max(fc, 10), SR * 0.49);
  const w0 = (TAU * f) / SR;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const qq = Math.max(q, 0.05);
  const alpha = sin / (2 * qq);
  const A = 10 ** (gainDb / 40);
  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;
  switch (type) {
    case 'lp':
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'hp':
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'bp':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'peak':
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    case 'ap':
      b0 = 1 - alpha;
      b1 = -2 * cos;
      b2 = 1 + alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'ls':
    case 'hs': {
      const beta = 2 * Math.sqrt(A) * (sin / 2) * Math.sqrt(2); // shelf slope 1
      if (type === 'ls') {
        b0 = A * (A + 1 - (A - 1) * cos + beta);
        b1 = 2 * A * (A - 1 - (A + 1) * cos);
        b2 = A * (A + 1 - (A - 1) * cos - beta);
        a0 = A + 1 + (A - 1) * cos + beta;
        a1 = -2 * (A - 1 + (A + 1) * cos);
        a2 = A + 1 + (A - 1) * cos - beta;
      } else {
        b0 = A * (A + 1 + (A - 1) * cos + beta);
        b1 = -2 * A * (A - 1 + (A + 1) * cos);
        b2 = A * (A + 1 + (A - 1) * cos - beta);
        a0 = A + 1 - (A - 1) * cos + beta;
        a1 = 2 * (A - 1 - (A + 1) * cos);
        a2 = A + 1 - (A - 1) * cos - beta;
      }
      break;
    }
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** Filters `x` (a new buffer). `fc` (Hz) and `q` may change with time. */
export function biquad(x: Buf, type: FilterType, fc: Param, q: Param = 0.7071, gainDb = 0): Buf {
  const n = x.length;
  const out = buf(n);
  const moving = typeof fc !== 'number' || typeof q !== 'number';
  let [b0, b1, b2, a1, a2] = biquadCoefs(type, at(fc, 0), at(q, 0), gainDb);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < n; i++) {
    if (moving && i % BLOCK === 0) [b0, b1, b2, a1, a2] = biquadCoefs(type, at(fc, i), at(q, i), gainDb);
    const v = x[i] as number;
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    out[i] = y;
  }
  return out;
}

/** Filters `x` with coefficients that are already worked out (`[b0, b1, b2, a1, a2]`, a0 = 1): for a filter that comes from a standard rather than from a cookbook. */
export function biquadWith(x: Buf, c: readonly [number, number, number, number, number]): Buf {
  const out = buf(x.length);
  const [b0, b1, b2, a1, a2] = c;
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] as number;
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    out[i] = y;
  }
  return out;
}

export const lowpass = (x: Buf, fc: Param, q: Param = 0.7071): Buf => biquad(x, 'lp', fc, q);
export const highpass = (x: Buf, fc: Param, q: Param = 0.7071): Buf => biquad(x, 'hp', fc, q);
export const bandpass = (x: Buf, fc: Param, q: Param = 1): Buf => biquad(x, 'bp', fc, q);
export const peaking = (x: Buf, fc: number, q: number, gainDb: number): Buf => biquad(x, 'peak', fc, q, gainDb);
export const lowShelf = (x: Buf, fc: number, gainDb: number): Buf => biquad(x, 'ls', fc, 0.7071, gainDb);
export const highShelf = (x: Buf, fc: number, gainDb: number): Buf => biquad(x, 'hs', fc, 0.7071, gainDb);

/** A one-pole low-pass (6 dB per octave): a gentle roll-off, cheap. */
export function onePole(x: Buf, fc: Param): Buf {
  const out = buf(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const a = 1 - Math.exp((-TAU * at(fc, i)) / SR);
    y += a * ((x[i] as number) - y);
    out[i] = y;
  }
  return out;
}

/** Takes away what is below ~20 Hz (and the offset): nothing below it is a sound, and it eats headroom. */
export function dcBlock(x: Buf): Buf {
  const out = buf(x.length);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i] as number;
    y1 = v - x1 + 0.995 * y1;
    x1 = v;
    out[i] = y1;
  }
  return out;
}

/** The filters in series: a steeper slope (two low-passes are 24 dB per octave). */
export function cascade(x: Buf, type: FilterType, fc: Param, q: Param = 0.7071, stages = 2): Buf {
  let y = x;
  for (let s = 0; s < stages; s++) y = biquad(y, type, fc, q);
  return y;
}
