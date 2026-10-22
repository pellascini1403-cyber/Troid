import type { TrackRecipe } from '../catalog';
import { hz } from '../dsp/core';
import { bowed, frameDrum, pluck, riser, taiko, tick } from '../dsp/inst';
import { bells, basses, pads, room, strings, type Chord, type Note, type Rnd } from './helpers';
import { master, Stage } from './stage';

/**
 * «RUINAS» — the piece of the first two places, R1 «Puerta de las Ruinas» and R2 «Galería de Raíces» (docs/PROMPT18-LOG.md). Original: written for this game, from D minor, in twelve bars of 4/4 at 66 beats a minute.
 *
 * It is the sound of walking into something very old, alone. A pad that opens slowly on D minor, a low sub under it that moves by the chords — Dm, B♭maj7, Gm, C(add9), B♭, A — so that the last chord (the dominant) leans
 * back into the first; a sparse melody of glass bells that does not hurry, falling and rising round the notes of the chord, and from the sixth bar a soft figure of plucked strings that gives it a pulse without a beat.
 *
 * Two layers, in step: `base` is all of the above (the exploration); `drive` is what comes in when something is near — a low drum on the beat, a plucked bass that walks the chord, a clock of ticks, a bowed note that does
 * not resolve and a riser into every fourth bar. The drive layer alone is a rhythm and nothing else, so that it can lie over the base without covering it.
 */
const BPM = 66;
const BARS = 12;

const CHORDS: readonly Chord[] = [
  { bar: 0, bars: 2, pad: ['D3', 'A3', 'D4', 'F4'], bass: 'D2', arp: ['D4', 'F4', 'A4', 'D5'] },
  { bar: 2, bars: 2, pad: ['Bb2', 'F3', 'A3', 'D4'], bass: 'Bb1', arp: ['D4', 'F4', 'A4', 'D5'] },
  { bar: 4, bars: 2, pad: ['G3', 'Bb3', 'D4', 'F4'], bass: 'G1', arp: ['G4', 'Bb4', 'D5', 'F5'] },
  { bar: 6, bars: 2, pad: ['C3', 'G3', 'D4', 'E4'], bass: 'C2', arp: ['E4', 'G4', 'C5', 'D5'] },
  { bar: 8, bars: 2, pad: ['Bb2', 'F3', 'Bb3', 'D4'], bass: 'Bb1', arp: ['F4', 'Bb4', 'D5', 'F5'] },
  { bar: 10, bars: 2, pad: ['A2', 'E3', 'A3', 'C#4'], bass: 'A1', arp: ['E4', 'A4', 'C#5', 'E5'] },
];

/** The melody, in beats from the start of the loop. */
const MELODY: readonly Note[] = [
  { at: 0, note: 'A4', ring: 4.5 }, { at: 2.5, note: 'F4', db: -1 }, { at: 3.5, note: 'E4', db: -3 }, { at: 5, note: 'D5', ring: 4 }, { at: 7, note: 'A4' },
  { at: 8, note: 'D5', ring: 4.5 }, { at: 10, note: 'C5', db: -1 }, { at: 11.5, note: 'A4', db: -2 }, { at: 13, note: 'F4', ring: 4 }, { at: 14.5, note: 'A4', db: -2 },
  { at: 16, note: 'Bb4', ring: 4.5 }, { at: 18, note: 'G4', db: -1 }, { at: 20, note: 'D5', ring: 4 }, { at: 21.5, note: 'C5', db: -2 }, { at: 23, note: 'Bb4', db: -2 },
  { at: 24, note: 'E5', ring: 4.5 }, { at: 26, note: 'G4', db: -2 }, { at: 28, note: 'C5', db: -1 }, { at: 29.5, note: 'D5', db: -2 }, { at: 31, note: 'E5', ring: 4 },
  { at: 32, note: 'D5', ring: 4.5 }, { at: 34, note: 'F5', db: -1 }, { at: 36, note: 'D5', db: -2 }, { at: 37.5, note: 'C5', db: -2 }, { at: 38.5, note: 'Bb4', db: -2 },
  { at: 40, note: 'C#5', ring: 4.5 }, { at: 42, note: 'E5', db: -1 }, { at: 44, note: 'A4', ring: 4.5 }, { at: 46, note: 'G4', db: -2 }, { at: 47.5, note: 'E4', db: -3 },
];

