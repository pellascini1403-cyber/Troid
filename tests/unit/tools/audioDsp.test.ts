import { describe, expect, it } from 'vitest';
import { buf, dbToLin, hz, linToDb, midiOf, mulberry32, peak, rms, secs, seedOf, SR, type Stereo } from '../../../tools/audio/dsp/core';
import { adsr, ar, decay, envelope, gate } from '../../../tools/audio/dsp/env';
import { biquad, dcBlock, highpass, lowpass } from '../../../tools/audio/dsp/filter';
import { compress, limit, reverb } from '../../../tools/audio/dsp/fx';
import { pluck } from '../../../tools/audio/dsp/inst';
import { integratedLufs, loopSeam, momentaryLufs, peakDb, silence, truePeakDb } from '../../../tools/audio/dsp/measure';
import { brown, drift, expLine, pink, saw, sine, square, tri, white } from '../../../tools/audio/dsp/osc';

/**
 * THE SYNTHESIS TOOLKIT (docs/PROMPT18-LOG.md): the units, the oscillators, the filters, the envelopes, the reverberation, the limiter and the measuring that every sound and every piece of music of the game is made
 * and judged with. These are the math of it — a filter that does not filter, a limiter that lets a peak through or a loudness meter that is off would spoil every sound, and nobody could hear it.
 */
const stereoOf = (b: Float32Array): Stereo => ({ l: b, r: Float32Array.from(b) });
const db = (x: number): number => linToDb(x);

/** The gain of a filter at a frequency, in dB: a sine through it, the level of the steady part. */
function gainAt(filter: (x: Float32Array) => Float32Array, f: number): number {
  const n = secs(0.6);
  const y = filter(sine(n, f));
  return db(rms(y, secs(0.3)) / rms(sine(n, f), secs(0.3)));
}

describe('units', () => {
  it('names notes the way a musician does: A4 is 440 Hz, C4 is MIDI 60, an octave is double', () => {
    expect(hz('A4')).toBeCloseTo(440, 6);
    expect(midiOf('C4')).toBe(60);
    expect(midiOf('Bb2')).toBe(46);
    expect(midiOf('F#3')).toBe(54);
    expect(hz('A5') / hz('A4')).toBeCloseTo(2, 9);
    expect(hz(69)).toBeCloseTo(440, 9);
    expect(() => midiOf('H4')).toThrow();
  });

  it('decibels and amplitude convert both ways', () => {
    expect(dbToLin(-6.0206)).toBeCloseTo(0.5, 4);
    expect(linToDb(dbToLin(-17.3))).toBeCloseTo(-17.3, 9);
    expect(secs(0.5)).toBe(SR / 2);
  });

  it('a seeded generator gives the same numbers every time, and a different seed another set', () => {
    const a = mulberry32(seedOf('hero.step', 3));
    const b = mulberry32(seedOf('hero.step', 3));
    const c = mulberry32(seedOf('hero.step', 4));
    const xs = [a(), a(), a()];
    expect(xs).toEqual([b(), b(), b()]);
    expect(xs).not.toEqual([c(), c(), c()]);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of xs) expect(x).toBeLessThan(1);
  });
});

describe('oscillators and noise', () => {
  it('a sine of 440 Hz crosses zero 880 times a second and stays within ±1', () => {
    const s = sine(SR, 440);
    let crossings = 0;
    for (let i = 1; i < s.length; i++) if (((s[i - 1] as number) < 0) !== ((s[i] as number) < 0)) crossings++;
    expect(Math.abs(crossings - 880)).toBeLessThanOrEqual(2);
    expect(peak(s)).toBeLessThanOrEqual(1);
  });

  it('a saw and a square are band-limited: their level is that of the ideal wave and nothing but the harmonics is above the note', () => {
    const w = saw(SR, 220);
    expect(rms(w)).toBeCloseTo(Math.sqrt(1 / 3), 1);
    const q = square(SR, 220);
    expect(rms(q)).toBeCloseTo(1, 1);
    // the content above 20 kHz of a 220 Hz saw is the aliasing a naive saw would fold in: here it is small
    const high = highpass(highpass(w, 20000), 20000);
    expect(rms(high)).toBeLessThan(0.03);
  });

  it('a triangle is softer than a saw, a glide goes from where it starts to where it ends, and pink is darker than white', () => {
    expect(rms(tri(SR, 220))).toBeCloseTo(Math.sqrt(1 / 3), 1);
    const g = expLine(1000, 100, 400);
    expect(g[0]).toBeCloseTo(100, 6);
    expect(g[999]).toBeCloseTo(400, 3);
    const rnd = mulberry32(1);
    const w = white(SR, rnd);
    const p = pink(SR, mulberry32(1));
    const hiW = rms(highpass(w, 4000));
    const hiP = rms(highpass(p, 4000));
    expect(hiP / rms(p)).toBeLessThan(hiW / rms(w));
    expect(peak(brown(SR, mulberry32(2)))).toBeGreaterThan(0);
  });

  it('a drift wanders smoothly inside −1 … 1', () => {
    const d = drift(SR * 4, 2, mulberry32(9));
    expect(peak(d)).toBeLessThanOrEqual(1);
    let step = 0;
    for (let i = 1; i < d.length; i++) step = Math.max(step, Math.abs((d[i] as number) - (d[i - 1] as number)));
    expect(step).toBeLessThan(0.001);
  });
});

