import { buf, clamp, mixInto, scaled, SR, secs, TAU, times, type Buf } from './core';
import { adsr, decay, envelope } from './env';
import { bandpass, highpass, lowpass, onePole, peaking } from './filter';
import { drift, expLine, lfo, pink, saw, sine, tri, vibrato, white } from './osc';

/**
 * THE INSTRUMENTS (docs/PROMPT18-LOG.md): a note in, a buffer out. They are not recordings and do not pretend to be — a pad, a choir, a bell, a plucked string, a bowed string, a sub-bass and the drums of a score — but they
 * are shaped (attack, brightness, vibrato, resonance, decay) the way their real namesakes are, so that a score played on them has a voice. Every function takes the random generator it needs: the same note with the same
 * generator is the same sound.
 */

type Rnd = () => number;

/** A warm pad: several saw waves a few cents apart (the "ensemble"), a triangle an octave down, a low-pass that opens as the note swells. */
export function pad(freq: number, durSec: number, o: { attack?: number; release?: number; voices?: number; spreadCents?: number; cutoff?: number; open?: number; sub?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const attack = o.attack ?? 1.2;
  const release = o.release ?? 1.6;
  const voices = o.voices ?? 4;
  const spread = o.spreadCents ?? 9;
  const sum = buf(n);
  for (let v = 0; v < voices; v++) {
    const c = voices === 1 ? 0 : ((v / (voices - 1)) * 2 - 1) * spread + (rnd() - 0.5) * 2;
    const f = freq * 2 ** (c / 1200);
    const w = saw(n, scaled(vibrato(n, 0.18 + rnd() * 0.2, 3, 0.5, 2, rnd()), f), rnd());
    mixInto(sum, w, 0, 1 / Math.sqrt(voices));
  }
  const subLevel = o.sub ?? 0.35;
  if (subLevel > 0) mixInto(sum, tri(n, freq / 2, rnd()), 0, subLevel);
  const base = o.cutoff ?? Math.min(5000, freq * 5);
  const cut = envelope(n, [[0, base * 0.35], [attack, base * (o.open ?? 1)], [Math.max(attack + 0.1, durSec - release), base * 0.9], [durSec, base * 0.4]], 'exp');
  const out = lowpass(sum, cut, 0.6);
  return times(out, adsr(n, attack, 0.3, 0.9, release));
}

const VOWELS: Readonly<Record<string, ReadonlyArray<readonly [hz: number, q: number, gain: number]>>> = {
  a: [[800, 8, 1], [1150, 10, 0.5], [2900, 12, 0.22], [3900, 12, 0.1]],
  o: [[450, 7, 1], [800, 9, 0.36], [2830, 12, 0.12], [3800, 12, 0.06]],
  u: [[325, 6, 1], [700, 8, 0.2], [2530, 12, 0.08]],
  e: [[400, 7, 1], [1700, 10, 0.4], [2600, 12, 0.2], [3500, 12, 0.08]],
  m: [[270, 5, 1], [1100, 9, 0.12], [2350, 12, 0.05]],
};

/** A voice that is not a person's: a sawtooth with a little breath through the formants of a vowel, a late and slow vibrato, a slow swell. It is what a choir is, minus the words. */
export function choir(freq: number, durSec: number, vowel: keyof typeof VOWELS = 'a', o: { attack?: number; release?: number; breath?: number; vibratoCents?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const f = vibrato(n, 4.8 + rnd() * 0.8, o.vibratoCents ?? 14, 0.6, 1.2, rnd());
  const pitch = buf(n);
  for (let i = 0; i < n; i++) pitch[i] = freq * (f[i] as number);
  let src = saw(n, pitch, rnd());
  const breath = pink(n, rnd);
  const b = o.breath ?? 0.18;
  for (let i = 0; i < n; i++) src[i] = (src[i] as number) * 0.55 + (breath[i] as number) * b;
  src = lowpass(src, 6000, 0.5);
  const out = buf(n);
  for (const [fc, q, g] of VOWELS[vowel] as ReadonlyArray<readonly [number, number, number]>) mixInto(out, bandpass(src, fc, q), 0, g * 2.2);
  return times(out, adsr(n, o.attack ?? 1.1, 0.3, 0.9, o.release ?? 1.4));
}

/** A struck bell: partials in the ratios of a bell (not of a string), the higher ones dying sooner, a pair of each slightly apart so that it shimmers. `decaySec` is how long the fundamental rings. */
export function bell(freq: number, durSec: number, o: { decaySec?: number; kind?: 'glass' | 'bronze' | 'chime'; bright?: number; click?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const kind = o.kind ?? 'glass';
  const ratios = kind === 'glass' ? [1, 2.756, 5.404, 8.933, 13.34] : kind === 'bronze' ? [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166] : [1, 2, 3.01, 4.2, 5.43, 6.8];
  const amps = kind === 'glass' ? [1, 0.55, 0.3, 0.14, 0.07] : kind === 'bronze' ? [0.7, 1, 0.8, 0.5, 0.55, 0.3, 0.3, 0.2, 0.1] : [1, 0.7, 0.4, 0.25, 0.15, 0.08];
  const T = o.decaySec ?? 3;
  const bright = o.bright ?? 1;
  const out = buf(n);
  ratios.forEach((r, k) => {
    const f = freq * r;
    if (f > SR * 0.45) return;
    const tau = (T / (1 + 0.7 * k)) * 0.45;
    const a = (amps[k] as number) * (k === 0 ? 1 : bright ** Math.min(k, 3));
    for (const d of [-1.2, 1.2]) {
      const w = sine(n, f * 2 ** ((d * (0.6 + rnd() * 0.8)) / 1200), rnd());
      mixInto(out, times(w, decay(n, tau)), 0, a * 0.5);
    }
  });
  const click = o.click ?? 0.12;
  if (click > 0) {
    const c = highpass(white(secs(0.02), rnd), 3000);
    times(c, decay(c.length, 0.003));
    mixInto(out, c, 0, click);
  }
  return out;
}

/** An FM bell: a sine whose pitch is modulated by another at an inharmonic ratio, the depth of the modulation dying away — bright at the strike, pure at the end. */
export function fmBell(freq: number, durSec: number, o: { ratio?: number; index?: number; decaySec?: number; indexDecaySec?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const ratio = o.ratio ?? 3.5;
  const index = decay(n, o.indexDecaySec ?? 0.5);
  const out = buf(n);
  let pc = rnd();
  let pm = rnd();
  const I = o.index ?? 4;
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(TAU * pc + I * (index[i] as number) * Math.sin(TAU * pm));
    pc += freq / SR;
    pm += (freq * ratio) / SR;
  }
  return times(out, decay(n, o.decaySec ?? 1.2));
}

/** A plucked string (Karplus–Strong): noise round a delay line the length of the note's period, darkened a little on every round, tuned with an all-pass. `ringSec` is how long it takes to die away. */
export function pluck(freq: number, durSec: number, o: { ringSec?: number; bright?: number; pickPos?: number; soft?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const period = SR / freq;
  const bright = clamp(o.bright ?? 0.5, 0.2, 0.62); // 0.5 is the classic average of two samples; lower is darker
  let N = Math.floor(period - bright); // the filter delays by about `bright` samples
  let frac = period - bright - N;
  if (frac < 0.1) {
    N -= 1;
    frac += 1;
  }
  const c = (1 - frac) / (1 + frac);
  const lineBuf = new Float64Array(N);
  let burst = white(N, rnd);
  burst = onePole(burst, 2200 - (o.soft ?? 0) * 1600); // a soft pick is a darker one
  const pp = Math.max(1, Math.round(N * (o.pickPos ?? 0.18)));
  for (let i = N - 1; i >= pp; i--) burst[i] = (burst[i] as number) - (burst[i - pp] as number) * 0.9;
  let m = 0;
  for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(burst[i] as number));
  for (let i = 0; i < N; i++) lineBuf[i] = ((burst[i] as number) / Math.max(m, 1e-9)) * 0.9;
  const loop = 10 ** (-3 / ((o.ringSec ?? 2) * freq));
  const out = buf(n);
  let ptr = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < n; i++) {
    const y = lineBuf[ptr] as number;
    out[i] = y;
    const lp = bright * y + (1 - bright) * prev;
    prev = y;
    const ap = c * (lp - apOut) + apIn; // a first-order all-pass: the fraction of a sample the delay line cannot be
    apIn = lp;
    apOut = ap;
    lineBuf[ptr] = ap * loop;
    ptr = (ptr + 1) % N;
  }
  return out;
}

/** A bowed string, low and dark (a cello is the model): a saw whose brightness follows the bow, vibrato that arrives late, the rasp of the bow, the resonances of a wooden body. */
export function bowed(freq: number, durSec: number, o: { attack?: number; release?: number; vibratoCents?: number; bright?: number; rasp?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const attack = o.attack ?? 0.22;
  const release = o.release ?? 0.5;
  const pitch = buf(n);
  const v = vibrato(n, 5.1 + rnd() * 0.5, o.vibratoCents ?? 18, 0.45, 0.7, rnd());
  for (let i = 0; i < n; i++) pitch[i] = freq * (v[i] as number);
  const src = saw(n, pitch, rnd());
  const bright = o.bright ?? 1;
  const cutoff = envelope(n, [[0, freq * 2.2 * bright], [attack * 1.5, freq * 6 * bright], [Math.max(attack * 1.6, durSec - release), freq * 5 * bright], [durSec, freq * 2.5 * bright]], 'exp');
  let y = lowpass(src, cutoff, 0.8);
  const rasp = bandpass(white(n, rnd), 3200, 0.8);
  mixInto(y, times(rasp, envelope(n, [[0, 0.5], [attack, 0.12], [durSec, 0.08]])), 0, (o.rasp ?? 0.05));
  y = peaking(peaking(y, 280, 2, 4), 520, 2.5, 3);
  return times(y, adsr(n, attack, 0.2, 0.92, release));
}

/** A low sine with a touch of its own harmonics: the floor under a piece of music. */
export function sub(freq: number, durSec: number, o: { attack?: number; release?: number; warmth?: number } = {}): Buf {
  const n = secs(durSec);
  const s = sine(n, freq);
  const w = o.warmth ?? 0.25;
  const h2 = sine(n, freq * 2);
  for (let i = 0; i < n; i++) s[i] = Math.tanh(((s[i] as number) + (h2[i] as number) * w) * 1.4);
  return times(s, adsr(n, o.attack ?? 0.4, 0.2, 0.95, o.release ?? 0.8));
}

/** A low drum (a taiko, a floor tom): a sine that falls from `startHz` to `endHz` in a moment, a burst of noise for the skin, a body that rings briefly. `size` makes it lower and longer. */
export function taiko(o: { size?: number; vel?: number } = {}, rnd: Rnd): Buf {
  const size = o.size ?? 1;
  const vel = o.vel ?? 1;
  const n = secs(1.4 * size);
  const f = expLine(secs(0.25), 150 / Math.sqrt(size), 52 / size);
  const fall = buf(n);
  fall.fill(52 / size);
  fall.set(f);
  const body = times(sine(n, fall), decay(n, 0.32 * size));
  const skin = times(lowpass(white(n, rnd), 900 * vel + 500), decay(n, 0.05));
  const out = buf(n);
  mixInto(out, body, 0, 1.0);
  mixInto(out, skin, 0, 0.55 * vel);
  const knock = times(highpass(white(secs(0.02), rnd), 1500), decay(secs(0.02), 0.004));
  mixInto(out, knock, 0, 0.35 * vel);
  return out;
}

/** A higher, drier hand drum, for rhythm that is not a blow. */
export function frameDrum(o: { vel?: number; pitch?: number } = {}, rnd: Rnd): Buf {
  const p = o.pitch ?? 1;
  const n = secs(0.5);
  const f = expLine(n, 210 * p, 120 * p);
  const body = times(sine(n, f), decay(n, 0.11));
  const skin = times(bandpass(white(n, rnd), 1400, 1.2), decay(n, 0.03));
  const out = buf(n);
  mixInto(out, body, 0, 0.9);
  mixInto(out, skin, 0, 0.45 * (o.vel ?? 1));
  return out;
}

/** A dry wooden tick: the clock of a tense place. */
export function tick(o: { pitch?: number } = {}, rnd: Rnd): Buf {
  const n = secs(0.06);
  const body = times(sine(n, (1100 + rnd() * 80) * (o.pitch ?? 1)), decay(n, 0.008));
  const click = times(bandpass(white(n, rnd), 2800, 3), decay(n, 0.004));
  const out = buf(n);
  mixInto(out, body, 0, 0.7);
  mixInto(out, click, 0, 0.5);
  return out;
}

/** A struck metal plate or a slow gong: inharmonic partials that ring for seconds. */
export function gong(freq: number, durSec: number, o: { decaySec?: number; shimmer?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const ratios = [1, 1.47, 1.97, 2.39, 2.9, 3.52, 4.13, 5.2];
  const out = buf(n);
  const T = o.decaySec ?? 5;
  ratios.forEach((r, k) => {
    const f = freq * r;
    if (f > SR * 0.45) return;
    const swell = envelope(n, [[0, 0.3 + k * 0.05], [0.25 + k * 0.1, 1], [durSec, 1]]);
    const w = sine(n, f * (1 + (rnd() - 0.5) * 0.002), rnd());
    mixInto(out, times(times(w, decay(n, (T / (1 + 0.5 * k)) * 0.5)), swell), 0, 0.5 / (1 + 0.4 * k));
  });
  const strike = times(lowpass(white(secs(0.08), rnd), 2500), decay(secs(0.08), 0.01));
  mixInto(out, strike, 0, 0.25);
  return out;
}

/** A swelling rise of noise and tone: the breath before something happens. */
export function riser(durSec: number, o: { from?: number; to?: number; tone?: number; level?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const cut = expLine(n, o.from ?? 300, o.to ?? 6000);
  const noise = bandpass(pink(n, rnd), cut, 1.6);
  const out = times(noise, envelope(n, [[0, 0], [durSec * 0.97, 1], [durSec, 0]]));
  const tone = o.tone ?? 0;
  if (tone > 0) {
    const t = times(sine(n, expLine(n, 110, 440)), envelope(n, [[0, 0], [durSec * 0.97, 0.8], [durSec, 0]]));
    mixInto(out, t, 0, tone);
  }
  return out.map((v) => v * (o.level ?? 1)) as Buf;
}

/** A drone: heavy low saws, slowly breathing, the ground of dark music. */
export function drone(freq: number, durSec: number, o: { attack?: number; release?: number; cutoff?: number; movement?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const sum = buf(n);
  for (const [mult, lvl, cents] of [[1, 1, -6], [1, 0.8, 7], [0.5, 0.9, 0], [2, 0.25, 11]] as const) {
    mixInto(sum, saw(n, scaled(vibrato(n, 0.07 + rnd() * 0.05, 4, 0, 1, rnd()), freq * mult * 2 ** (cents / 1200)), rnd()), 0, lvl * 0.4);
  }
  const wander = drift(n, 0.15, rnd);
  const cut = buf(n);
  const base = o.cutoff ?? 420;
  for (let i = 0; i < n; i++) cut[i] = base * (1 + (o.movement ?? 0.5) * 0.6 * (wander[i] as number));
  return times(lowpass(sum, cut, 0.9), adsr(n, o.attack ?? 3, 0.5, 0.95, o.release ?? 3));
}

/** A shimmer: a cluster of very high, quiet partials fading in and out at their own pace, like starlight. */
export function shimmer(freq: number, durSec: number, o: { partials?: number; level?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const out = buf(n);
  const count = o.partials ?? 5;
  for (let k = 0; k < count; k++) {
    const f = freq * (1 + k * 0.5 + rnd() * 0.1);
    if (f > SR * 0.4) break;
    const w = sine(n, f, rnd());
    const rate = 0.2 + rnd() * 0.5;
    const swell = lfo(n, rate, rnd());
    for (let i = 0; i < n; i++) swell[i] = Math.max(0, swell[i] as number) ** 1.5;
    mixInto(out, times(w, swell), 0, (o.level ?? 1) / count);
  }
  return times(out, envelope(n, [[0, 0], [Math.min(1.2, durSec * 0.3), 1], [Math.max(durSec - 1.5, durSec * 0.6), 1], [durSec, 0]]));
}
