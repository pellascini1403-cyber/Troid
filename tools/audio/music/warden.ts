import type { TrackRecipe } from '../catalog';
import { hz } from '../dsp/core';
import { bell, bowed, choir, frameDrum, pluck, riser, shimmer, sub, taiko, tick } from '../dsp/inst';
import { basses, room, type Chord, type Rnd } from './helpers';
import { master, Stage } from './stage';

/**
 * «EL GUARDIÁN DE TINTA» — the piece of the fight with the Ink Warden (docs/PROMPT18-LOG.md). Original: written for this game, from D minor, in sixteen bars of 4/4 at 108 beats a minute.
 *
 * Where the other pieces breathe, this one marches. Drums of the taiko family carry the beat in a pattern that never quite lands where it is expected — the first beat, a pair of pushed eighths, the fourth beat — under a
 * bowed bass that grinds the root in eighths, a sub on the chord's root and a choir that strikes the first beat of every bar and lets go of it at once. The harmony stays close to D and leans on the flat second —
 * Dm, B♭, Gm, A, E♭ — so that the music is always about to fall; a tolling of bells at the top of every fourth bar gives the long line, and a riser runs into each of them.
 *
 * `base` is the fight: it is always there. `drive` is what the fight gets worse with — a plucked figure in sixteenths high above the beat, a running ticking, strings that tremble on one note, a double drum and a
 * second riser — and the game brings it in at half when the Warden wakes and in full when it turns.
 */
const BPM = 108;
const BARS = 16;

/** One chord a bar, eight chords, twice (the second time with the harmony leaning harder on the flat second). */
const BAR_CHORDS: ReadonlyArray<readonly [root: string, notes: readonly string[]]> = [
  ['D2', ['D3', 'A3', 'F4']], ['D2', ['D3', 'A3', 'F4']], ['Bb1', ['Bb2', 'F3', 'D4']], ['A1', ['A2', 'E3', 'C#4']],
  ['D2', ['D3', 'A3', 'F4']], ['D2', ['D3', 'A3', 'F4']], ['G1', ['G2', 'D3', 'Bb3']], ['A1', ['A2', 'E3', 'C#4']],
  ['D2', ['D3', 'A3', 'F4']], ['Eb2', ['Eb3', 'Bb3', 'G4']], ['D2', ['D3', 'A3', 'F4']], ['Eb2', ['Eb3', 'Bb3', 'G4']],
  ['Bb1', ['Bb2', 'F3', 'D4']], ['G1', ['G2', 'D3', 'Bb3']], ['A1', ['A2', 'E3', 'C#4']], ['A1', ['A2', 'E3', 'C#4']],
];

const CHORDS: readonly Chord[] = BAR_CHORDS.map(([bass, pad], bar) => ({ bar, bars: 1, pad, bass }));

function base(rnd: Rnd) {
  const st = new Stage(BPM, BARS, rnd);
  basses(st, CHORDS, { db: -8, warmth: 0.4, send: 0.1 });
  for (let bar = 0; bar < BARS; bar++) {
    const [root, notes] = BAR_CHORDS[bar] as readonly [string, readonly string[]];
    const lift = bar % 4 === 3 ? 1.5 : 1;
    // the drums: the first beat, a pair of pushed eighths, the fourth beat
    for (const [beat, vel, size] of [[0, 1, 1.5], [1.5, 0.65, 1.1], [2, 0.8, 1.1], [3, 0.7 * lift, 1.0], [3.5, 0.5, 1]] as const) {
      st.put(taiko({ size, vel }, rnd), st.at(bar, beat), { db: -5, send: 0.35, direct: 0.95, loose: 6 });
    }
    // the bass: eighths on the root, one of them a half step up
    for (let k = 0; k < 8; k++) {
      const f = hz(root) * 2 * (k === 5 && bar % 2 === 1 ? 2 ** (1 / 12) : 1);
      st.put(bowed(f, 0.38, { attack: 0.03, release: 0.15, bright: 1.9, vibratoCents: 4, rasp: 0.1 }, rnd), st.at(bar, k * 0.5), { db: k % 2 ? -14 : -11, send: 0.15, direct: 1, loose: 4 });
    }
    // the choir strikes the downbeat and lets go
    notes.forEach((n, i) => st.put(choir(hz(n), 1.6, 'a', { attack: 0.05, release: 0.9, breath: 0.1 }, rnd), st.at(bar), { db: -13 - i, pan: (i - 1) * 0.4, send: 0.7, direct: 0.7, loose: 12 }));
    // the tolling at the top of every fourth bar
    if (bar % 4 === 0) st.put(bell(hz(notes[2] as string) * 2, 4.5, { kind: 'bronze', decaySec: 3.6, click: 0.1 }, rnd), st.at(bar, 0), { db: -12, send: 0.9, direct: 0.5, pan: bar % 8 === 0 ? -0.3 : 0.3 });
  }
  for (const bar of [4, 8, 12, 16]) st.put(riser(2.0, { from: 260, to: 5200, tone: 0.25, level: 0.9 }, rnd), st.at(bar) - 2.0 / st.beatSec, { db: -16, send: 0.4 });
  st.put(shimmer(hz('A5'), BARS * 4 * st.beatSec + 3, { partials: 5, level: 1 }, rnd), 0, { db: -24, send: 0.8, direct: 0.5 });
  return master(st.render(room(2.4, { damp: 0.55, size: 1.3, predelayMs: 18 }), { wetDb: -1, lowCutHz: 34 }), -19, -1.5);
}