describe('filters', () => {
  it('a low-pass lets the low through and takes the high away, a high-pass the reverse, a band-pass keeps its band', () => {
    expect(gainAt((x) => lowpass(x, 800), 100)).toBeGreaterThan(-1);
    expect(gainAt((x) => lowpass(x, 800), 6400)).toBeLessThan(-30);
    expect(gainAt((x) => highpass(x, 800), 6400)).toBeGreaterThan(-1);
    expect(gainAt((x) => highpass(x, 800), 100)).toBeLessThan(-30);
    expect(gainAt((x) => biquad(x, 'bp', 1000, 2), 1000)).toBeGreaterThan(-1);
    expect(gainAt((x) => biquad(x, 'bp', 1000, 2), 100)).toBeLessThan(-15);
  });

  it('a peak filter lifts its frequency by the gain it is given and a shelf lifts everything above its corner', () => {
    expect(gainAt((x) => biquad(x, 'peak', 1000, 2, 9), 1000)).toBeCloseTo(9, 0);
    expect(gainAt((x) => biquad(x, 'hs', 4000, 0.707, 6), 12000)).toBeCloseTo(6, 0);
    expect(gainAt((x) => biquad(x, 'ls', 200, 0.707, -6), 50)).toBeCloseTo(-6, 0);
  });

  it('a cutoff that moves keeps the filter stable and makes the sweep: dark at the start, bright at the end', () => {
    const n = secs(1);
    const x = white(n, mulberry32(3));
    const y = lowpass(x, expLine(n, 200, 12000), 2);
    for (let i = 0; i < n; i += 997) expect(Number.isFinite(y[i] as number)).toBe(true);
    expect(rms(highpass(y, 3000), 0, secs(0.2))).toBeLessThan(rms(highpass(y, 3000), secs(0.8), n));
  });

  it('takes away a constant offset', () => {
    const x = buf(SR);
    for (let i = 0; i < x.length; i++) x[i] = 0.4 + 0.1 * Math.sin(i / 20);
    const y = dcBlock(x);
    expect(Math.abs(rms(y, SR / 2) - 0.1 / Math.SQRT2)).toBeLessThan(0.01);
  });
});

describe('envelopes', () => {
  it('an ADSR rises, holds its sustain, and falls to exactly zero at the end', () => {
    const e = adsr(secs(2), 0.1, 0.3, 0.6, 0.5);
    expect(e[0]).toBe(0);
    expect(Math.max(...e)).toBeLessThanOrEqual(1);
    expect(e[secs(1)]).toBeCloseTo(0.6, 2);
    expect(e[e.length - 1]).toBe(0);
  });

  it('a breakpoint envelope passes through its points, straight or exponential, and holds the last value', () => {
    const lin = envelope(secs(1), [[0, 0], [0.5, 1], [1, 0]]);
    expect(lin[secs(0.25)]).toBeCloseTo(0.5, 3);
    const exp = envelope(secs(1), [[0, 100], [1, 400]], 'exp');
    expect(exp[secs(0.5)]).toBeCloseTo(200, 0);
    expect(envelope(10, [[0, 3]])[9]).toBe(3);
  });

  it('a decay is 37 % after its time constant; an attack-release and a gate start and end at nothing', () => {
    expect(decay(SR, 0.2)[secs(0.2)]).toBeCloseTo(Math.exp(-1), 3);
    const a = ar(secs(1), 0.2, 0.5);
    expect([a[0], a[secs(0.7)] as number]).toEqual([0, 0]);
    const g = gate(secs(1), 0.2, 0.6);
    expect([g[0], g[secs(0.4)], g[secs(0.9)]]).toEqual([0, 1, 0]);
  });
});

