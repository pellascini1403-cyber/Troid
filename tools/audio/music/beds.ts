import type { TrackRecipe } from '../catalog';
import { buf, hz, mixInto, SR, secs, times, type Buf, type Stereo } from '../dsp/core';
import { bandpass, highpass, lowpass } from '../dsp/filter';
import { brown, drift, lfo, pink, sine, vibrato } from '../dsp/osc';
import { crossfadeStereo, master } from './stage';

/**
 * THE BEDS OF THE AMBIENCE (docs/PROMPT18-LOG.md): what a place sounds like when nothing is happening in it. Each is a loop of twelve seconds of texture — noise through filters that wander, a few tones that breathe — made
 * to be heard for minutes without being noticed: no event in it, nothing that repeats at a rhythm the ear can count, and a level so low that the music and the hero's own sounds lie on top of it.
 *
 * Every bed is made 21 s long and its last 3 s are crossfaded into its first (an equal-power crossfade of a texture that has no pulse), so that the loop closes on itself with no click and no change of level.
 */
const LOOP_SEC = 12;
const XFADE_SEC = 3;
const TOTAL = LOOP_SEC + XFADE_SEC;

type Rnd = () => number;

/** A slowly varying gain 0 … 1 (the gust, the swell), from a drifting control: `depth` 0 is a constant level, 1 swings it from silence to full. */
function swellOf(n: number, rate: number, depth: number, rnd: Rnd): Buf {
  const d = drift(n, rate, rnd);
  const out = buf(n);
  for (let i = 0; i < n; i++) out[i] = 1 - depth + depth * (((d[i] as number) + 1) / 2) ** 1.5;
  return out;
}

/** A moving centre frequency: `lo … hi`, following a drift. */
function wander(n: number, lo: number, hi: number, rate: number, rnd: Rnd): Buf {
  const d = drift(n, rate, rnd);
  const out = buf(n);
  for (let i = 0; i < n; i++) out[i] = lo * (hi / lo) ** (((d[i] as number) + 1) / 2);
  return out;
}

function bed(left: (rnd: Rnd) => Buf, right: (rnd: Rnd) => Buf, rnd: Rnd, lufs: number): Stereo {
  const s = crossfadeStereo({ l: left(rnd), r: right(rnd) }, XFADE_SEC);
  return master(s, lufs, -3);
}

// ------------------------------------------------------------------------------------------------ R1: the wind in the ruins

function ruinsSide(rnd: Rnd, side: -1 | 1): Buf {
  const n = secs(TOTAL);
  // the body of the wind: dark, broad, rising and falling over ten seconds or so
  const body = times(lowpass(pink(n, rnd), 520, 0.6), swellOf(n, 0.09, 0.7, rnd));
  // the whistle of a gap in the masonry: a narrow band that wanders and is heard in gusts
  const whistle = times(bandpass(pink(n, rnd), wander(n, 480, 1150, 0.12, rnd), 9), swellOf(n, 0.1, 0.95, rnd));
  // air: a veil of high noise
  const air = times(highpass(pink(n, rnd), 3200), swellOf(n, 0.07, 0.6, rnd));
  // weight: a very low tone that gives the place a floor (the D of the piece)
  const floor = times(sine(n, hz('D2') * (side === 1 ? 1.002 : 0.998), rnd()), swellOf(n, 0.05, 0.4, rnd));
  const out = buf(n);
  mixInto(out, body, 0, 1);
  mixInto(out, whistle, 0, 0.55);
  mixInto(out, air, 0, 0.05);
  mixInto(out, floor, 0, 0.1);
  return out;
}

// ------------------------------------------------------------------------------------------------ R2: roots, earth and damp

function rootsSide(rnd: Rnd, side: -1 | 1): Buf {
  const n = secs(TOTAL);
  // the breathing of the earth: brown noise, a low rumble that swells and falls
  const rumble = times(lowpass(brown(n, rnd), 190, 0.7), swellOf(n, 0.08, 0.55, rnd));
  // old wood: a few low resonances that wander (a root taking a load)
  const wood = times(bandpass(pink(n, rnd), wander(n, 150, 310, 0.1, rnd), 7), swellOf(n, 0.11, 0.9, rnd));
  // a hum: the roots as an instrument, a root and a fifth that beat slowly
  const hum = buf(n);
  for (const [f, level, det] of [[hz('A1'), 1, 0], [hz('A1') * 1.5, 0.45, side * 0.3], [hz('A2'), 0.25, -side * 0.45]] as const) {
    const t = times(sine(n, f + det, rnd()), swellOf(n, 0.06 + rnd() * 0.04, 0.5, rnd));
    mixInto(hum, t, 0, level);
  }
  // damp air: a little high noise that comes and goes
  const damp = times(bandpass(pink(n, rnd), wander(n, 1800, 3600, 0.15, rnd), 1.2), swellOf(n, 0.13, 0.9, rnd));
  const out = buf(n);
  mixInto(out, rumble, 0, 1.1);
  mixInto(out, wood, 0, 0.8);
  mixInto(out, hum, 0, 0.12);
  mixInto(out, damp, 0, 0.05);
  return out;
}

