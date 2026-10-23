import { describe, expect, it } from 'vitest';
import { CREDITS_ROLL, rollOffset } from '@/ui/settings/creditsRoll';

/** Where the credits are, given how long they have been rolling: still for a moment, then a steady pace, never past the end. */
const roll = { delayMs: 1000, speed: 20, max: 300 };

describe('the roll of the credits', () => {
  it('stands still during the delay', () => {
    expect(rollOffset(0, roll)).toBe(0);
    expect(rollOffset(999, roll)).toBe(0);
    expect(rollOffset(1000, roll)).toBe(0);
  });

  it('then moves at the pace it was given, in pixels per second', () => {
    expect(rollOffset(2000, roll)).toBeCloseTo(20, 9);
    expect(rollOffset(3500, roll)).toBeCloseTo(50, 9);
  });

  it('never goes past the end of the credits', () => {
    expect(rollOffset(1000 + 15_000, roll)).toBe(300);
    expect(rollOffset(1_000_000, roll)).toBe(300);
  });

  it('has nowhere to go when the credits fit, and survives numbers that are not numbers', () => {
    expect(rollOffset(60_000, { ...roll, max: 0 })).toBe(0);
    expect(rollOffset(60_000, { ...roll, max: -5 })).toBe(0);
    expect(rollOffset(Number.NaN, roll)).toBe(0);
    expect(rollOffset(-50, roll)).toBe(0);
  });

  it('is a walking pace after a moment of calm: the real numbers are not zero and not hurried', () => {
    expect(CREDITS_ROLL.delayMs).toBeGreaterThan(500);
    expect(CREDITS_ROLL.speed).toBeGreaterThan(10);
    expect(CREDITS_ROLL.speed).toBeLessThan(60);
  });
});
