import type { TrackRecipe } from '../catalog';
import { hz } from '../dsp/core';
import { bowed, frameDrum, riser, shimmer, taiko, tick } from '../dsp/inst';
import { basses, bells, pads, plucks, room, voices, type Chord, type Note, type Rnd } from './helpers';
import { master, Stage } from './stage';

/**
 * «CÁMARA» — the piece of R3 «Cámara del Sello» (docs/PROMPT18-LOG.md). Original: written for this game, from F♯ minor with the flat second (the G a minor ninth above the root, which is what makes it uneasy), in twelve
 * bars of 4/4 at 64 beats a minute.
 *
 * It is the chamber of a seal under water: everything that moves does so in ripples. A small figure of plucked strings never stops — eighth notes up and down the chord, the way light moves on the surface of dark water —
 * under a pad of hummed voices that sit a half step off the root; FM bells, brighter and more glassy than the ruins' glass, lay a melody over it that falls by step and is never sure where it is going; high partials
 * shimmer over all; the sub moves with the chords — F♯m, Gmaj7, Dmaj7, Bm7, G, C♯ — and the last chord, the dominant, leans back into the first.
 *
 * `drive` is the seal waking: a deep drum like a heart (two beats and a pause), a bowed figure that grinds a half step against its own root, a clock of fast ticks and a riser into every fourth bar.
 */
const BPM = 64;
const BARS = 12;

const CHORDS: readonly Chord[] = [
  { bar: 0, bars: 2, pad: ['F#3', 'A3', 'C#4', 'G4'], bass: 'F#1', arp: ['F#4', 'A4', 'C#5', 'A4'] },
  { bar: 2, bars: 2, pad: ['G3', 'B3', 'D4', 'F#4'], bass: 'G1', arp: ['G4', 'B4', 'D5', 'B4'] },
  { bar: 4, bars: 2, pad: ['D3', 'A3', 'C#4', 'F#4'], bass: 'D2', arp: ['F#4', 'A4', 'C#5', 'A4'] },
  { bar: 6, bars: 2, pad: ['B2', 'F#3', 'A3', 'D4'], bass: 'B1', arp: ['D4', 'F#4', 'A4', 'F#4'] },
  { bar: 8, bars: 2, pad: ['G3', 'D4', 'B4', 'D5'], bass: 'G1', arp: ['B4', 'D5', 'G5', 'D5'] },
  { bar: 10, bars: 2, pad: ['C#3', 'G#3', 'B3', 'F4'], bass: 'C#2', arp: ['G#4', 'C#5', 'F5', 'C#5'] },
];

const MELODY: readonly Note[] = [
  { at: 0, note: 'C#5', ring: 4 }, { at: 2, note: 'A4', db: -1 }, { at: 3.5, note: 'G4', db: -2 }, { at: 5, note: 'F#4', ring: 4 }, { at: 7, note: 'A4', db: -2 },
  { at: 8, note: 'B4', ring: 4 }, { at: 10, note: 'D5', db: -1 }, { at: 12, note: 'F#5', ring: 4 }, { at: 13.5, note: 'E5', db: -2 }, { at: 15, note: 'D5', db: -2 },
  { at: 16, note: 'C#5', ring: 4 }, { at: 18, note: 'F#5', db: -1 }, { at: 20, note: 'A5', ring: 4.5 }, { at: 21.5, note: 'F#5', db: -2 }, { at: 23, note: 'E5', db: -2 },
  { at: 24, note: 'D5', ring: 4 }, { at: 26, note: 'B4', db: -1 }, { at: 27.5, note: 'A4', db: -2 }, { at: 29, note: 'F#4', ring: 4 }, { at: 30.5, note: 'A4', db: -2 },
  { at: 32, note: 'G4', ring: 4 }, { at: 34, note: 'B4', db: -1 }, { at: 36, note: 'D5', ring: 4 }, { at: 37.5, note: 'B4', db: -2 }, { at: 39, note: 'G4', db: -2 },
  { at: 40, note: 'F5', ring: 4 }, { at: 42, note: 'G#5', db: -1 }, { at: 44, note: 'C#6', ring: 4.5 }, { at: 46, note: 'B5', db: -2 }, { at: 47.5, note: 'G#5', db: -3 },
];