function drive(rnd: Rnd) {
  const st = new Stage(BPM, BARS, rnd);
  for (let bar = 0; bar < BARS; bar++) {
    const [root, notes] = BAR_CHORDS[bar] as readonly [string, readonly string[]];
    // sixteenths high above the beat: the chord's notes in a figure that rises and falls
    const fig = [0, 1, 2, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 0, 1, 2];
    fig.forEach((idx, k) => {
      const accent = k % 4 === 0;
      st.put(pluck(hz(notes[idx % notes.length] as string) * 2, 0.4, { ringSec: 0.3, bright: 0.5 }, rnd), st.at(bar, k * 0.25), { db: accent ? -13 : -17, pan: (k % 2 ? 0.35 : -0.35), send: 0.3, direct: 1, loose: 3 });
    });
    for (let k = 0; k < 8; k++) st.put(frameDrum({ vel: 0.55, pitch: 1.05 + (k % 2) * 0.12 }, rnd), st.at(bar, k * 0.5 + 0.25), { db: -17, send: 0.25, pan: k % 2 ? 0.3 : -0.3, loose: 3 });
    for (let k = 0; k < 16; k++) st.put(tick({ pitch: 1.4 }, rnd), st.at(bar, k * 0.25), { db: -29, send: 0.1, pan: 0.4 });
    // the double drum: a second voice an octave under the first, on the pushed eighths
    st.put(taiko({ size: 2.2, vel: 0.9 }, rnd), st.at(bar, 1.5), { db: -7, send: 0.4, direct: 0.9 });
    st.put(taiko({ size: 2.2, vel: 0.8 }, rnd), st.at(bar, 3.5), { db: -8, send: 0.4, direct: 0.9 });
    // strings that tremble on one note
    st.put(bowed(hz(notes[2] as string) * 2, 60 / BPM * 4 + 0.3, { attack: 0.2, release: 0.5, bright: 1.6, vibratoCents: 40, rasp: 0.12 }, rnd), st.at(bar), { db: -17, pan: 0.2, send: 0.4, loose: 10 });
    st.put(sub(hz(root) / 1, 4 * st.beatSec + 0.3, { attack: 0.05, release: 0.4, warmth: 0.5 }), st.at(bar), { db: -10, send: 0.1 });
  }
  for (const bar of [2, 6, 10, 14]) st.put(riser(1.6, { from: 400, to: 6500, tone: 0.2, level: 0.8 }, rnd), st.at(bar, 2) - 0.0, { db: -17, send: 0.4 });
  return master(st.render(room(2.0, { damp: 0.6, size: 1.1 }), { wetDb: -1, lowCutHz: 40 }), -23, -1.5);
}

export const WARDEN: TrackRecipe = {
  id: 'warden',
  group: 'music.warden',
  bpm: BPM,
  bars: BARS,
  mono: ['drive'],
  render: (rnd) => ({ base: base(rnd), drive: drive(rnd) }),
  note: 'the fight with the Ink Warden — it marches: taiko in a pattern that never quite lands where it is expected, a bowed bass grinding in eighths, a choir striking the downbeat, a bronze bell at the top of every fourth bar, on Dm · B♭ · Gm · A · E♭. Drive layer: sixteenths in the high strings, ticks, a double drum, tremolo',
};
