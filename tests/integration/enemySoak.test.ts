import { describe, expect, it } from 'vitest';
import { enemySoak, type EnemySoakCase, type EnemySoakResult } from '../helpers/enemySoak';

/**
 * SOAK OF THE ENEMIES AND THE GUARDIAN (docs/PROMPT20-LOG.md): random play against the real Ink Slimes of R1 and R2, the Ink Warden of R4 and a pit, with what an enemy can NEVER do checked after every tick
 * (`tests/helpers/enemySoak.ts`). Six fixed seeds of 5000 ticks per case are the regression run; a deeper hunt is one environment variable away:
 * `SOAK_SEEDS=60 SOAK_TICKS=20000 npx vitest run tests/integration/enemySoak.test.ts`.
 */
const SEEDS = Array.from({ length: Math.max(6, Number(process.env['SOAK_SEEDS'] ?? 6)) }, (_, i) => [1, 2, 3, 7, 42, 2024][i] ?? 500 + i * 7919);
const TICKS = Math.max(1500, Number(process.env['SOAK_TICKS'] ?? 5000));
const WORLD_FLAGS = ['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'taken:card_spirit_bolt'];

const CASES: Array<{ name: string; c: EnemySoakCase }> = [
  { name: 'the slime of R1, a hero that cannot fall', c: { room: 'r1_gate', god: true, heroAt: 90 } },
  { name: 'the slime of R1, a hero that can', c: { room: 'r1_gate', god: false, heroAt: 90 } },
  { name: 'the slime of R2', c: { room: 'r2_hall', entry: 'east', god: true, flags: ['defeated:r1_slime'] } },
  { name: 'the Ink Warden of R4, a hero that cannot fall', c: { room: 'r4_sanctum', entry: 'rest', god: true, flags: WORLD_FLAGS } },
  { name: 'the Ink Warden of R4, a hero that can', c: { room: 'r4_sanctum', entry: 'rest', god: false, flags: WORLD_FLAGS } },
  { name: 'a slime at the edge of a pit with no floor', c: { room: 'pit_arena', entry: 'start', god: true } },
  { name: 'a slime at the edge of a pit with no floor, a hero that can fall', c: { room: 'pit_arena', entry: 'start', god: false } },
];

describe('soak: random play against the enemies', () => {
  const results = new Map<string, EnemySoakResult[]>(CASES.map(({ name, c }) => [name, SEEDS.map((seed) => enemySoak(c, seed, TICKS))]));

  for (const { name } of CASES) {
    it(`${name}: no enemy leaves the world, sinks into a wall, overstays a state, hurts without a blow, or dies twice`, () => {
      expect(results.get(name)!.flatMap((r) => r.violations)).toEqual([]);
    });
  }

  it('is deterministic: the same seed leaves the same simulation, bit for bit, every 50 ticks', () => {
    for (const { name, c } of [CASES[0]!, CASES[4]!, CASES[5]!]) {
      const again = enemySoak(c, SEEDS[0]!, TICKS);
      expect(again.digests, name).toEqual(results.get(name)![0]!.digests);
      expect(again.digests.length).toBe(Math.floor(TICKS / 50));
    }
  });

  it('really plays: blows land, slimes wind up and lunge, the guardian strikes, turns and falls, heroes fall, and every state is visited', () => {
    const all = [...results.values()].flat();
    const sum = (f: (r: EnemySoakResult) => number): number => all.reduce((n, r) => n + f(r), 0);
    expect(sum((r) => r.totals.ticks)).toBe(CASES.length * SEEDS.length * TICKS);
    expect(sum((r) => r.totals.blows)).toBeGreaterThan(300);
    expect(sum((r) => r.totals.enemyAttacks)).toBeGreaterThan(80);
    expect(sum((r) => r.totals.guardianAttacks)).toBeGreaterThan(20);
    expect(sum((r) => r.totals.guardianPhases)).toBeGreaterThan(0);
    expect(sum((r) => r.totals.bossFalls)).toBeGreaterThan(0);
    expect(sum((r) => r.totals.kills)).toBeGreaterThan(10);
    expect(sum((r) => r.totals.heroDeaths)).toBeGreaterThan(5);
    const states = new Set(all.flatMap((r) => [...r.totals.states]));
    for (const st of ['idle', 'patrol', 'detect', 'approach', 'telegraph', 'attack', 'recover', 'hurt', 'dead']) expect(states.has(`enemy:${st}`), `the slime was in "${st}"`).toBe(true);
    for (const st of ['dormant', 'intro', 'choose', 'telegraph', 'attack', 'recover', 'hurt', 'dead']) expect(states.has(`guardian:${st}`), `the guardian was in "${st}"`).toBe(true);
  });
});
