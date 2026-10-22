import { describe, expect, it } from 'vitest';
import { gainOf } from '@/audio/volume';

/**
 * The curve from a level to an amplitude (docs/PROMPT6-LOG.md S30, docs/PROMPT18-LOG.md). The levels — clamped, announced — are `Levels`, tested with the engine's other pieces in levelsAndSpace.test.ts.
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