/** The ripples: eighths up and down the chord, one of every four a little softer, none the same as its neighbour. */
const RIPPLE: ReadonlyArray<readonly [number, number, number]> = Array.from({ length: 16 }, (_, k) => [k * 0.5, [0, 1, 2, 3, 2, 1, 3, 2][k % 8] as number, k % 4 === 3 ? -3 : k % 2 ? -1.5 : 0]);

function base(rnd: Rnd) {
  const st = new Stage(BPM, BARS, rnd);
  basses(st, CHORDS, { db: -10 });
  pads(st, rnd, CHORDS, { db: -13, attack: 1.8, release: 2.2, cutoff: 1500 });
  voices(st, rnd, 4, 8, ['F#3', 'C#4', 'A4'], 'm', { db: -15, attack: 2.2, release: 2.4 });
  plucks(st, rnd, CHORDS, RIPPLE, { db: -16, ring: 1.8, bright: 0.5, send: 0.8 });
  bells(st, rnd, MELODY, { kind: 'fm', db: -13, bright: 1 });
  // starlight over everything: three long shimmers, each fading into the next
  for (const [bar, note] of [[0, 'F#6'], [4, 'C#7'], [8, 'A6']] as const) st.put(shimmer(hz(note), 4 * 4 * st.beatSec + 3, { partials: 5, level: 1 }, rnd), st.at(bar), { db: -21, send: 0.8, direct: 0.5, pan: bar === 4 ? 0.3 : -0.3 });
  return master(st.render(room(3.9, { damp: 0.4, size: 1.7 }), { wetDb: 0, lowCutHz: 28 }), -20, -1.5);
}

function drive(rnd: Rnd) {
  const st = new Stage(BPM, BARS, rnd);
  for (let bar = 0; bar < BARS; bar++) {
    // the heart of the seal: two beats and a pause
    st.put(taiko({ size: 2.0, vel: 0.8 }, rnd), st.at(bar, 0), { db: -6, send: 0.45, direct: 0.9, loose: 6 });
    st.put(taiko({ size: 1.7, vel: 0.55 }, rnd), st.at(bar, 0.75), { db: -9, send: 0.45, direct: 0.9, loose: 6 });
    for (let k = 0; k < 8; k++) st.put(tick({ pitch: 1.3 + (k % 3) * 0.12 }, rnd), st.at(bar, 2 + k * 0.25), { db: -27 + (k % 2) * 2, send: 0.2, pan: k % 2 ? 0.45 : -0.45 });
    st.put(frameDrum({ vel: 0.5, pitch: 0.9 }, rnd), st.at(bar, 2.5), { db: -18, send: 0.3 });
  }
  // the grind: a bowed note and the half step above it, trading places each beat of the bar's second half
  for (const c of CHORDS) {
    const root = hz(c.bass) * 2;
    for (let bar = c.bar; bar < c.bar + c.bars; bar++) {
      for (let k = 0; k < 4; k++) {
        st.put(bowed(root * (k % 2 ? 2 ** (1 / 12) : 1), 0.45, { attack: 0.04, release: 0.2, bright: 1.7, vibratoCents: 8, rasp: 0.12 }, rnd), st.at(bar, k), { db: -13, send: 0.25, direct: 1, loose: 5 });
      }
    }
  }
  for (const bar of [4, 8, 12]) st.put(riser(3.1, { from: 220, to: 4800, tone: 0.3, level: 0.9 }, rnd), st.at(bar) - 3.1 / st.beatSec, { db: -17, send: 0.5 });
  return master(st.render(room(3.0, { damp: 0.5 }), { wetDb: -1, lowCutHz: 36 }), -24, -1.5);
}

export const CHAMBER: TrackRecipe = {
  id: 'chamber',
  group: 'music.chamber',
  bpm: BPM,
  bars: BARS,
  mono: ['drive'],
  render: (rnd) => ({ base: base(rnd), drive: drive(rnd) }),
  note: 'R3 — a seal under water: ripples of plucked strings that never stop, hummed voices a half step off the root, FM bells that fall by step, shimmering partials and a sub that follows F♯m · Gmaj7 · Dmaj7 · Bm7 · G · C♯. Drive layer: a heart of two drums, a bowed grind on a half step, ticks and risers',
};
