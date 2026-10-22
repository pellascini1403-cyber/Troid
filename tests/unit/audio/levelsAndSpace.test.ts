import { describe, expect, it } from 'vitest';
import { Levels } from '@/audio/levels';
import { renderImpulse, type RoomSpec } from '@/audio/reverb';
import { centsToRate, dbToGain, FAR, FLOOR, NEAR, PAN_LIMIT, spatialOf } from '@/audio/spatial';
import { AUDIO_CATEGORIES, categoryOfBus, DEFAULT_AUDIO_LEVELS } from '@/presentation/audioMix';

describe('Levels: the four volumes the player chooses', () => {
  it('start at the defaults, and the music sits under the effects', () => {
    const l = new Levels();
    expect(l.snapshot()).toEqual(DEFAULT_AUDIO_LEVELS);
    expect(DEFAULT_AUDIO_LEVELS.music).toBeLessThan(DEFAULT_AUDIO_LEVELS.sfx);
    expect(DEFAULT_AUDIO_LEVELS.ambience).toBeLessThan(DEFAULT_AUDIO_LEVELS.sfx);
  });

  it('are clamped to 0 … 1 and a value that is not a number is refused', () => {
    const l = new Levels();
    expect(l.set('music', 3)).toBe(true);
    expect(l.level('music')).toBe(1);
    expect(l.set('music', -2)).toBe(true);
    expect(l.level('music')).toBe(0);
    expect(l.set('music', Number.NaN)).toBe(false);
    expect(l.set('music', Number.POSITIVE_INFINITY)).toBe(false);
    expect(l.level('music')).toBe(0);
    expect(new Levels({ sfx: 7, music: Number.NaN }).snapshot()).toEqual({ ...DEFAULT_AUDIO_LEVELS, sfx: 1 });
  });

  it('turn a level into an amplitude on a curve (the square), so that the same step is the same change at every volume', () => {
    const l = new Levels({ master: 0.5, music: 1, sfx: 0.5, ambience: 0 });
    expect(l.gain('master')).toBeCloseTo(0.25, 10);
    expect(l.gain('sfx')).toBeCloseTo(0.25, 10);
    expect(l.effective('sfx')).toBeCloseTo(0.0625, 10);
    expect(l.gain('ambience')).toBe(0);
  });

  it('say a category is silent when its own level or the general one is zero — and nothing else', () => {
    const l = new Levels({ master: 0.8, music: 0, sfx: 0.9, ambience: 0.8 });
    expect(l.audible('music')).toBe(false);
    expect(l.audible('sfx')).toBe(true);
    l.set('music', 0.4);
    expect(l.audible('music')).toBe(true);
    l.set('master', 0);
    for (const c of ['music', 'sfx', 'ambience'] as const) expect(l.audible(c)).toBe(false);
  });

  it('tell the listener which category moved and to what, once per change, and stop when told to', () => {
    const l = new Levels();
    const seen: Array<[string, number]> = [];
    const off = l.onChange((c, v) => seen.push([c, v]));
    l.set('sfx', 0.2);
    l.set('sfx', 0.2); // no change: not announced
    l.setAll({ music: 0.1, ambience: 0.3 });
    off();
    l.set('master', 0.1);
    expect(seen).toEqual([['sfx', 0.2], ['music', 0.1], ['ambience', 0.3]]);
  });

  it('send the interface to the effects\' volume and every other bus to its own', () => {
    expect(categoryOfBus('ui')).toBe('sfx');
    expect(categoryOfBus('sfx')).toBe('sfx');
    expect(categoryOfBus('music')).toBe('music');
    expect(categoryOfBus('ambience')).toBe('ambience');
    expect(AUDIO_CATEGORIES).toEqual(['master', 'music', 'sfx', 'ambience']);
  });
});

