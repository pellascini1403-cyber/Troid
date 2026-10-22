import type { TrackRecipe } from '../catalog';
import { hz } from '../dsp/core';
import { bell, bowed, gong, shimmer, taiko } from '../dsp/inst';
import { basses, pads, room, voices, type Chord, type Note, type Rnd } from './helpers';
import { master, Stage } from './stage';

/**
 * «SANTUARIO» — the piece of R4 «Santuario», for the way in and the rest at its shrine (docs/PROMPT18-LOG.md). Original: written for this game, from A minor, in ten bars of 4/4 at 56 beats a minute.
 *
 * It is the quiet before the Warden: a place made to be prayed in and now holding something else. A choir of voices that are no person's — open fifths and the ninth above the root, the way a sacred space is sung — holds
 * each chord for two bars; a gong at the start of every round, low and long; a cello that falls by step through the chords' thirds and fifths (A, G, F, E, D, C, B); a bronze bell that tolls once in a while, slowly, as a
 * bell in a tower that nobody rings; and under it the sub — Am, Fmaj7, Dm, C, E — the last chord a dominant that leans back into the first.
 *
 * `drive` is for when something wakes in it: a slow drum like footsteps, the choir swelling louder on a vowel that opens, and a bowed drone that rises a fifth.
 */
const BPM = 56;
const BARS = 10;

const CHORDS: readonly Chord[] = [
  { bar: 0, bars: 2, pad: ['A2', 'E3', 'B3', 'C4'], bass: 'A1' },
  { bar: 2, bars: 2, pad: ['F2', 'C3', 'E3', 'B3'], bass: 'F1' },
  { bar: 4, bars: 2, pad: ['D3', 'A3', 'D4', 'F4'], bass: 'D2' },
  { bar: 6, bars: 2, pad: ['C3', 'G3', 'E4', 'D4'], bass: 'C2' },
  { bar: 8, bars: 2, pad: ['E3', 'B3', 'G#4', 'D4'], bass: 'E2' },
];

const TOLLS: readonly Note[] = [
  { at: 0, note: 'A4', ring: 5.5 }, { at: 6, note: 'E5', ring: 5, db: -2 }, { at: 12, note: 'C5', ring: 5, db: -2 }, { at: 19, note: 'A4', ring: 5, db: -3 },
  { at: 24, note: 'D5', ring: 5.5, db: -1 }, { at: 30, note: 'G4', ring: 5, db: -3 }, { at: 35, note: 'E5', ring: 5.5, db: -2 }, { at: 38, note: 'G#4', ring: 5.5, db: -4 },
];

/** The cello's line: one note a bar or two, falling by step. */
const CELLO: ReadonlyArray<readonly [bar: number, bars: number, note: string]> = [[0, 2, 'A3'], [2, 1, 'G3'], [3, 1, 'F3'], [4, 2, 'E3'], [6, 1, 'D3'], [7, 1, 'C3'], [8, 1, 'B2'], [9, 1, 'E3']];

function base(rnd: Rnd) {
  const st = new Stage(BPM, BARS, rnd);
  basses(st, CHORDS, { db: -9, warmth: 0.35 });
  voices(st, rnd, 0, 2, ['A3', 'E4', 'C5'], 'o', { db: -11, attack: 2.4, release: 2.6 });
  voices(st, rnd, 2, 2, ['F3', 'C4', 'A4'], 'o', { db: -11, attack: 2.4, release: 2.6 });
  voices(st, rnd, 4, 2, ['D3', 'A3', 'F4'], 'a', { db: -12, attack: 2.4, release: 2.6 });
  voices(st, rnd, 6, 2, ['C4', 'G4', 'E5'], 'o', { db: -12, attack: 2.4, release: 2.6 });
  voices(st, rnd, 8, 2, ['E3', 'B3', 'G#4'], 'a', { db: -12, attack: 2.2, release: 2.6 });
  pads(st, rnd, CHORDS, { db: -17, attack: 2.2, release: 2.6, cutoff: 1100, voices: 3 });
  st.put(gong(hz('A2'), 12, { decaySec: 9 }, rnd), 0, { db: -12, send: 0.7, direct: 0.7, loose: 0 });
  for (const [bar, bars, note] of CELLO) st.put(bowed(hz(note), bars * 4 * st.beatSec + 0.7, { attack: 0.9, release: 1.2, vibratoCents: 14, bright: 0.65, rasp: 0.03 }, rnd), st.at(bar), { db: -14, pan: -0.25, send: 0.55, loose: 30 });
  TOLLS.forEach((n, k) => st.put(bell(hz(n.note), n.ring ?? 5, { kind: 'bronze', decaySec: (n.ring ?? 5) * 0.8, click: 0.05 }, rnd), n.at, { db: -13 + (n.db ?? 0), pan: k % 2 ? 0.35 : -0.35, send: 0.9, direct: 0.5, loose: 20 }));
  st.put(shimmer(hz('E6'), 10 * 4 * st.beatSec + 3, { partials: 5, level: 1 }, rnd), 0, { db: -23, send: 0.8, direct: 0.5 });
  return master(st.render(room(4.4, { damp: 0.35, size: 2.0, predelayMs: 34 }), { wetDb: 0, lowCutHz: 28 }), -20, -1.5);
}

function drive(rnd: Rnd) {
  const st = new Stage(BPM, BARS, rnd);
  // footsteps of something very large: a slow drum, once a bar and once again, a little later
  for (let bar = 0; bar < BARS; bar++) {
    st.put(taiko({ size: 2.2, vel: 0.75 }, rnd), st.at(bar, 0), { db: -6, send: 0.5, direct: 0.9, loose: 8 });
    st.put(taiko({ size: 1.8, vel: 0.5 }, rnd), st.at(bar, 2.5), { db: -10, send: 0.5, direct: 0.9, loose: 8 });
  }
  // the choir opens on its vowel: louder, and a fifth higher than the chord
  for (const c of CHORDS) {
    const top = hz(c.pad[c.pad.length - 1] as string);
    st.put(bowed(top * 1.5, c.bars * 4 * st.beatSec + 0.8, { attack: 1.4, release: 1.6, bright: 1.3, vibratoCents: 20, rasp: 0.06 }, rnd), st.at(c.bar), { db: -15, pan: 0.3, send: 0.6, loose: 25 });
  }
  voices(st, rnd, 0, 4, ['A3', 'E4', 'A4'], 'a', { db: -12, attack: 1.6, release: 2 });
  voices(st, rnd, 4, 4, ['D3', 'A3', 'D4'], 'a', { db: -12, attack: 1.6, release: 2 });
  voices(st, rnd, 8, 2, ['E3', 'B3', 'E4'], 'a', { db: -12, attack: 1.6, release: 2 });
  return master(st.render(room(3.4, { damp: 0.45, size: 1.8 }), { wetDb: -1, lowCutHz: 36 }), -24, -1.5);
}

export const SANCTUM: TrackRecipe = {
  id: 'sanctum',
  group: 'music.sanctum',
  bpm: BPM,
  bars: BARS,
  mono: ['drive'],
  render: (rnd) => ({ base: base(rnd), drive: drive(rnd) }),
  note: 'R4, before and after the fight — a place made to be prayed in: voices that are no person\'s on open fifths, a gong at the start of every round, a cello falling by step, a bronze bell tolling slowly, a sub on Am · Fmaj7 · Dm · C · E. Drive layer: footsteps of a slow drum, the choir opening on its vowel',
};
