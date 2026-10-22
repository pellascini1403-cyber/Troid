import { buf, clamp, dbToLin, linToDb, mixInto, SR, stereo, TAU, type Buf, type Param, type Stereo } from './core';
import { highpass } from './filter';

/**
 * EFFECTS: echo, chorus, the reverberation of a room (a feedback delay network: the sound of stone, of a hall, of a cave), a saturator, a compressor and a look-ahead limiter. Everything here works on a whole
 * buffer at once (these sounds are rendered offline, not live), so a "look-ahead" costs no delay.
 */

const at = (p: Param, i: number): number => (typeof p === 'number' ? p : (p[i] as number));

/** A feedback echo: `time` seconds apart, each repeat `feedback` as loud as the last and darker (low-pass at `dampHz`); `mix` is the level of the repeats. The result is longer by `tail` seconds so that the last repeats are not cut. */
export function echo(x: Buf, timeSec: number, feedback: number, dampHz = 4000, mix = 0.5, tailSec = 1.5): Buf {
  const n = x.length + Math.round(tailSec * SR);
  const out = buf(n);
  const d = Math.max(1, Math.round(timeSec * SR));
  const line = buf(n);
  const a = 1 - Math.exp((-TAU * dampHz) / SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const dry = i < x.length ? (x[i] as number) : 0;
    const wet = i >= d ? (line[i - d] as number) : 0;
    lp += a * (wet - lp);
    line[i] = dry + feedback * lp;
    out[i] = dry + mix * wet;
  }
  return out;
}

/** A chorus: the sound against copies of itself a few milliseconds late, the delay swinging slowly — a wide, shimmering stereo. Returns a stereo buffer. */
export function chorus(x: Buf, rate = 0.6, depthMs = 5, baseMs = 14, mix = 0.5, voices = 2): Stereo {
  const n = x.length;
  const out = stereo(n);
  const depth = (depthMs / 1000) * SR;
  const base = (baseMs / 1000) * SR;
  for (let ch = 0; ch < 2; ch++) {
    const dst = ch === 0 ? out.l : out.r;
    for (let i = 0; i < n; i++) dst[i] = (x[i] as number) * (1 - mix * 0.5);
    for (let v = 0; v < voices; v++) {
      const phase = (v + ch * 0.5) / voices;
      const r = rate * (1 + 0.13 * v);
      for (let i = 0; i < n; i++) {
        const d = base * (1 + 0.15 * v) + depth * Math.sin(TAU * (phase + (r * i) / SR));
        const p = i - d;
        if (p < 0) continue;
        const k = Math.floor(p);
        const f = p - k;
        const s = (x[k] as number) * (1 - f) + (x[Math.min(n - 1, k + 1)] as number) * f;
        dst[i] = (dst[i] as number) + (s * mix) / voices;
      }
    }
  }
  return out;
}

export interface ReverbOptions {
  /** Seconds for the low part of the tail to fall by 60 dB. */
  rt60: number;
  /** Delay before the tail begins (ms). */
  predelayMs?: number;
  /** Scales the delay lines: 0.6 a small stone cell, 1 a hall, 1.8 a cathedral. */
  size?: number;
  /** 0 bright … 1 dark: how fast the high part of the tail dies compared with the low part. */
  damp?: number;
  /** How far the delay lines are swung (ms) and how fast (Hz): it keeps a ringing room from sounding metallic. */
  modDepthMs?: number;
  modRateHz?: number;
  /** The wet signal is high-passed here (Hz): a tail with no mud. */
  lowCutHz?: number;
  /** Level of the tail and of the untouched input. */
  wet?: number;
  dry?: number;
  /** Seconds added after the input for the tail to ring out (default: `rt60`). */
  tailSec?: number;
  /**
   * The input is a LOOP of this many seconds, whose end will be followed by its start: the modulation of every delay line is then made to complete a whole number of cycles in it, so that the room answers the loop's
   * end exactly as it answers its start, and a reverberation folded back onto the beginning of the loop closes on itself with no seam.
   */
  loopSec?: number;
}

const FDN_MS = [29.7, 37.1, 41.1, 43.7, 53.3, 59.3, 61.9, 67.7] as const;
const DIFFUSER_MS = [4.8, 3.6, 12.7, 9.3] as const;
const EARLY_MS = [7, 13, 19, 29, 41, 53] as const;
const EARLY_GAIN = [0.5, 0.42, 0.34, 0.26, 0.18, 0.12] as const;

