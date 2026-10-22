import { buf, clamp, copy, dbToLin, fadeOut, mixInto, mixStereoInto, normalizePeak, pan, removeDc, SR, secs, stereo, times, type Buf, type Stereo } from './core';
import { adsr, ar, decay, envelope } from './env';
import { bandpass, biquad, dcBlock, highpass, lowpass, onePole } from './filter';
import { limit, reverbMono, type ReverbOptions } from './fx';
import { expLine, lfo, pink, sine, white } from './osc';

/**
 * THE BUILDING BLOCKS OF SOUND EFFECTS (docs/PROMPT18-LOG.md): the small things a sound is layered from — a sweep of air, a thump, a click, a ring of metal, a bubble, a spark, a grind, a breath. A sound effect of the game is a handful
 * of these, each given a place in time, a level and a side, then a room. They are shaped the way the real thing is (a blade cuts the air with a swept band of noise; a stone rings at a few frequencies that are not
 * harmonics; a blob of ink pops with a rising chirp) — and none of it is a recording.
 */

type Rnd = () => number;

/** Air moving: noise through a band-pass whose centre sweeps `f0` → `f1` while the sound swells and falls (`rise` of its length is the swell). */
export function swoosh(durSec: number, f0: number, f1: number, o: { q?: number; rise?: number; pink?: boolean; shape?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const src = o.pink ? pink(n, rnd) : white(n, rnd);
  const y = bandpass(src, expLine(n, f0, f1), o.q ?? 1.2);
  const rise = clamp(o.rise ?? 0.3, 0.02, 0.95);
  return times(y, ar(n, durSec * rise, durSec * (1 - rise), o.shape ?? 1.6));
}

/** A low blow: a sine that falls from `f0` to `f1` in a moment and dies away (`tau`): the weight of something landing or leaving. */
export function thump(f0: number, f1: number, tau = 0.09, durSec = tau * 6): Buf {
  const n = secs(durSec);
  const fall = Math.min(n, secs(Math.min(durSec, tau * 2.5)));
  const f = buf(n);
  f.fill(f1);
  f.set(expLine(fall, f0, f1));
  return times(sine(n, f), decay(n, tau));
}

/** A transient: a few milliseconds of high-passed noise — the contact, the "tick" of a hit. */
export function click(durSec: number, hpHz: number, tau: number, rnd: Rnd, lpHz = 12000): Buf {
  const n = secs(durSec);
  return times(lowpass(highpass(white(n, rnd), hpHz), lpHz), decay(n, tau));
}

/** A burst of band-limited noise with a decay: a splash, a rustle, the body of a slap. */
export function burst(durSec: number, lo: number, hi: number, tau: number, rnd: Rnd): Buf {
  const n = secs(durSec);
  return times(lowpass(highpass(white(n, rnd), lo), hi), decay(n, tau));
}

/** Metal or stone struck: a click played into resonators at the given frequencies — each one rings at its own pitch and dies at its own rate — which is what makes the difference between a "clack" and a "clang". The result is brought to a peak of 1 (give it a level when it is laid on a sound). */
export function ring(freqs: readonly number[], durSec: number, o: { q?: number; tau?: number; bright?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const exc = times(white(secs(0.012), rnd), decay(secs(0.012), 0.003));
  const padded = buf(n);
  padded.set(exc);
  const out = buf(n);
  freqs.forEach((f, k) => {
    if (f > SR * 0.45) return;
    const q = (o.q ?? 120) / (1 + 0.25 * k);
    const y = biquad(padded, 'bp', f, q);
    mixInto(out, times(y, decay(n, (o.tau ?? 0.35) / (1 + 0.35 * k))), 0, (1 + k * (o.bright ?? 0.1)) / (1 + k * 0.3));
  });
  let p = 0;
  for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(out[i] as number));
  if (p > 0) for (let i = 0; i < n; i++) out[i] = (out[i] as number) / p;
  return out;
}

/** A bubble: a short sine that chirps upward as it rises through liquid, and a pop. */
export function bubble(f0: number, durSec = 0.06, rise = 1.8): Buf {
  const n = secs(durSec);
  const y = sine(n, expLine(n, f0, f0 * rise));
  return times(y, envelope(n, [[0, 0], [durSec * 0.12, 1], [durSec, 0]]));
}

/** A wet, shapeless sound: a tone whose pitch is wobbled by a slow random wave, through a resonant low-pass — ink, mud, a creature that is a puddle. */
export function squelch(durSec: number, o: { f?: number; wobble?: number; q?: number; glide?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const base = o.f ?? 160;
  const w = lfo(n, 9 + rnd() * 7, rnd());
  const f = buf(n);
  const glide = o.glide ?? 0.6;
  for (let i = 0; i < n; i++) f[i] = base * (1 + (o.wobble ?? 0.6) * (w[i] as number)) * (1 + glide * (1 - i / n));
  let y = buf(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (f[i] as number) / SR;
    const t = ph - Math.floor(ph);
    y[i] = (t < 0.5 ? 1 : -1) * 0.6 + Math.sin(2 * Math.PI * ph * 3.01) * 0.4; // a hollow square and a third harmonic that is not quite one
  }
  y = biquad(y, 'lp', expLine(n, 1800, 380), o.q ?? 4);
  return times(y, ar(n, durSec * 0.12, durSec * 0.88, 1.5));
}

/** Little high lights: `count` quick, bell-like pings at random pitches between `fLow` and `fHigh` over `spreadSec` — a spark, a shimmer, a crystal. */
export function sparkle(spreadSec: number, count: number, fLow: number, fHigh: number, o: { tau?: number; durSec?: number; level?: number } = {}, rnd: Rnd): Buf {
  const dur = o.durSec ?? spreadSec + 0.5;
  const out = buf(secs(dur));
  for (let k = 0; k < count; k++) {
    const f = fLow * (fHigh / fLow) ** rnd();
    const n = secs(0.4);
    const p = times(sine(n, f, rnd()), decay(n, o.tau ?? 0.07));
    const h = times(sine(n, f * 2.76, rnd()), decay(n, (o.tau ?? 0.07) * 0.35));
    mixInto(p, h, 0, 0.3);
    mixInto(out, p, secs(rnd() * spreadSec), (o.level ?? 1) * (0.35 + 0.65 * rnd()));
  }
  return out;
}

/** A tonal sweep with a few harmonics: the "zip" of energy — a bolt leaving, a power gathering. `f0` → `f1` over the sound; `harmonics` are added at the multiples given. */
export function zip(durSec: number, f0: number, f1: number, o: { harmonics?: readonly number[]; tau?: number; rise?: number } = {}): Buf {
  const n = secs(durSec);
  const f = expLine(n, f0, f1);
  const out = buf(n);
  for (const [k, h] of [1, ...(o.harmonics ?? [])].entries()) {
    const s = sine(n, f.map((v) => v * h) as Buf);
    mixInto(out, s, 0, 1 / (1 + k * 0.9));
  }
  const rise = o.rise ?? 0.04;
  return times(out, envelope(n, [[0, 0], [rise, 1], [durSec, 0]], 'lin').map((v, i) => v * Math.exp(-(i / SR) / (o.tau ?? durSec * 0.5))) as Buf);
}

/** The scrape and rumble of stone on stone: low noise swung by a slow random wave, a narrow rasp that wanders, and the odd small knock. */
export function grind(durSec: number, o: { lowHz?: number; raspHz?: number; level?: number; knocks?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const mod = onePole(white(n, rnd), 14);
  const slow = buf(n);
  for (let i = 0; i < n; i++) slow[i] = 0.55 + 0.45 * Math.max(-1, Math.min(1, (mod[i] as number) * 9));
  const rumble = times(lowpass(pink(n, rnd), o.lowHz ?? 240, 0.9), slow);
  const wander = envelope(n, [[0, (o.raspHz ?? 700) * 0.8], [durSec * 0.5, (o.raspHz ?? 700) * 1.25], [durSec, (o.raspHz ?? 700) * 0.9]], 'exp');
  const rasp = times(bandpass(white(n, rnd), wander, 3.5), slow);
  const out = buf(n);
  mixInto(out, rumble, 0, 1.4);
  mixInto(out, rasp, 0, 0.5);
  for (let k = 0; k < (o.knocks ?? 3); k++) mixInto(out, burst(0.06, 90, 900, 0.02, rnd), secs(rnd() * durSec * 0.9), 0.5 + rnd() * 0.4);
  const level = o.level ?? 1;
  return times(out, envelope(n, [[0, 0], [Math.min(0.15, durSec * 0.2), level], [durSec * 0.82, level], [durSec, 0]]));
}

/** A breath: noise shaped like an exhale or a gasp — a quick swell through a band that moves, with a little voice in it. */
export function breath(durSec: number, lo: number, hi: number, o: { rise?: number; voiced?: number; voiceHz?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const y = bandpass(pink(n, rnd), expLine(n, lo, hi), 1.1);
  const shaped = times(y, ar(n, durSec * (o.rise ?? 0.2), durSec * (1 - (o.rise ?? 0.2)), 1.4));
  if (o.voiced) mixInto(shaped, times(sine(n, expLine(n, o.voiceHz ?? 260, (o.voiceHz ?? 260) * 0.7)), ar(n, durSec * 0.2, durSec * 0.8, 1.2)), 0, o.voiced);
  return shaped;
}

/** A swell of a sound at a pitch: the sustained tones of magic and rest. `ratios` are the partials above `f`. */
export function swell(f: number, durSec: number, o: { ratios?: readonly number[]; attack?: number; release?: number; shimmerHz?: number } = {}, rnd: Rnd): Buf {
  const n = secs(durSec);
  const out = buf(n);
  const ratios = o.ratios ?? [1, 2, 3];
  ratios.forEach((r, k) => {
    const det = (rnd() - 0.5) * 0.004;
    mixInto(out, sine(n, f * r * (1 + det), rnd()), 0, 1 / (1 + k * 1.2));
    mixInto(out, sine(n, f * r * (1 - det), rnd()), 0, 0.5 / (1 + k * 1.2));
  });
  const trem = lfo(n, o.shimmerHz ?? 5.5, rnd());
  for (let i = 0; i < n; i++) out[i] = (out[i] as number) * (0.85 + 0.15 * (trem[i] as number));
  return times(out, adsr(n, o.attack ?? durSec * 0.35, 0.1, 0.9, o.release ?? durSec * 0.5));
}

// ------------------------------------------------------------------------------------------ putting a sound together

/** A layer: a mono sound, when it starts (s), how loud (dB) and where (−1 … 1). */
export interface Layer {
  sound: Buf;
  at?: number;
  db?: number;
  pan?: number;
}

/** Lays the layers on a stereo bed of `durSec` seconds. A layer that is still sounding when it ends (a bell cut at the length it was made) is faded over its last 15 ms, so that no layer ends on a click. */
export function layers(durSec: number, list: readonly Layer[]): Stereo {
  const out = stereo(secs(durSec));
  for (const l of list) {
    const start = secs(l.at ?? 0);
    const tail = Math.max(0, Math.min(l.sound.length, out.l.length - start)); // what of it fits on the bed
    const sound = fadeOut(copy(l.sound), secs(0.015));
    if (tail < sound.length) fadeOut(sound.subarray(0, tail), secs(0.015)); // …and one that is cut by the end of the bed
    mixStereoInto(out, pan(sound, l.pan ?? 0), start, dbToLin(l.db ?? 0));
  }
  return out;
}

export interface FinishOptions {
  /** The highest peak, dBFS. */
  peakDb: number;
  /** A room for the sound (mono in; its tail is part of the sound). */
  room?: ReverbOptions;
  /** A fade at the end so that the sound never stops on a click (ms). */
  fadeMs?: number;
  /** A high-pass for the rumble nobody wants (Hz). */
  hpHz?: number;
  /** The sound ends where it has fallen this far below its peak (dB; default −55): a reverberation tail is not carried on as silence. */
  trimDb?: number;
}

/** The last step of every sound effect: the offset out, the rumble out, the room in (if asked), the end faded, the peaks held, the level set. */
export function finish(s: Stereo, o: FinishOptions): Stereo {
  let { l, r } = s;
  l = dcBlock(l);
  r = dcBlock(r);
  if (o.hpHz) {
    l = highpass(l, o.hpHz);
    r = highpass(r, o.hpHz);
  }
  let out: Stereo = { l, r };
  if (o.room) {
    // the room is fed by the mono sum and keeps the stereo of the dry sound
    const mono = buf(l.length);
    for (let i = 0; i < l.length; i++) mono[i] = ((l[i] as number) + (r[i] as number)) * 0.5;
    const wet = reverbMono(mono, { ...o.room, wet: o.room.wet ?? 0.3, dry: 0 });
    const dryL = buf(wet.l.length);
    const dryR = buf(wet.l.length);
    dryL.set(l);
    dryR.set(r);
    for (let i = 0; i < wet.l.length; i++) {
      dryL[i] = (dryL[i] as number) + (wet.l[i] as number);
      dryR[i] = (dryR[i] as number) + (wet.r[i] as number);
    }
    out = { l: dryL, r: dryR };
  }
  out = trimTail(out, o.trimDb ?? -55);
  const fade = Math.round(((o.fadeMs ?? 12) / 1000) * SR);
  for (const c of [out.l, out.r]) {
    removeDc(c);
    for (let i = 0; i < Math.min(fade, c.length); i++) c[c.length - 1 - i] = (c[c.length - 1 - i] as number) * (i / fade);
    const lead = Math.min(48, c.length); // a few samples of ramp at the very start: a sound never begins on a click
    for (let i = 0; i < lead; i++) c[i] = (c[i] as number) * (i / lead);
  }
  limit(out, o.peakDb, 4, 80);
  normalizePeak(out, o.peakDb);
  return out;
}

/** Cuts the silence at the end: the sound ends at the last sample that is above `thresholdDb` of its own peak (and a few milliseconds after it, for the fade). */
export function trimTail(s: Stereo, thresholdDb: number): Stereo {
  let p = 0;
  for (let i = 0; i < s.l.length; i++) p = Math.max(p, Math.abs(s.l[i] as number), Math.abs(s.r[i] as number));
  const limit = p * dbToLin(thresholdDb);
  let end = s.l.length;
  while (end > 1 && Math.abs(s.l[end - 1] as number) < limit && Math.abs(s.r[end - 1] as number) < limit) end--;
  end = Math.min(s.l.length, end + Math.round(0.02 * SR));
  return { l: Float32Array.from(s.l.subarray(0, end)), r: Float32Array.from(s.r.subarray(0, end)) };
}

/** The same, for a sound that stays mono: the two channels are the same signal, so one channel is written to the file. */
export function toMono(s: Stereo): Buf {
  const m = buf(s.l.length);
  for (let i = 0; i < m.length; i++) m[i] = ((s.l[i] as number) + (s.r[i] as number)) * 0.5;
  return m;
}
