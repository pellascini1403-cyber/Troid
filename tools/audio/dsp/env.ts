import { buf, SR, type Buf } from './core';

/**
 * ENVELOPES: how loud (or how high, or how open) something is, over time. `envelope` joins breakpoints (time in seconds, value) with straight or exponential segments; `adsr`, `ar` and `decay` are the shapes
 * a sound is usually given. They are control signals: multiply them into a sound with `times`.
 */

export type Point = readonly [timeSec: number, value: number];

/** A piecewise envelope of `n` samples through `points` (sorted by time). Before the first point and after the last it holds that value. `exp` joins positive values with an exponential, which is what the ear hears as even. */
export function envelope(n: number, points: readonly Point[], curve: 'lin' | 'exp' = 'lin'): Buf {
  const out = buf(n);
  if (points.length === 0) return out;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (k < points.length - 1 && t >= (points[k + 1] as Point)[0]) k++;
    const a = points[k] as Point;
    const b = points[Math.min(k + 1, points.length - 1)] as Point;
    if (t <= a[0] || b[0] <= a[0]) {
      out[i] = t < a[0] ? (points[0] as Point)[1] : t >= b[0] ? b[1] : a[1];
      if (t >= (points[points.length - 1] as Point)[0]) out[i] = (points[points.length - 1] as Point)[1];
      continue;
    }
    const f = (t - a[0]) / (b[0] - a[0]);
    if (curve === 'exp' && a[1] > 0 && b[1] > 0) out[i] = a[1] * (b[1] / a[1]) ** f;
    else out[i] = a[1] + (b[1] - a[1]) * f;
  }
  return out;
}

/**
 * Attack, decay, sustain, release — the release is the last `r` seconds of the buffer. The attack is a straight rise (a click-free start), the decay and the release fall exponentially (as a struck or released
 * string does). `s` is the sustain level, 0 … 1.
 */
export function adsr(n: number, a: number, d: number, s: number, r: number): Buf {
  const out = buf(n);
  const na = Math.round(a * SR);
  const nd = Math.round(d * SR);
  const nr = Math.min(n, Math.round(r * SR));
  const relStart = n - nr;
  for (let i = 0; i < n; i++) {
    let v: number;
    if (i < na) v = i / Math.max(1, na);
    else if (i < na + nd) v = s + (1 - s) * Math.exp((-5 * (i - na)) / Math.max(1, nd));
    else v = s;
    if (i >= relStart) {
      const f = (i - relStart + 1) / Math.max(1, nr);
      v *= Math.exp(-6 * f) * (1 - f ** 8); // falls like a released string and ends at exactly zero
    }
    out[i] = v;
  }
  return out;
}

/** A rise over `a` seconds and a fall over `r` seconds (the buffer is `a + r` or longer): the envelope of a swell or a whoosh. */
export function ar(n: number, a: number, r: number, curve = 2): Buf {
  const out = buf(n);
  const na = Math.max(1, Math.round(a * SR));
  const nr = Math.max(1, Math.min(n - na, Math.round(r * SR)));
  for (let i = 0; i < n; i++) {
    if (i < na) out[i] = (i / na) ** curve;
    else if (i < na + nr) out[i] = (1 - (i - na) / nr) ** curve;
    else out[i] = 0;
  }
  return out;
}

/** An exponential decay with time constant `tau` seconds (it is 37 % after `tau`, 5 % after three). */
export function decay(n: number, tau: number): Buf {
  const out = buf(n);
  const k = 1 / Math.max(1e-6, tau * SR);
  for (let i = 0; i < n; i++) out[i] = Math.exp(-i * k);
  return out;
}

/** On from `on` to `off` seconds, with a `fade` at each edge so that it never clicks. */
export function gate(n: number, on: number, off: number, fade = 0.003): Buf {
  const out = buf(n);
  const a = Math.round(on * SR);
  const b = Math.round(off * SR);
  const f = Math.max(1, Math.round(fade * SR));
  for (let i = 0; i < n; i++) {
    if (i < a || i >= b) out[i] = 0;
    else out[i] = Math.min(1, (i - a) / f, (b - 1 - i) / f);
  }
  return out;
}

/** The loudness of a sound over time as a smooth curve: the envelope follower used to make one sound follow another. */
export function follow(x: Buf, attackMs = 5, releaseMs = 80): Buf {
  const out = buf(x.length);
  const ka = Math.exp(-1 / ((attackMs / 1000) * SR));
  const kr = Math.exp(-1 / ((releaseMs / 1000) * SR));
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i] as number);
    y = v > y ? ka * y + (1 - ka) * v : kr * y + (1 - kr) * v;
    out[i] = y;
  }
  return out;
}