describe('spatialOf: where a sound is heard from', () => {
  it('puts what happens at the hero in the middle at full strength', () => {
    expect(spatialOf(0, 0)).toEqual({ pan: 0, gain: 1 });
  });

  it('pans toward the side the sound is on, never to the very edge', () => {
    expect(spatialOf(6, 0).pan).toBeGreaterThan(0);
    expect(spatialOf(-6, 0).pan).toBeLessThan(0);
    expect(spatialOf(500, 0).pan).toBe(PAN_LIMIT);
    expect(spatialOf(-500, 0).pan).toBe(-PAN_LIMIT);
  });

  it('keeps everything on the screen at full strength and fades what is beyond it, never below the floor', () => {
    expect(spatialOf(NEAR, 0).gain).toBe(1);
    let previous = 1;
    for (let d = NEAR; d <= FAR + 20; d += 1) {
      const g = spatialOf(d, 0).gain;
      expect(g).toBeLessThanOrEqual(previous + 1e-12);
      expect(g).toBeGreaterThanOrEqual(FLOOR);
      previous = g;
    }
    expect(spatialOf(FAR * 3, 0).gain).toBe(FLOOR);
  });

  it('counts the height as distance and survives numbers that are not numbers', () => {
    expect(spatialOf(0, 30).gain).toBeLessThan(1);
    expect(spatialOf(Number.NaN, 3)).toEqual({ pan: 0, gain: 1 });
  });

  it('converts decibels and cents the usual way', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6.0206)).toBeCloseTo(0.5, 3);
    expect(centsToRate(1200)).toBeCloseTo(2, 10);
    expect(centsToRate(-1200)).toBeCloseTo(0.5, 10);
    expect(centsToRate(0)).toBe(1);
  });
});

describe('renderImpulse: the echo of a room', () => {
  const spec: RoomSpec = { rt60: 1.4, damp: 0.5, predelayMs: 12, wet: 0.4 };
  const seeded = (seed: number) => {
    let s = seed;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
  const energy = (a: Float32Array, from: number, to: number): number => {
    let e = 0;
    for (let i = from; i < to; i++) e += (a[i] as number) ** 2;
    return e;
  };

  it('is the same for the same room and the same random source', () => {
    const a = renderImpulse(spec, 48000, seeded(7));
    const b = renderImpulse(spec, 48000, seeded(7));
    expect(Array.from(a[0].slice(0, 2000))).toEqual(Array.from(b[0].slice(0, 2000)));
    expect(a[0].length).toBe(b[0].length);
  });

  it('lasts as long as the room says (a little longer, so that the tail is gone when it ends) and never beyond the limit', () => {
    const [l] = renderImpulse(spec, 48000, seeded(1));
    expect(l.length / 48000).toBeCloseTo(spec.rt60 * 1.15, 1);
    const [huge] = renderImpulse({ ...spec, rt60: 30 }, 48000, seeded(1));
    expect(huge.length / 48000).toBeLessThan(3.5);
  });

  it('has unit energy, so that the same wet level is the same loudness in every room', () => {
    for (const rt60 of [0.5, 1.4, 2.6]) {
      const [l, r] = renderImpulse({ ...spec, rt60 }, 48000, seeded(3));
      expect((energy(l, 0, l.length) + energy(r, 0, r.length)) / 2).toBeCloseTo(1, 6);
    }
  });

  it('dies away: the last tenth holds a tiny fraction of the energy of the first tenth', () => {
    const [l] = renderImpulse(spec, 48000, seeded(5));
    const tenth = Math.floor(l.length / 10);
    expect(energy(l, l.length - tenth, l.length)).toBeLessThan(energy(l, 0, tenth) * 1e-3);
  });

  it('is silent before the first reflection and different in the two ears', () => {
    const [l, r] = renderImpulse(spec, 48000, seeded(9));
    const pre = Math.round(0.012 * 48000);
    expect(energy(l, 0, pre)).toBe(0);
    expect(Array.from(l.slice(pre, pre + 500))).not.toEqual(Array.from(r.slice(pre, pre + 500)));
  });

  it('has no sample that is not a number and none that goes beyond ±1.5 after normalising', () => {
    const [l, r] = renderImpulse({ rt60: 0.2, damp: 1, predelayMs: 0, wet: 1 }, 44100, seeded(11));
    for (const ch of [l, r]) for (const v of ch) { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v)).toBeLessThan(40); }
  });

  it('a duller room has less of the high end in its tail than a bright one', () => {
    const highShare = (damp: number): number => {
      const [l] = renderImpulse({ ...spec, damp }, 48000, seeded(13));
      let diff = 0;
      let total = 0;
      for (let i = 1; i < l.length; i++) {
        diff += ((l[i] as number) - (l[i - 1] as number)) ** 2;
        total += (l[i] as number) ** 2;
      }
      return diff / total;
    };
    expect(highShare(1)).toBeLessThan(highShare(0));
  });
});