// ------------------------------------------------------------------------------------------------ R3: a sunken chamber

function chamberSide(rnd: Rnd, side: -1 | 1): Buf {
  const n = secs(TOTAL);
  // deep water in a stone room: dark noise with a hollow wobble
  const water = times(lowpass(brown(n, rnd), 420, 0.8), swellOf(n, 0.1, 0.5, rnd));
  const hollow = times(bandpass(pink(n, rnd), wander(n, 230, 470, 0.14, rnd), 5.5), swellOf(n, 0.09, 0.85, rnd));
  // the seal: a floor of two very low tones, F# and C#, that move a little against each other
  const floor = buf(n);
  mixInto(floor, times(sine(n, hz('F#1') + side * 0.2, rnd()), swellOf(n, 0.05, 0.4, rnd)), 0, 1);
  mixInto(floor, times(sine(n, hz('C#2') - side * 0.25, rnd()), swellOf(n, 0.07, 0.5, rnd)), 0, 0.7);
  // the magic: a few high, faint partials that each have a life of their own
  const magic = buf(n);
  for (const [note, level] of [['F#5', 0.4], ['A5', 0.3], ['C#6', 0.25], ['E6', 0.15]] as const) {
    const f = hz(note) * vibrato(n, 0.2 + rnd() * 0.2, 6, 0, 2, rnd())[0]!;
    mixInto(magic, times(sine(n, f * (1 + side * 0.0008), rnd()), swellOf(n, 0.08 + rnd() * 0.08, 1, rnd)), 0, level);
  }
  const out = buf(n);
  mixInto(out, water, 0, 1);
  mixInto(out, hollow, 0, 0.65);
  mixInto(out, floor, 0, 0.14);
  mixInto(out, magic, 0, 0.05);
  return out;
}

// ------------------------------------------------------------------------------------------------ R4: the vast quiet of the sanctum

function sanctumSide(rnd: Rnd, side: -1 | 1): Buf {
  const n = secs(TOTAL);
  // a great room: a soft, wide noise with its low end taken off, rising and falling very slowly
  const air = times(bandpass(pink(n, rnd), wander(n, 260, 900, 0.07, rnd), 0.9), swellOf(n, 0.06, 0.6, rnd));
  // the weight under it: a sub-bass that is felt rather than heard
  const sub = buf(n);
  mixInto(sub, times(sine(n, hz('A1') * 0.75 + side * 0.15, rnd()), swellOf(n, 0.04, 0.4, rnd)), 0, 1);
  mixInto(sub, times(sine(n, hz('E2') + side * 0.2, rnd()), swellOf(n, 0.05, 0.5, rnd)), 0, 0.5);
  // the violet energy of the place: pairs of high tones a few Hz apart, so that each pair beats slowly
  const energy = buf(n);
  for (const [note, level] of [['A5', 0.4], ['E6', 0.3], ['A6', 0.18]] as const) {
    const f = hz(note);
    const beat = 1.5 + rnd() * 2;
    mixInto(energy, times(sine(n, f, rnd()), swellOf(n, 0.06 + rnd() * 0.05, 0.9, rnd)), 0, level * 0.6);
    mixInto(energy, times(sine(n, f + beat * (side === 1 ? 1 : 1.2), rnd()), swellOf(n, 0.05 + rnd() * 0.05, 0.9, rnd)), 0, level * 0.5);
  }
  const breath = times(lfo(n, 0.055, rnd()), buf(n).fill(1));
  for (let i = 0; i < n; i++) breath[i] = 0.8 + 0.2 * (breath[i] as number);
  const out = buf(n);
  mixInto(out, times(air, breath), 0, 1);
  mixInto(out, sub, 0, 0.22);
  mixInto(out, energy, 0, 0.07);
  return out;
}

function recipe(id: string, group: string, side: (rnd: Rnd, side: -1 | 1) => Buf, lufs: number, note: string): TrackRecipe {
  return {
    id,
    group,
    bus: 'ambience',
    bpm: 0,
    bars: 0,
    render: (rnd) => ({ base: bed((r) => side(r, -1), (r) => side(r, 1), rnd, lufs) }),
    note,
  };
}

export const BEDS: TrackRecipe[] = [
  recipe('bed.ruins', 'amb.ruins', ruinsSide, -31, 'R1: wind through broken masonry — a dark body of air, a whistle in a gap that comes and goes, a veil of high noise and the weight of a low D'),
  recipe('bed.roots', 'amb.roots', rootsSide, -31, 'R2: the damp earth — a low rumble that breathes, old wood taking a load, a hum of roots a fifth apart'),
  recipe('bed.chamber', 'amb.chamber', chamberSide, -30, 'R3: a sunken chamber — deep water in stone, a hollow wobble, two very low tones for the seal and a few faint partials of its magic'),
  recipe('bed.sanctum', 'amb.sanctum', sanctumSide, -32, 'R4: the vast quiet — a wide soft air, a sub-bass felt more than heard and pairs of high tones that beat slowly: the violet energy of the place'),
];

/** The length of a bed's loop, seconds. */
export const BED_SECONDS = LOOP_SEC;
export const BED_SAMPLES = LOOP_SEC * SR;