describe('the reverberation', () => {
  const impulse = (n: number): Stereo => {
    const l = buf(n);
    l[0] = 1;
    return { l, r: Float32Array.from(l) };
  };
  const energyDb = (b: Float32Array, from: number, to: number): number => db(rms(b, from, to) + 1e-12);

  it('a click rings for about the time it was told to, and does not grow: it is a room, not an echo chamber that screams', () => {
    const out = reverb(impulse(secs(0.1)), { rt60: 1.6, wet: 1, dry: 0, predelayMs: 5, damp: 0.2 });
    const early = energyDb(out.l, secs(0.25), secs(0.35));
    const late = energyDb(out.l, secs(1.05), secs(1.15));
    const later = energyDb(out.l, secs(2.4), secs(2.5));
    expect(early - late).toBeGreaterThan(12);
    expect(late - later).toBeGreaterThan(10);
    expect(Number.isFinite(peak(out.l))).toBe(true);
    // 60 dB in 1.6 s is 37.5 dB a second: between 0.3 s and 1.1 s the tail falls by roughly 30 dB (a darker tail falls a little faster)
    expect(early - late).toBeLessThan(55);
  });

  it('a bigger room rings longer and a darker one loses its high end first', () => {
    const short = reverb(impulse(secs(0.1)), { rt60: 0.5, wet: 1, dry: 0 });
    const long = reverb(impulse(secs(0.1)), { rt60: 3, wet: 1, dry: 0 });
    expect(energyDb(long.l, secs(1.2), secs(1.4))).toBeGreaterThan(energyDb(short.l, secs(1.2), secs(1.4)) + 10);
    const bright = reverb(impulse(secs(0.1)), { rt60: 2, wet: 1, dry: 0, damp: 0 });
    const dark = reverb(impulse(secs(0.1)), { rt60: 2, wet: 1, dry: 0, damp: 1 });
    const hi = (s: Stereo): number => rms(highpass(s.l, 5000), secs(0.6), secs(1.2)) / rms(s.l, secs(0.6), secs(1.2));
    expect(hi(dark)).toBeLessThan(hi(bright));
  });

  it('the tail is longer than the input by what it was told, and the two sides are not the same sound', () => {
    const out = reverb(impulse(secs(0.1)), { rt60: 1, wet: 1, dry: 0, tailSec: 2 });
    expect(out.l.length).toBe(secs(2.1));
    let diff = 0;
    for (let i = 0; i < out.l.length; i += 7) diff += Math.abs((out.l[i] as number) - (out.r[i] as number));
    expect(diff).toBeGreaterThan(0.01);
  });
});

describe('dynamics', () => {
  it('a limiter never lets the signal past its ceiling, and leaves what is below it alone', () => {
    const n = secs(1);
    const l = sine(n, 200).map((v) => v * 0.3) as Float32Array; // a steady tone well under the ceiling
    for (let i = secs(0.4); i < secs(0.45); i++) l[i] = (l[i] as number) * 5; // …and a burst five times louder: over it
    const s = stereoOf(l);
    const quiet = rms(l, secs(0.8), secs(0.95));
    const lowest = limit(s, -3, 5, 150);
    expect(peakDb(s)).toBeLessThanOrEqual(-3 + 0.05);
    expect(lowest).toBeLessThan(0.6);
    expect(rms(s.l, secs(0.2), secs(0.35))).toBeCloseTo(rms(l, secs(0.2), secs(0.35)), 3); // before the burst it did nothing
    expect(rms(s.l, secs(0.9), secs(0.99))).toBeGreaterThan(quiet * 0.9); // and it let go afterwards
  });

  it('a compressor takes the loud part down and leaves the quiet part alone', () => {
    const n = secs(1);
    const x = sine(n, 300);
    for (let i = 0; i < n / 2; i++) x[i] = (x[i] as number) * 0.05;
    const y = compress(x, -20, 4, 2, 60);
    expect(rms(y, secs(0.1), secs(0.4))).toBeCloseTo(rms(x, secs(0.1), secs(0.4)), 3);
    expect(rms(y, secs(0.7), secs(0.95))).toBeLessThan(rms(x, secs(0.7), secs(0.95)) * 0.6);
  });
});

