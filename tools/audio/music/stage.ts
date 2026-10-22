import { buf, dbToLin, mixInto, normalizePeak, pan, removeDc, SR, secs, stereo, type Buf, type Stereo } from '../dsp/core';
import { dcBlock, highpass } from '../dsp/filter';
import { limit, reverb, type ReverbOptions } from '../dsp/fx';
import { integratedLufs } from '../dsp/measure';

/**
 * THE STAGE OF A PIECE (docs/PROMPT18-LOG.md): a loop of `bars` bars at `bpm`, to which instruments are added at beats, and which comes out as a stereo buffer that CLOSES ON ITSELF — the last sample is followed by the
 * first with no seam, no click and no gap, because of how it is made:
 *
 *  1. everything is rendered on a buffer longer than the loop, so that a note that rings past the end keeps ringing;
 *  2. what is beyond the end is added back at the START (a note that began near the end goes on at the beginning of the next round, as it would if the loop were a circle);
 *  3. the reverberation of the whole is made of that folded loop, and ITS tail is folded back too.
 *
 * What the listener hears at the seam is then what they would hear in the middle of a piece that never began and never ends.
 *
 * Each sound goes to the stage with a level (dB), a place in the stereo field, how much of it is sent to the room and how loosely in time it is played (the little random offset, a few milliseconds, that makes a score played
 * by a program sound like a score played by people).
 */
export interface PutOptions {
  /** Level, dB. */
  db?: number;
  /** −1 … 1. */
  pan?: number;
  /** How much of it goes to the room (0 … 1.5); the rest is the direct sound. Default 0.5. */
  send?: number;
  /** The direct sound's level, 0 … 1 (default 1): 0 sends the sound to the room alone. */
  direct?: number;
  /** A random offset in time, ± this many milliseconds. Default 0. */
  loose?: number;
}

export class Stage {
  readonly bars: number;
  /** Length of the loop (samples), and of one beat. */
  readonly n: number;
  readonly beatSec: number;
  private readonly overhang: number;
  private readonly dry: Stereo;
  private readonly wet: Stereo;
  private puts = 0;

  constructor(
    readonly bpm: number,
    bars: number,
    private readonly rnd: () => number,
    readonly beatsPerBar = 4,
    overhangSec = 14,
  ) {
    this.bars = bars;
    this.beatSec = 60 / bpm;
    this.n = Math.round(bars * beatsPerBar * this.beatSec * SR);
    this.overhang = secs(overhangSec);
    this.dry = stereo(this.n + this.overhang);
    this.wet = stereo(this.n + this.overhang);
  }

  get seconds(): number {
    return this.n / SR;
  }

  /** Beats in the whole loop. */
  get beats(): number {
    return this.bars * this.beatsPerBar;
  }

  /** The start of bar `bar` (0-based) plus `beat` beats, in beats. */
  at(bar: number, beat = 0): number {
    return bar * this.beatsPerBar + beat;
  }

  /** Puts a mono sound at `beat` (a note that starts after the end of the loop is dropped; one that rings beyond it is folded back). */
  put(sound: Buf, beat: number, o: PutOptions = {}): void {
    const jitter = o.loose ? (this.rnd() * 2 - 1) * (o.loose / 1000) * SR : 0;
    const start = Math.round(beat * this.beatSec * SR + jitter);
    const gain = dbToLin(o.db ?? 0);
    const p = pan(sound, o.pan ?? 0);
    const direct = o.direct ?? 1;
    const send = o.send ?? 0.5;
    if (direct > 0) this.add(this.dry, p, start, gain * direct);
    if (send > 0) this.add(this.wet, p, start, gain * send);
    this.puts++;
  }

  /** The same for a sound that already has a stereo field. */
  putStereo(sound: Stereo, beat: number, o: PutOptions = {}): void {
    const jitter = o.loose ? (this.rnd() * 2 - 1) * (o.loose / 1000) * SR : 0;
    const start = Math.round(beat * this.beatSec * SR + jitter);
    const gain = dbToLin(o.db ?? 0);
    const direct = o.direct ?? 1;
    const send = o.send ?? 0.5;
    if (direct > 0) this.add(this.dry, sound, start, gain * direct);
    if (send > 0) this.add(this.wet, sound, start, gain * send);
    this.puts++;
  }

  private add(dst: Stereo, src: Stereo, start: number, gain: number): void {
    // a sound that begins before the loop (a negative start from the jitter on beat 0) wraps to its end: the loop is a circle
    const place = start < 0 ? start + this.n : start;
    mixInto(dst.l, src.l, place, gain);
    mixInto(dst.r, src.r, place, gain);
  }

