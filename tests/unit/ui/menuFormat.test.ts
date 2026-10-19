import { describe, expect, it } from 'vitest';
import { formatClock, formatSavedAt } from '@/ui/settings/menuFormat';

describe('the clock of the time played', () => {
  it('is minutes and seconds, then hours: 60 simulation ticks are a second', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59)).toBe('0:00');
    expect(formatClock(60)).toBe('0:01');
    expect(formatClock(60 * 59 + 59)).toBe('0:59');
    expect(formatClock(60 * 60)).toBe('1:00');
    expect(formatClock(60 * 60 * 23 + 60 * 45)).toBe('23:45');
    expect(formatClock(60 * 3600)).toBe('1:00:00');
    expect(formatClock(60 * (3600 * 12 + 60 * 3 + 7))).toBe('12:03:07');
  });

  it('never goes negative or fractional, and what is not a number is nothing played', () => {
    expect(formatClock(-100)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatClock(90.9)).toBe('0:01');
  });
});

describe('the moment of a save', () => {
  it('is written by the platform in the language in force', () => {
    const t = Date.UTC(2026, 9, 19, 20, 15);
    expect(formatSavedAt(t, 'en')).toMatch(/2026/);
    expect(formatSavedAt(t, 'es')).toMatch(/2026/);
    expect(formatSavedAt(t, 'en')).not.toBe(formatSavedAt(t, 'es'));
  });

  it('is empty when it is not known: 0, negative, not a number', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatSavedAt(bad, 'es')).toBe('');
  });

  it('a locale the engine does not know does not throw', () => {
    expect(() => formatSavedAt(1_760_000_000_000, 'not-a-locale-at-all-!!')).not.toThrow();
  });
});