/** The reverberation of a room, as a feedback delay network of eight lines mixed by a Hadamard matrix (it loses no energy by itself: all the decay is the lines' own, `rt60`), with input diffusers, a darkening of the tail, slow modulation and a few early reflections. */
export function reverb(input: Stereo, o: ReverbOptions): Stereo {
  const size = o.size ?? 1;
  const damp = clamp(o.damp ?? 0.35, 0, 1);
  const wetGain = o.wet ?? 0.35;
  const dryGain = o.dry ?? 1;
  const tail = Math.round((o.tailSec ?? o.rt60) * SR);
  const n = input.l.length + tail;
  const pre = Math.round(((o.predelayMs ?? 12) / 1000) * SR);
  const depth = ((o.modDepthMs ?? 0.4) / 1000) * SR;
  const rate = o.modRateHz ?? 0.3;

  // the input (a little of the side signal goes in too, so that the tail has a width of its own)
  const mid = buf(n);
  const side = buf(n);
  for (let i = 0; i < input.l.length; i++) {
    mid[i] = ((input.l[i] as number) + (input.r[i] as number)) * 0.5;
    side[i] = ((input.l[i] as number) - (input.r[i] as number)) * 0.5;
  }

  // the diffusers: four all-pass filters in series smear the attack of the input into a dense wash
  let diffused = mid;
  for (const ms of DIFFUSER_MS) {
    const d = Math.max(2, Math.round((ms / 1000) * SR * Math.min(1.4, Math.max(0.7, size))));
    const line = buf(d);
    const out = buf(n);
    let w = 0;
    const g = 0.62;
    for (let i = 0; i < n; i++) {
      const delayed = line[w] as number;
      const v = (diffused[i] as number) - g * delayed;
      line[w] = v;
      out[i] = delayed + g * v;
      w = (w + 1) % d;
    }
    diffused = out;
  }

  // the tank
  const lines = FDN_MS.map((ms) => Math.max(8, Math.round((ms / 1000) * SR * size)));
  const maxLen = Math.max(...lines) + Math.ceil(depth) + 4;
  const mem = lines.map(() => buf(maxLen));
  const wp = new Int32Array(8);
  const gain = lines.map((d) => 10 ** ((-3 * d) / (Math.max(0.05, o.rt60) * SR)));
  const lpState = new Float64Array(8);
  const lpCoef = 0.08 + damp * 0.62; // the larger, the darker
  const phase = lines.map((_, k) => (k * 0.37) % 1);
  // each line's modulation rate; in a loop, a whole number of cycles per round
  const rates = lines.map((_, k) => {
    const r = rate * (1 + k * 0.11);
    return o.loopSec ? Math.max(1, Math.round(r * o.loopSec)) / o.loopSec : r;
  });
  const outL = buf(n);
  const outR = buf(n);
  const y = new Float64Array(8);
  const mixed = new Float64Array(8);
  const norm = 1 / Math.sqrt(8);
  const sL = [1, -1, 1, -1, 1, -1, 1, -1];
  const sR = [1, 1, -1, -1, 1, 1, -1, -1];
  const inGain = 0.5;
  for (let i = 0; i < n; i++) {
    const xin = i >= pre ? (diffused[i - pre] as number) : 0;
    const sin = i >= pre ? (side[i - pre] as number) : 0;
    for (let k = 0; k < 8; k++) {
      const d = (lines[k] as number) + depth * Math.sin(TAU * (phase[k] as number + ((rates[k] as number) * i) / SR));
      let rp = (wp[k] as number) - d;
      const m = mem[k] as Buf;
      while (rp < 0) rp += maxLen;
      const r0 = Math.floor(rp);
      const f = rp - r0;
      y[k] = (m[r0 % maxLen] as number) * (1 - f) + (m[(r0 + 1) % maxLen] as number) * f;
    }
    // output taps
    let l = 0;
    let r = 0;
    for (let k = 0; k < 8; k++) {
      l += (y[k] as number) * (sL[k] as number);
      r += (y[k] as number) * (sR[k] as number);
    }
    outL[i] = l * 0.5;
    outR[i] = r * 0.5;
    // Hadamard mixing of the line outputs (a fast Walsh–Hadamard transform of 8 values)
    for (let k = 0; k < 8; k++) mixed[k] = y[k] as number;
    for (let h = 1; h < 8; h *= 2) {
      for (let a = 0; a < 8; a += h * 2) {
        for (let b = a; b < a + h; b++) {
          const u = mixed[b] as number;
          const v = mixed[b + h] as number;
          mixed[b] = u + v;
          mixed[b + h] = u - v;
        }
      }
    }
    for (let k = 0; k < 8; k++) {
      let v = (mixed[k] as number) * norm * (gain[k] as number);
      lpState[k] = (lpState[k] as number) + (1 - lpCoef) * (v - (lpState[k] as number)); // darkens what goes round
      v = lpState[k] as number;
      const feed = xin * inGain + sin * inGain * (sL[k] as number);
      const m = mem[k] as Buf;
      m[wp[k] as number] = v + feed;
      wp[k] = ((wp[k] as number) + 1) % maxLen;
    }
  }

  // the early reflections: a few taps of the input, alternating sides
  const wetL = highpass(outL, o.lowCutHz ?? 90);
  const wetR = highpass(outR, o.lowCutHz ?? 90);
  EARLY_MS.forEach((ms, k) => {
    const d = Math.round(((ms * size) / 1000) * SR);
    const g = (EARLY_GAIN[k] as number) * 0.5;
    mixInto(k % 2 === 0 ? wetL : wetR, mid, d + pre, g);
  });

  const out = stereo(n);
  for (let i = 0; i < n; i++) {
    out.l[i] = (i < input.l.length ? (input.l[i] as number) * dryGain : 0) + (wetL[i] as number) * wetGain;
    out.r[i] = (i < input.r.length ? (input.r[i] as number) * dryGain : 0) + (wetR[i] as number) * wetGain;
  }
  return out;
}

