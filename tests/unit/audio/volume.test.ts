import { describe, expect, it } from 'vitest';
import { gainOf, MasterVolume } from '@/audio/volume';

/**
 * The master volume, prepared (docs/PROMPT6-LOG.md S30): the game has no sound yet, but the level a player chooses is real — clamped, announced,
 * and turned into the amplitude a later audio engine will put on its master gain.
 */
describe('the gain of a level', () => {
  it('silence is 0, full is 1, and in between it is a curve (the same step sounds the same at any volume)', () => {
    expect(gainOf(0)).toBe(0);
    expect(gainOf(1)).toBe(1);
    expect(gainOf(0.5)).toBe(0.25);
    expect(gainOf(0.8)).toBeCloseTo(0.64, 12);
  });

  it('never decreases as the level rises, and never leaves 0–1, whatever it is given', () => {
    let last = -1;
    for (let l = 0; l <= 1.0001; l += 0.01) {
      const g = gainOf(l);
      expect(g).toBeGreaterThanOrEqual(last);
      last = g;
    }
    expect(gainOf(7)).toBe(1);
    expect(gainOf(-3)).toBe(0);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(gainOf(bad), String(bad)).toBe(0);
  });
});

describe('MasterVolume', () => {
  it('starts at the level it is given (full by default), clamped', () => {
    expect(new MasterVolume().level).toBe(1);
    expect(new MasterVolume(0.35).level).toBe(0.35);
    expect(new MasterVolume(9).level).toBe(1);
    expect(new MasterVolume(-1).level).toBe(0);
    expect(new MasterVolume(Number.NaN).level, 'a broken value is the default, not silence').toBe(1);
  });

  it('`gain` is the amplitude of the level', () => {
    const v = new MasterVolume(0.5);
    expect(v.gain).toBe(0.25);
    v.set(1);
    expect(v.gain).toBe(1);
    v.set(0);
    expect(v.gain).toBe(0);
  });

  it('a change is announced once, with the new level; the same level again announces nothing', () => {
    const v = new MasterVolume(0.8);
    const seen: number[] = [];
    v.changed.subscribe((l) => void seen.push(l));
    expect(v.set(0.4)).toBe(true);
    expect(v.set(0.4)).toBe(false);
    expect(v.set(2)).toBe(true);
    expect(v.set(1)).toBe(false); // 2 was clamped to 1
    expect(seen).toEqual([0.4, 1]);
  });

  it('a value that is not a number is ignored: the level is never broken', () => {
    const v = new MasterVolume(0.6);
    expect(v.set(Number.NaN)).toBe(false);
    expect(v.set(Number.POSITIVE_INFINITY)).toBe(false);
    expect(v.level).toBe(0.6);
  });
});
