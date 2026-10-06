import { describe, expect, it } from 'vitest';
import { Magic, type MagicChange } from '@/abilities/Magic';
import { MAGIC } from '@/content/resources';

/**
 * The magic bar (docs/GAME-SPEC-2D.md §10.1): 100 units, regenerating 6 per second after 1.0 s without spending, never
 * outside 0…100, exact costs, deterministic. It is an independent resource.
 */
function make(def = MAGIC) {
  const log: MagicChange[] = [];
  const m = new Magic(def, (c) => log.push(c));
  return { m, log };
}
const run = (m: Magic, ticks: number, blocked = false): void => {
  for (let i = 0; i < ticks; i++) m.tick(blocked);
};

describe('magic: size and limits', () => {
  it('starts full at 100 and says so', () => {
    const { m } = make();
    expect([m.current, m.max, m.fraction, m.full]).toEqual([100, 100, 1, true]);
  });

  it('spending removes exactly the cost and nothing else', () => {
    const { m, log } = make();
    expect(m.spend(30)).toBe(true);
    expect(m.current).toBe(70);
    expect(log).toEqual([{ current: 70, max: 100, delta: -30, reason: 'spend' }]);
  });

  it('three casts in a row (30 each) leave 10; a fourth is refused and changes nothing', () => {
    const { m, log } = make();
    for (let i = 0; i < 3; i++) expect(m.spend(30)).toBe(true);
    expect(m.current).toBe(10);
    expect(m.canSpend(30)).toBe(false);
    const events = log.length;
    expect(m.spend(30)).toBe(false);
    expect(m.current).toBe(10);
    expect(log).toHaveLength(events);
  });

  it('can spend exactly what is there (30 of 30), and not a hair less than the cost', () => {
    const { m } = make();
    m.set(30);
    expect(m.canSpend(30)).toBe(true);
    m.set(29.999);
    expect(m.canSpend(30)).toBe(false);
    m.set(30);
    expect(m.spend(30)).toBe(true);
    expect(m.current).toBe(0);
  });

  it('never goes below 0 or above 100, whatever it is told', () => {
    const { m } = make();
    m.set(-50);
    expect(m.current).toBe(0);
    m.set(1e9);
    expect(m.current).toBe(100);
    expect(m.spend(1000)).toBe(false);
    expect(m.spend(-5)).toBe(false); // a negative cost is not a refill
    expect(m.current).toBe(100);
  });

  it('a zero cost is free and silent', () => {
    const { m, log } = make();
    expect(m.spend(0)).toBe(true);
    expect(log).toEqual([]);
  });

  it('restore() fills it (coming back from a defeat) and announces it once', () => {
    const { m, log } = make();
    m.spend(60);
    log.length = 0;
    m.restore();
    expect(m.current).toBe(100);
    expect(log).toEqual([{ current: 100, max: 100, delta: 60, reason: 'restore' }]);
    m.restore();
    expect(log).toHaveLength(1); // already full: nothing to say
  });
});

describe('magic: regeneration (6 per second, after 1.0 s)', () => {
  it('waits a whole second after spending, then regains 6 units per second', () => {
    const { m } = make();
    m.spend(50);
    run(m, 60);
    expect(m.current).toBe(50); // the delay: nothing yet
    run(m, 60);
    expect(m.current).toBeCloseTo(56, 9);
    run(m, 60);
    expect(m.current).toBeCloseTo(62, 9);
  });

  it('is gradual: a tick regains a tenth of a unit, never a jump', () => {
    const { m } = make();
    m.spend(50);
    run(m, 60);
    run(m, 1);
    expect(m.current).toBeCloseTo(50.1, 9);
    run(m, 1);
    expect(m.current).toBeCloseTo(50.2, 9);
  });

  it('is exact: 600 ticks regain exactly 60.000 units, no drift from floating point', () => {
    const { m } = make();
    m.spend(70); // 30 left
    run(m, 60 + 600); // the delay, then ten seconds at 6 / s = 60 units
    expect(m.current).toBe(90);
  });

  it('a full refill from empty takes 100 / 6 s after the delay, and stops exactly at 100', () => {
    const { m } = make();
    m.set(0);
    m.spend(0); // restarts the delay without changing anything
    run(m, 60 + Math.ceil((100 / 6) * 60));
    expect(m.current).toBe(100);
    expect(m.full).toBe(true);
    run(m, 600);
    expect(m.current).toBe(100);
  });

  it('spending again restarts the delay: a bar that was refilling waits another second', () => {
    const { m } = make();
    m.spend(50);
    run(m, 60 + 30);
    const before = m.current;
    expect(before).toBeGreaterThan(50);
    m.spend(10);
    run(m, 59);
    expect(m.current).toBe(before - 10);
    run(m, 61);
    expect(m.current).toBeGreaterThan(before - 10);
  });

  it('does not regenerate while casting (blocked), and the delay starts when the cast is over', () => {
    const { m } = make();
    m.spend(30);
    run(m, 600, true); // ten seconds of casting: nothing happens, the delay does not run down
    expect(m.current).toBe(70);
    expect(m.delayLeft).toBe(60);
    run(m, 60);
    expect(m.current).toBe(70);
    run(m, 60);
    expect(m.current).toBeCloseTo(76, 9);
  });

  it('works with a rate that does not divide by 60 (the remainder is carried, not lost): 7 / s is 7.000 after 60 ticks', () => {
    const { m } = make({ max: 100, regenPerSecond: 7, regenDelaySeconds: 0 });
    m.set(0);
    run(m, 60);
    expect(m.current).toBe(7);
    run(m, 600);
    expect(m.current).toBe(77);
  });

  it('announces the regeneration about once per unit regained (≈ 6 events a second, not 60) and when it fills', () => {
    const { m, log } = make();
    m.spend(30); // 70 left
    log.length = 0;
    run(m, 60 + 120); // the delay, then two seconds: 12 units
    const regen = log.filter((c) => c.reason === 'regen');
    expect(regen.length).toBeGreaterThanOrEqual(10);
    expect(regen.length).toBeLessThanOrEqual(14);
    expect(regen[regen.length - 1]?.current).toBe(82);
    log.length = 0;
    run(m, 60 * 2);
    expect(log.at(-1)).toMatchObject({ current: 94, reason: 'regen' });
    log.length = 0;
    run(m, 60 * 2); // it fills at 100 and says so
    expect(log.at(-1)).toMatchObject({ current: 100, reason: 'regen' });
    expect(m.full).toBe(true);
  });

  it('reports when it is coming back (for the HUD glow)', () => {
    const { m } = make();
    expect(m.regenerating).toBe(false); // full
    m.spend(10);
    expect(m.regenerating).toBe(false); // in the delay
    run(m, 60);
    expect(m.regenerating).toBe(true);
    m.restore();
    expect(m.regenerating).toBe(false);
  });

  it('is deterministic: the same sequence gives the same bar, bit for bit', () => {
    const play = (): number[] => {
      const { m } = make();
      const out: number[] = [];
      for (let i = 0; i < 1500; i++) {
        if (i % 400 === 5) m.spend(30);
        m.tick(i % 400 > 5 && i % 400 < 20);
        out.push(m.current);
      }
      return out;
    };
    expect(play()).toEqual(play());
  });
});