/** A mono buffer through the reverb: stereo comes out. */
export function reverbMono(x: Buf, o: ReverbOptions): Stereo {
  return reverb({ l: x, r: Float32Array.from(x) }, o);
}

/** A soft saturation (tanh): `drive` 1 is barely there, 4 is warm, 10 is fierce. The level is brought back so that the same input is about as loud. */
export function saturate(x: Buf, drive = 2): Buf {
  const out = buf(x.length);
  const k = 1 / Math.tanh(drive);
  for (let i = 0; i < x.length; i++) out[i] = Math.tanh((x[i] as number) * drive) * k;
  return out;
}

/** A feed-forward compressor: above `thresholdDb` the level rises `ratio` to 1 slower; it reacts in `attackMs` and lets go in `releaseMs`; `makeupDb` brings the level back. */
export function compress(x: Buf, thresholdDb: number, ratio: number, attackMs = 5, releaseMs = 120, makeupDb = 0): Buf {
  const out = buf(x.length);
  const ka = Math.exp(-1 / ((attackMs / 1000) * SR));
  const kr = Math.exp(-1 / ((releaseMs / 1000) * SR));
  const makeup = dbToLin(makeupDb);
  let env = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i] as number);
    env = v > env ? ka * env + (1 - ka) * v : kr * env + (1 - kr) * v;
    const over = linToDb(env) - thresholdDb;
    const reduction = over > 0 ? over * (1 - 1 / ratio) : 0;
    out[i] = (x[i] as number) * dbToLin(-reduction) * makeup;
  }
  return out;
}

/** Makes sure the stereo buffer never passes `ceilingDb`: the gain comes down smoothly BEFORE a peak (it looks ahead `lookMs`) and recovers over `releaseMs`. Works in place and returns the lowest gain it used (1 = it never acted). */
export function limit(s: Stereo, ceilingDb = -1, lookMs = 5, releaseMs = 120): number {
  const n = s.l.length;
  const c = dbToLin(ceilingDb);
  const la = Math.max(1, Math.round((lookMs / 1000) * SR));
  const g = buf(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(s.l[i] as number), Math.abs(s.r[i] as number));
    g[i] = p > c ? c / p : 1;
  }
  // the lowest gain in the next `la` samples (a sliding minimum, with a deque)
  const m = buf(n);
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && (g[dq[tail - 1] as number] as number) >= (g[i] as number)) tail--;
    dq[tail++] = i;
    while ((dq[head] as number) >= i + la) head++;
    m[i] = g[dq[head] as number] as number;
  }
  // …averaged over the past `la` samples: the gain falls before the peak arrives and reaches it in time
  const sm = buf(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += m[i] as number;
    if (i >= la) acc -= m[i - la] as number;
    sm[i] = acc / Math.min(i + 1, la);
  }
  const kr = Math.exp(-1 / ((releaseMs / 1000) * SR));
  let lowest = 1;
  let gain = 1;
  for (let i = 0; i < n; i++) {
    const target = sm[i] as number;
    gain = target < gain ? target : gain + (1 - gain) * (1 - kr);
    if (gain > target) gain = target;
    s.l[i] = (s.l[i] as number) * gain;
    s.r[i] = (s.r[i] as number) * gain;
    if (gain < lowest) lowest = gain;
  }
  return lowest;
}

/** A tremolo: the level swings between 1 and `1 - depth` at `rate` Hz. */
export function tremolo(x: Buf, rate: Param, depth: number, phase0 = 0): Buf {
  const out = buf(x.length);
  let t = phase0;
  for (let i = 0; i < x.length; i++) {
    out[i] = (x[i] as number) * (1 - depth * (0.5 + 0.5 * Math.sin(TAU * t)));
    t += at(rate, i) / SR;
  }
  return out;
}

/** The right channel delayed by `ms` (the Haas effect): the sound seems wider without being a different sound. */
export function haas(x: Buf, ms = 12): Stereo {
  const out = stereo(x.length);
  const d = Math.round((ms / 1000) * SR);
  for (let i = 0; i < x.length; i++) {
    out.l[i] = x[i] as number;
    if (i >= d) out.r[i] = x[i - d] as number;
  }
  return out;
}

/** Stereo width: 0 mono, 1 as it is, 2 twice as wide. */
export function width(s: Stereo, w: number): void {
  for (let i = 0; i < s.l.length; i++) {
    const m = ((s.l[i] as number) + (s.r[i] as number)) * 0.5;
    const d = ((s.l[i] as number) - (s.r[i] as number)) * 0.5 * w;
    s.l[i] = m + d;
    s.r[i] = m - d;
  }
}
