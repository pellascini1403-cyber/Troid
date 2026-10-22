import { buf, SR, TAU, type Buf, type Param } from './core';

/**
 * OSCILLATORS, NOISE AND CONTROL SIGNALS. A frequency is a number or a buffer with one value per sample (a glide, a vibrato). The saw and the square are band-limited (PolyBLEP) so that a low note does not
 * fold back into a hiss; the sine is exact; the noises are the three that matter (white, pink, brown); and the control signals (`lfo`, `line`, `expLine`, `drift`) are what moves a pitch or a cutoff.
 */

const at = (p: Param, i: number): number => (typeof p === 'number' ? p : (p[i] as number));

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

export function sine(n: number, f: Param, phase0 = 0): Buf {
  const out = buf(n);
  let ph = phase0 * TAU;
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(ph);
    ph += (TAU * at(f, i)) / SR;
  }
  return out;
}

export function saw(n: number, f: Param, phase0 = 0): Buf {
  const out = buf(n);
  let t = phase0 - Math.floor(phase0);
  for (let i = 0; i < n; i++) {
    const dt = at(f, i) / SR;
    out[i] = 2 * t - 1 - polyBlep(t, dt);
    t += dt;
    if (t >= 1) t -= 1;
  }
  return out;
}

export function square(n: number, f: Param, pw = 0.5, phase0 = 0): Buf {
  const out = buf(n);
  let t = phase0 - Math.floor(phase0);
  for (let i = 0; i < n; i++) {
    const dt = at(f, i) / SR;
    out[i] = (t < pw ? 1 : -1) + polyBlep(t, dt) - polyBlep((t + 1 - pw) % 1, dt);
    t += dt;
    if (t >= 1) t -= 1;
  }
  return out;
}

/** A naive triangle: its harmonics fall off as 1/n², so it does not need the correction. */
export function tri(n: number, f: Param, phase0 = 0): Buf {
  const out = buf(n);
  let t = phase0 - Math.floor(phase0);
  for (let i = 0; i < n; i++) {
    out[i] = 1 - 4 * Math.abs(t - 0.5);
    t += at(f, i) / SR;
    if (t >= 1) t -= 1;
  }
  return out;
}

export function white(n: number, rnd: () => number): Buf {
  const out = buf(n);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}

/** Pink noise (−3 dB per octave: the sound of wind and water), Paul Kellet's filter. */
export function pink(n: number, rnd: () => number): Buf {
  const out = buf(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown noise (−6 dB per octave: a rumble). */
export function brown(n: number, rnd: () => number): Buf {
  const out = buf(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rnd() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
}

/** A low-frequency oscillator, −1 … 1 (a control signal, not a sound). */
export function lfo(n: number, rate: Param, phase0 = 0, shape: 'sine' | 'tri' = 'sine'): Buf {
  const out = buf(n);
  let t = phase0 - Math.floor(phase0);
  for (let i = 0; i < n; i++) {
    out[i] = shape === 'sine' ? Math.sin(TAU * t) : 1 - 4 * Math.abs(t - 0.5);
    t += at(rate, i) / SR;
    if (t >= 1) t -= 1;
  }
  return out;
}

/** A straight line from `a` to `b` over `n` samples. */
export function line(n: number, a: number, b: number): Buf {
  const out = buf(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / Math.max(1, n - 1);
  return out;
}

/** An exponential line (a glide in pitch is exponential: the same ratio per second); `a` and `b` must be positive. */
export function expLine(n: number, a: number, b: number): Buf {
  const out = buf(n);
  const r = Math.log(b / a);
  for (let i = 0; i < n; i++) out[i] = a * Math.exp((r * i) / Math.max(1, n - 1));
  return out;
}

/** A slowly wandering control signal, −1 … 1: random points `rate` times a second joined by a smooth curve (the drift of wind, of a pitch, of a filter). */
export function drift(n: number, rate: number, rnd: () => number): Buf {
  const out = buf(n);
  const step = Math.max(1, Math.round(SR / rate));
  const points = Math.ceil(n / step) + 3;
  const p: number[] = [];
  for (let i = 0; i < points; i++) p.push(rnd() * 2 - 1);
  for (let i = 0; i < n; i++) {
    const x = i / step;
    const k = Math.floor(x);
    const f = x - k;
    const s = f * f * (3 - 2 * f); // smoothstep
    out[i] = (p[k] as number) * (1 - s) + (p[k + 1] as number) * s;
  }
  return out;
}

/** A pitch multiplier for vibrato: `1 + depth` swings; `depthCents` is the depth, `rate` Hz; the vibrato comes in after `delaySec` over `fadeSec`. */
export function vibrato(n: number, rate: number, depthCents: number, delaySec = 0, fadeSec = 0.3, phase0 = 0): Buf {
  const out = buf(n);
  let t = phase0;
  const d = Math.round(delaySec * SR);
  const f = Math.max(1, Math.round(fadeSec * SR));
  for (let i = 0; i < n; i++) {
    const amount = i < d ? 0 : Math.min(1, (i - d) / f);
    out[i] = 2 ** ((Math.sin(TAU * t) * depthCents * amount) / 1200);
    t += rate / SR;
  }
  return out;
}

/** A buffer of one constant value. */
export function constant(n: number, v: number): Buf {
  return new Float32Array(n).fill(v);
}