function base(rnd: Rnd) {
  const st = new Stage(BPM, BARS, rnd);
  basses(st, CHORDS, { db: -8 });
  pads(st, rnd, CHORDS, { db: -11, attack: 1.6, release: 2.0, cutoff: 1800 });
  strings(st, rnd, CHORDS.slice(2), (c) => c.pad[1] as string, { db: -15, bright: 0.7 });
  bells(st, rnd, MELODY, { kind: 'glass', db: -11 });
  // the figure of plucked strings: from the sixth bar, off the beat, never twice the same
  const figure: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0], [1.5, 2, -1], [2.5, 1, -2], [4, 3, 0], [5.5, 1, -1], [6.5, 2, -2]];
  const later = CHORDS.filter((c) => c.bar >= 6);
  for (const c of later) {
    figure.forEach(([beat, idx, db], k) => {
      if (!c.arp) return;
      st.put(pluck(hz(c.arp[idx % c.arp.length] as string), 2.5, { ringSec: 2.2, bright: 0.42 }, rnd), st.at(c.bar) + beat, { db: -17 + db, pan: ((k * 0.43) % 1) * 1.0 - 0.5, send: 0.75, direct: 0.7, loose: 12 });
    });
  }
  return master(st.render(room(3.6), { wetDb: 0, lowCutHz: 28 }), -20, -1.5);
}

function drive(rnd: Rnd) {
  const st = new Stage(BPM, BARS, rnd);
  for (let bar = 0; bar < BARS; bar++) {
    const big = bar % 4 === 0;
    for (const [beat, vel, size] of [[0, big ? 1 : 0.85, big ? 1.5 : 1.2], [1.5, 0.45, 1], [2, 0.7, 1], [3.5, 0.4, 1]] as const) {
      st.put(taiko({ size, vel }, rnd), st.at(bar, beat), { db: -7, send: 0.35, direct: 0.9, loose: 8 });
    }
    for (let b = 0; b < 4; b++) {
      st.put(frameDrum({ vel: 0.5, pitch: 1 + (b % 2) * 0.1 }, rnd), st.at(bar, b + 0.5), { db: -19, send: 0.3, pan: b % 2 ? 0.3 : -0.3, loose: 6 });
      st.put(tick({ pitch: b === 0 ? 1.15 : 1 }, rnd), st.at(bar, b), { db: -26, send: 0.15, pan: 0.4 });
    }
  }
  // the bass walks the chord, in eighths: the root, the fifth and the octave
  for (const c of CHORDS) {
    const root = hz(c.bass) * 2;
    const walk = [1, 1, 1.5, 1, 1, 2, 1.5, 1];
    for (let bar = c.bar; bar < c.bar + c.bars; bar++) {
      walk.forEach((m, k) => st.put(pluck(root * m, 0.6, { ringSec: 0.45, bright: 0.4 }, rnd), st.at(bar, k * 0.5), { db: k % 2 ? -15 : -12, send: 0.2, direct: 1, loose: 6 }));
    }
    // a bowed note that does not resolve, high and thin, under each chord
    const top = c.pad[c.pad.length - 1] as string;
    st.put(bowed(hz(top) * 1, c.bars * 4 * st.beatSec + 0.8, { attack: 1.0, release: 1.2, bright: 1.5, vibratoCents: 24, rasp: 0.08 }, rnd), st.at(c.bar), { db: -16, pan: 0.3, send: 0.5, loose: 20 });
  }
  // a riser into every fourth bar (the last one runs into the first: the loop turns on it)
  for (const bar of [4, 8, 12]) {
    const len = 2.8;
    st.put(riser(len, { from: 280, to: 5200, tone: 0.18, level: 0.9 }, rnd), st.at(bar) - len / st.beatSec, { db: -17, send: 0.45, loose: 0 });
  }
  return master(st.render(room(2.8, { damp: 0.6 }), { wetDb: -1, lowCutHz: 38 }), -24, -1.5);
}

export const RUINS: TrackRecipe = {
  id: 'ruins',
  group: 'music.ruins',
  bpm: BPM,
  bars: BARS,
  mono: ['drive'],
  render: (rnd) => ({ base: base(rnd), drive: drive(rnd) }),
  note: 'R1 and R2 — walking into something very old: a pad on D minor, a sub that follows Dm · B♭maj7 · Gm · C · B♭ · A, a sparse melody of glass bells and, from the sixth bar, a figure of plucked strings. Drive layer: low drum, walking bass, clock, riser',
};
