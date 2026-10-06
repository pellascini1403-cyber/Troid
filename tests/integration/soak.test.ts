import { describe, expect, it } from 'vitest';
import { soak, type Totals } from '../helpers/soak';

/**
 * SOAK of the whole player layer (docs/PROMPT5-LOG.md S20): random play through the real session with every invariant of the HUD and
 * the rules checked after EVERY tick, and the same seed twice leaving the same simulation, bit for bit. The driver and the invariants
 * live in `tests/helpers/soak.ts` (the HUD soak reuses them).
 *
 * Eight fixed seeds of 6000 ticks (100 s of play each) are the regression run. A deeper hunt is one environment variable away:
 * `SOAK_SEEDS=300 SOAK_TICKS=20000 npx vitest run tests/integration/soak.test.ts`.
 */
const NAMED = [1, 2, 3, 7, 42, 99, 2024, 31337];
const SEEDS = Array.from({ length: Math.max(8, Number(process.env['SOAK_SEEDS'] ?? 8)) }, (_, i) => NAMED[i] ?? 1000 + i * 7919);
const TICKS = Math.max(600, Number(process.env['SOAK_TICKS'] ?? 6000));

describe('soak: random play through the whole player layer', () => {
  const results = SEEDS.map((seed) => soak(seed, TICKS));

  it('breaks no invariant, on any seed, on any tick', () => {
    expect(results.flatMap((r) => r.violations)).toEqual([]);
  });

  it('is deterministic: the same seed leaves the same simulation, bit for bit, every 50 ticks', () => {
    for (const [i, seed] of SEEDS.slice(0, 3).entries()) {
      const again = soak(seed, TICKS);
      expect(again.digests, `seed ${seed}`).toEqual(results[i]!.digests);
      expect(again.digests.length).toBe(Math.floor(TICKS / 50));
    }
  });

  it('really plays: casts, denials, drinks, interactions, deaths, room loads and several states, across the seeds', () => {
    const sum = (f: (t: Totals) => number): number => results.reduce((n, r) => n + f(r.totals), 0);
    expect(sum((x) => x.ticks)).toBe(SEEDS.length * TICKS);
    expect(sum((x) => x.casts)).toBeGreaterThan(40);
    expect(sum((x) => x.denied)).toBeGreaterThan(5);
    expect(sum((x) => x.drunk)).toBeGreaterThan(5);
    expect(sum((x) => x.refusedDrinks)).toBeGreaterThan(5);
    expect(sum((x) => x.performed)).toBeGreaterThan(5);
    expect(sum((x) => x.deaths)).toBeGreaterThan(5);
    expect(sum((x) => x.loads)).toBeGreaterThan(8);
    expect(sum((x) => x.hits)).toBeGreaterThan(40);
    expect(sum((x) => x.recharged)).toBeGreaterThan(1);
    const states = new Set(results.flatMap((r) => [...r.totals.states]));
    for (const st of ['free', 'crouch', 'dash', 'attack', 'cast', 'drink', 'interact', 'hurt', 'dead']) expect(states.has(st), `state "${st}" was reached`).toBe(true);
  });
});