describe('measuring', () => {
  it('reads loudness as broadcasting does: a full-scale 1 kHz sine is −3 LUFS, −20 dB is −23, and a pair of channels is 3 dB louder than one', () => {
    const one = sine(secs(2), 997);
    expect(integratedLufs(one)).toBeCloseTo(-3.01, 1);
    const quieter = sine(secs(2), 997).map((v) => v * dbToLin(-20)) as Float32Array;
    expect(integratedLufs(quieter)).toBeCloseTo(-23.01, 1);
    expect(integratedLufs(stereoOf(one)) - integratedLufs(one)).toBeCloseTo(3.01, 1);
    expect(momentaryLufs(one)).toBeCloseTo(-3.01, 1);
  });

  it('a short sound is measured as the loudness of its loudest 400 ms, so that a click is quieter than a hum of the same height', () => {
    const click = buf(secs(0.05));
    for (let i = 0; i < click.length; i++) click[i] = Math.sin(i / 5);
    const hum = sine(secs(1), 400);
    expect(momentaryLufs(click)).toBeLessThan(momentaryLufs(hum) - 6);
  });

  it('finds a true peak above the highest sample when the wave peaks between two samples', () => {
    const n = secs(0.2);
    const x = buf(n);
    for (let i = 0; i < n; i++) x[i] = 0.9 * Math.sin((Math.PI / 2) * i + Math.PI / 4); // a quarter of the sample rate: the samples never reach the top
    expect(peakDb(x)).toBeLessThan(-3);
    expect(truePeakDb(x)).toBeGreaterThan(-1.2);
  });

  it('finds the quiet stretches: the longest one and how much of the sound it is', () => {
    const x = buf(secs(1));
    x.fill(0.3, 0, secs(0.3));
    x.fill(0.3, secs(0.8), secs(1));
    const s = silence(x);
    expect(s.longestMs).toBeGreaterThanOrEqual(490);
    expect(s.longestMs).toBeLessThanOrEqual(510);
    expect(s.share).toBeCloseTo(0.5, 1);
  });

  it('tells a loop that closes on itself from one that clicks at the seam', () => {
    const n = secs(2);
    const closed = sine(n, 100); // 100 Hz × 2 s: a whole number of cycles
    expect(loopSeam(closed).step).toBeLessThan(2);
    const cut = sine(n, 100.37);
    expect(loopSeam(cut).step).toBeGreaterThan(3);
    // a loop that starts louder than it ends "breathes" at the seam
    const fading = sine(n, 100).map((v, i) => v * (1 - (0.9 * i) / n)) as Float32Array;
    expect(loopSeam(fading).levelDb).toBeGreaterThan(6);
  });
});

describe('the instruments', () => {
  /** The pitch of a sound, by autocorrelation, in Hz. */
  function pitchOf(x: Float32Array, from: number, expected: number): number {
    const lo = Math.floor(SR / (expected * 1.1));
    const hi = Math.ceil(SR / (expected * 0.9));
    const win = secs(0.1);
    let best = 0;
    let bestLag = lo;
    for (let lag = lo; lag <= hi; lag++) {
      let c = 0;
      for (let i = 0; i < win; i++) c += (x[from + i] as number) * (x[from + i + lag] as number);
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    return SR / bestLag;
  }

  it('a plucked string is in tune: within a few cents of the note, high and low', () => {
    for (const note of ['A2', 'D3', 'A4', 'E5']) {
      const f = hz(note);
      const x = pluck(f, 1.2, { ringSec: 1.5 }, mulberry32(seedOf(note)));
      const measured = pitchOf(x, secs(0.1), f);
      const cents = 1200 * Math.log2(measured / f);
      expect(Math.abs(cents), `${note}: ${measured.toFixed(2)} Hz`).toBeLessThan(12);
    }
  });

  it('is deterministic: the same note with the same generator is the same sound, byte for byte', () => {
    const a = pluck(220, 0.5, {}, mulberry32(5));
    const b = pluck(220, 0.5, {}, mulberry32(5));
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });
});