  /** Folds what is beyond the end of the loop back onto its start. */
  private fold(s: Stereo, length = this.n): Stereo {
    const out = stereo(length);
    for (const ch of ['l', 'r'] as const) {
      const src = s[ch];
      const dst = out[ch];
      for (let i = 0; i < src.length; i++) dst[i % length] = (dst[i % length] as number) + (src[i] as number);
    }
    return out;
  }

  /**
   * The finished loop: the direct sound and the room, folded. `room` is the reverberation of the sends; `wetDb` is how much of it is mixed in; `lowCut` takes the mud out of the direct sound's bottom end (Hz, 0: none —
   * a sub-bass is meant to be there).
   */
  render(room: ReverbOptions, o: { wetDb?: number; lowCutHz?: number } = {}): Stereo {
    const dry = this.fold(this.dry);
    const send = this.fold(this.wet);
    const tail = secs(room.tailSec ?? room.rt60 * 1.3);
    const verb = reverb(send, { ...room, wet: 1, dry: 0, tailSec: tail / SR, loopSec: this.seconds });
    const wet = this.fold(verb, this.n);
    const g = dbToLin(o.wetDb ?? 0);
    const out = stereo(this.n);
    for (let i = 0; i < this.n; i++) {
      out.l[i] = (dry.l[i] as number) + (wet.l[i] as number) * g;
      out.r[i] = (dry.r[i] as number) + (wet.r[i] as number) * g;
    }
    // the filters run round the circle: each starts in the state the end of the loop leaves it in, so that the seam is no more a seam to them than to the music
    for (const c of [out.l, out.r]) {
      c.set(circular(c, dcBlock));
      if (o.lowCutHz) c.set(circular(c, (b) => highpass(b, o.lowCutHz as number)));
    }
    return out;
  }
}

/** Runs `process` over three rounds of a loop and keeps the middle one: a filter or a limiter then enters the loop in the state the previous round left it in, and the end of the loop runs into the beginning without a jump. */
export function circular(x: Buf, process: (b: Buf) => Buf): Buf {
  const n = x.length;
  const t = new Float32Array(3 * n);
  t.set(x, 0);
  t.set(x, n);
  t.set(x, 2 * n);
  return Float32Array.from(process(t).subarray(n, 2 * n));
}

/**
 * Sets the level of a loop by its loudness (integrated LUFS) and holds its peaks below `ceilingDb`. The limiter is the same lookahead one the sound effects use; it works in one pass through the buffer, and a loop whose
 * peaks are below the ceiling is not touched by it, so the seam stays as the stage made it.
 */
export function master(s: Stereo, targetLufs: number, ceilingDb = -1.5): Stereo {
  const g = dbToLin(targetLufs - integratedLufs(s));
  for (const c of [s.l, s.r]) for (let i = 0; i < c.length; i++) c[i] = (c[i] as number) * g;
  // the limiter, too, runs round the circle (a peak near the seam is held down on both sides of it)
  const n = s.l.length;
  const three = stereo(3 * n);
  for (const ch of ['l', 'r'] as const) for (let k = 0; k < 3; k++) three[ch].set(s[ch], k * n);
  limit(three, ceilingDb, 5, 160);
  for (const ch of ['l', 'r'] as const) s[ch].set(three[ch].subarray(n, 2 * n));
  return s;
}

/**
 * Makes a noise-like texture into a loop: the last `xfSec` seconds are crossfaded (equal power) into the first, and dropped, so that the end of the loop is the sample before the start of what was the tail — the loop
 * closes on itself with no click and no change of level, which a plain cut of noise cannot do.
 */
export function crossfadeLoop(x: Buf, xfSec: number): Buf {
  const xf = secs(xfSec);
  const L = x.length - xf;
  if (L <= xf) throw new Error('the texture is too short for its crossfade');
  const out = Float32Array.from(x.subarray(0, L));
  for (let i = 0; i < xf; i++) {
    const t = (i / xf) * (Math.PI / 2);
    out[i] = (x[i] as number) * Math.sin(t) + (x[L + i] as number) * Math.cos(t);
  }
  removeDc(out);
  return out;
}

/** `crossfadeLoop` on both channels of a stereo texture. */
export function crossfadeStereo(s: Stereo, xfSec: number): Stereo {
  return { l: crossfadeLoop(s.l, xfSec), r: crossfadeLoop(s.r, xfSec) };
}

/** A silent buffer. */
export const silent = (n: number): Buf => buf(n);

/** Normalises a one-off stinger to a peak (re-exported so a recipe imports one place). */
export { normalizePeak };
