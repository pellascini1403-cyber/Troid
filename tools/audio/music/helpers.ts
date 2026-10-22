import { hz, type Buf } from '../dsp/core';
import { bell, bowed, choir, fmBell, pad, pluck, sub } from '../dsp/inst';
import type { ReverbOptions } from '../dsp/fx';
import type { Stage } from './stage';

/**
 * THE MUSICIAN'S HELPERS (docs/PROMPT18-LOG.md): what a score does again and again — a chord of pad voices under a bar, a bass note, a figure of plucked notes, a melody of bells — written once, so that each piece reads as
 * its music (the chords, the melody, the rhythm) and not as the plumbing of the synthesis.
 */
export type Rnd = () => number;

/** One chord of a piece: where it starts (bar), how long it lasts (bars), what the pad plays, the bass note, and the notes of its figure. */
export interface Chord {
  bar: number;
  bars: number;
  pad: readonly string[];
  bass: string;
  arp?: readonly string[];
}

/** A note of a melody: when (in beats from the start of the loop), which, how long it rings (s) and how strongly (dB). */
export interface Note {
  at: number;
  note: string;
  ring?: number;
  db?: number;
}

const PANS = [-0.5, -0.18, 0.2, 0.55, -0.3, 0.35] as const;

/** The pad of a chord, one voice for each note, each a little apart in the stereo field; it lasts the chord and a little over, so that one chord is already there when the last ends. */
export function pads(st: Stage, rnd: Rnd, chords: readonly Chord[], o: { db?: number; attack?: number; release?: number; voices?: number; cutoff?: number; send?: number; direct?: number; lift?: number } = {}): void {
  for (const c of chords) {
    const dur = c.bars * st.beatsPerBar * st.beatSec + (o.release ?? 1.8) * 0.6;
    c.pad.forEach((note, k) => {
      const voice = pad(hz(note), dur, { attack: o.attack ?? 1.4, release: o.release ?? 1.8, voices: o.voices ?? 3, cutoff: o.cutoff, sub: 0.15 }, rnd);
      st.put(voice, st.at(c.bar), { db: (o.db ?? -10) - (o.lift ?? 0) * (k === c.pad.length - 1 ? 1 : 0), pan: PANS[k % PANS.length], send: o.send ?? 0.7, direct: o.direct ?? 0.6, loose: 30 });
    });
  }
}

/** The bass of each chord: a low sine that holds the root for the chord and a little over. */
export function basses(st: Stage, chords: readonly Chord[], o: { db?: number; warmth?: number; send?: number } = {}): void {
  for (const c of chords) {
    const dur = c.bars * st.beatsPerBar * st.beatSec + 0.8;
    st.put(sub(hz(c.bass), dur, { attack: 0.9, release: 1.1, warmth: o.warmth ?? 0.3 }), st.at(c.bar), { db: o.db ?? -9, send: o.send ?? 0.15, pan: 0 });
  }
}

/** A long bowed note under each chord (a cello playing the root an octave above the bass, or a voice of the pad). */
export function strings(st: Stage, rnd: Rnd, chords: readonly Chord[], note: (c: Chord) => string, o: { db?: number; attack?: number; send?: number; vibrato?: number; bright?: number } = {}): void {
  for (const c of chords) {
    const dur = c.bars * st.beatsPerBar * st.beatSec + 0.9;
    st.put(bowed(hz(note(c)), dur, { attack: o.attack ?? 0.7, release: 1.2, vibratoCents: o.vibrato ?? 16, bright: o.bright ?? 0.8, rasp: 0.04 }, rnd), st.at(c.bar), { db: o.db ?? -12, pan: -0.25, send: o.send ?? 0.5, loose: 25 });
  }
}

/** A melody of bells. */
export function bells(st: Stage, rnd: Rnd, notes: readonly Note[], o: { kind?: 'glass' | 'bronze' | 'chime' | 'fm'; db?: number; send?: number; direct?: number; pan?: number; bright?: number } = {}): void {
  notes.forEach((n, k) => {
    const ring = n.ring ?? 3.2;
    const f = hz(n.note);
    const sound: Buf = o.kind === 'fm' ? fmBell(f, ring, { ratio: 3.5, index: 2.4, decaySec: ring * 0.6, indexDecaySec: 0.35 }, rnd) : bell(f, ring, { kind: o.kind ?? 'glass', decaySec: ring * 0.7, bright: o.bright ?? 1, click: 0.05 }, rnd);
    st.put(sound, n.at, { db: (o.db ?? -11) + (n.db ?? 0), pan: (o.pan ?? 0) + (k % 2 === 0 ? -0.25 : 0.25), send: o.send ?? 0.9, direct: o.direct ?? 0.55, loose: 22 });
  });
}

/** A figure of plucked notes: the notes of the chord, in a pattern of beats (each is a note index, wrapping, and a time in beats inside the chord's span). */
export function plucks(st: Stage, rnd: Rnd, chords: readonly Chord[], pattern: ReadonlyArray<readonly [beat: number, index: number, db?: number]>, o: { db?: number; ring?: number; bright?: number; send?: number; pan?: number } = {}): void {
  for (const c of chords) {
    if (!c.arp) continue;
    for (const [beat, idx, db] of pattern) {
      if (beat >= c.bars * st.beatsPerBar) continue;
      const note = c.arp[idx % c.arp.length] as string;
      st.put(pluck(hz(note), (o.ring ?? 2.2) + 0.3, { ringSec: o.ring ?? 2.2, bright: o.bright ?? 0.42 }, rnd), st.at(c.bar) + beat, { db: (o.db ?? -17) + (db ?? 0), pan: (o.pan ?? 0) + ((idx * 0.37) % 1) * 0.9 - 0.45, send: o.send ?? 0.7, direct: 0.7, loose: 12 });
    }
  }
}

/** A held voice (a choir on a vowel) under a span of bars. */
export function voices(st: Stage, rnd: Rnd, bar: number, bars: number, notes: readonly string[], vowel: 'a' | 'o' | 'u' | 'e' | 'm', o: { db?: number; attack?: number; release?: number; send?: number } = {}): void {
  const dur = bars * st.beatsPerBar * st.beatSec + (o.release ?? 1.8) * 0.5;
  notes.forEach((note, k) => {
    st.put(choir(hz(note), dur, vowel, { attack: o.attack ?? 1.6, release: o.release ?? 1.8 }, rnd), st.at(bar), { db: (o.db ?? -12) - k * 0.8, pan: PANS[(k + 2) % PANS.length], send: o.send ?? 0.8, direct: 0.55, loose: 35 });
  });
}

/** The room a piece is played in (reverberation of the sends). */
export const room = (rt60: number, o: Partial<ReverbOptions> = {}): ReverbOptions => ({ rt60, size: 1.5, damp: 0.5, predelayMs: 26, modDepthMs: 0.5, modRateHz: 0.3, lowCutHz: 130, ...o });
