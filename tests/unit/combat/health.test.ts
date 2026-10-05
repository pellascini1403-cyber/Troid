import { describe, expect, it } from 'vitest';
import { Health } from '@/combat/Health';

describe('Health', () => {
  it('starts full and reports its fraction', () => {
    const h = new Health(5);
    expect(h.current).toBe(5);
    expect(h.max).toBe(5);
    expect(h.fraction).toBe(1);
    expect(h.dead).toBe(false);
  });

  it('damage returns what was really removed and never goes below zero', () => {
    const h = new Health(3);
    expect(h.damage(1)).toBe(1);
    expect(h.damage(10)).toBe(2);
    expect(h.current).toBe(0);
    expect(h.dead).toBe(true);
    expect(h.damage(1)).toBe(0); // the dead cannot lose more
  });

  it('ignores non-positive damage and healing', () => {
    const h = new Health(3);
    expect(h.damage(0)).toBe(0);
    expect(h.damage(-2)).toBe(0);
    expect(h.heal(0)).toBe(0);
    expect(h.current).toBe(3);
  });

  it('heal is capped at max and does not resurrect', () => {
    const h = new Health(5);
    h.damage(3);
    expect(h.heal(10)).toBe(3);
    expect(h.current).toBe(5);
    h.damage(5);
    expect(h.heal(2)).toBe(0);
    expect(h.dead).toBe(true);
  });

  it('setMax clamps the current value (or fills), and restore brings it back', () => {
    const h = new Health(5);
    h.setMax(3);
    expect(h.current).toBe(3);
    h.setMax(8);
    expect(h.current).toBe(3);
    h.setMax(8, true);
    expect(h.current).toBe(8);
    h.damage(8);
    h.restore();
    expect(h.current).toBe(8);
    expect(h.dead).toBe(false);
    h.setMax(0);
    expect(h.max).toBe(1); // never a zero-health body
  });
});
