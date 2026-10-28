import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import { ENEMIES } from '@/content/enemies';
import { UPGRADES } from '@/content/upgrades';
import { Boss } from '@/enemies/boss/Boss';
import { Enemy } from '@/enemies/Enemy';
import { Brawler } from '../helpers/brawler';
import { BossFighter } from '../helpers/bossFight';
import { hall } from '../helpers/hall';
import { heldAt } from '../helpers/road';
import { driver } from '../helpers/sim';
import { FALLBACK, NAIVE, TACTICS } from '../helpers/tactics';

/**
 * THE ENCOUNTERS, WON BY A MORTAL HERO (docs/PROMPT22-LOG.md §4). Until Prompt 22 the proof that a creature or a guardian could be beaten was a hero who could not be hurt (`godMode`), or one who stood still, or a blow put into the boss by hand.
 * Here the hero is MORTAL — five points of life (more with the vessels of the road), three bottles — and plays with the inputs of a person (`brawler.ts`, `bossFight.ts`): it reads what the creature is doing (its state is the telegraph the
 * picture draws), answers it the way the content says it is answered (`tactics.ts`), and wins. What it cost is measured.
 *
 *  - the fourteen creatures, each one in the hall (the one place nothing else is going on), from three distances and with three seeds;
 *  - what a hero who does NOT read them pays: the same fights played by one who only walks up and swings;
 *  - the six guardians of the engine, each in its own arena, with what the hero has when it gets there (the abilities and vessels of the road before it), on four seeds.
 *
 * What it does NOT prove: that a person finds these fights fun or fair — only that a player who reads them wins, and what it costs a player who does not. The Ink Warden is proven in `bossWorld.test.ts` (twelve seeds).
 */
const CREATURE_IDS = [
  'ink_slime',
  'bramble_crawler',
  'mire_toad',
  'stoneback',
  'glow_spore',
  'ink_spitter',
  'cave_bat',
  'lantern_wisp',
  'bell_toller',
  'shardling',
  'piston_drone',
  'floor_leech',
  'ink_weaver',
  'veil_shade',
] as const;
const GAPS = [7, 10, 13];
const SEEDS = [1, 2, 3];
const heightOf = (id: string): number => {
  const a = ENEMIES[id]!.ai.archetype;
  return a === 'bat' ? 8 : a === 'piston' || a === 'wisp' ? 6 : 2;
};

/** `ENCOUNTERS_REPORT=<file>` writes what every fight cost (for the log of the work: docs/PROMPT22-LOG.md). */
const report: Record<string, unknown> = {};
afterAll(() => {
  if (process.env.ENCOUNTERS_REPORT) writeFileSync(process.env.ENCOUNTERS_REPORT, JSON.stringify(report, null, 1));
});

interface Trial {
  won: boolean;
  hurt: number;
  ticks: number;
  swings: number;
}

/** One creature, one hero, one distance, one seed. */
function meet(id: string, gap: number, seed: number, naive = false): Trial {
  const d = driver({ room: hall(), unlocked: ['dash'], entry: 'start', seed, extra: { enemies: ENEMIES } });
  const x = 36;
  d.teleport(x - gap, 2);
  d.settle();
  d.p.facing = 1;
  d.session.spawn(new Enemy(d.session.ids.next(id), ENEMIES[id]!, { x, y: heightOf(id), facing: -1 }));
  d.step(1);
  const f = naive ? new Brawler(d, {}, NAIVE) : new Brawler(d, TACTICS, FALLBACK);
  const alive = (): boolean => d.session.entities.some((e) => e.kind === 'enemy' && !(e as unknown as Enemy).health.dead);
  const r = f.run(() => !alive(), 3600);
  return { won: r.won, hurt: r.hurt, ticks: r.ticks, swings: r.swings };
}

const trialsOf = (id: string, naive = false): Trial[] => GAPS.flatMap((g) => SEEDS.map((s) => meet(id, g, s, naive)));
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('the fourteen creatures, in the hall, against a hero who reads them', () => {
  for (const id of CREATURE_IDS) {
    it(`${id}: beaten from every distance and seed, at a cost of at most three points of life a time and one on average`, () => {
      const trials = trialsOf(id);
      report[`creature:${id}`] = { fights: trials.length, hurtMean: +mean(trials.map((t) => t.hurt)).toFixed(2), hurtMax: Math.max(...trials.map((t) => t.hurt)), ticksMean: Math.round(mean(trials.map((t) => t.ticks))), swingsMean: +mean(trials.map((t) => t.swings)).toFixed(1) };
      expect(trials.map((t) => t.won), 'every fight is won').toEqual(trials.map(() => true));
      expect(Math.max(...trials.map((t) => t.hurt)), 'the worst fight').toBeLessThanOrEqual(3);
      expect(mean(trials.map((t) => t.hurt)), 'on average').toBeLessThanOrEqual(1);
      expect(Math.max(...trials.map((t) => t.ticks)), 'and it ends: nothing is stuck, nothing is out of reach').toBeLessThan(3600);
      expect(Math.min(...trials.map((t) => t.swings + 1)), 'by blows, or by getting out of the way of a blast').toBeGreaterThanOrEqual(1);
    });
  }
});

describe('what a hero who does not read them pays', () => {
  const read = Object.fromEntries(CREATURE_IDS.map((id) => [id, mean(trialsOf(id).map((t) => t.hurt))]));
  const naive = Object.fromEntries(CREATURE_IDS.map((id) => [id, trialsOf(id, true)]));

  it('the Stoneback cannot be beaten by walking up and swinging: its shield turns the blows from the front away, and it kills the hero first', () => {
    expect(naive['stoneback']!.filter((t) => t.won).length, 'fights the naive hero wins').toBe(0);
  });

  it('most creatures hurt a hero who ignores the telegraph, and none of them is worse for one who reads it', () => {
    const naiveHurt = Object.fromEntries(CREATURE_IDS.map((id) => [id, mean(naive[id]!.map((t) => t.hurt))]));
    report['naive'] = Object.fromEntries(CREATURE_IDS.map((id) => [id, { hurtMean: +naiveHurt[id]!.toFixed(2), wins: naive[id]!.filter((t) => t.won).length, of: naive[id]!.length }]));
    const worse = CREATURE_IDS.filter((id) => naiveHurt[id]! > read[id]! + 0.2);
    expect(worse.length, `creatures that cost the naive hero more: ${worse.join(', ')}`).toBeGreaterThanOrEqual(9);
    const total = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);
    expect(total(naiveHurt), 'points of life, summed over the fourteen').toBeGreaterThan(total(read) + 8);
    for (const id of CREATURE_IDS) expect(read[id]!, id).toBeLessThanOrEqual(naiveHurt[id]! + 0.01);
  });
});

describe('the six guardians of the engine, in their own arenas, against a mortal hero with what the road has given', () => {
  const ARENAS = [
    ['rt_arena', 'boss_root_tyrant'],
    ['mr_lair', 'boss_mire_matriarch'],
    ['mn_arena', 'boss_colossus'],
    ['sp_arena', 'boss_bell_warden'],
    ['fd_arena', 'boss_engine'],
    ['ih_arena', 'boss_sovereign'],
  ] as const;

  for (const [room, bossId] of ARENAS) {
    it(`${bossId}: the hero who reads it wins on every seed, never goes down, and the guardian's fall opens the way`, () => {
      const { abilities, flags } = heldAt(room);
      for (const seed of [1, 2, 3, 4]) {
        const d = driver({ room: ROOMS[room]!, entry: 'west', unlocked: abilities, seed, extra: { rooms: ROOMS, upgrades: UPGRADES, flags } });
        d.settle();
        d.teleport(12, 2); // the feet cross the line of the arena: the doors shut and the guardian wakes
        d.settle();
        d.step(2);
        const boss = d.session.entities.find((e): e is Boss => e instanceof Boss);
        expect(boss, `${room} has its guardian`).toBeDefined();
        expect(boss!.def.id).toBe(bossId);
        const maxLife = d.p.health.max;
        const r = new BossFighter(d, boss!).run(28800);
        ((report[`boss:${bossId}`] ??= { maxLife, seeds: [] }) as { seeds: unknown[] }).seeds.push({ seed, won: r.won, seconds: Math.round(r.ticks / 60), hurt: r.hurt, drinks: r.drinks, swings: r.swings, lowest: r.lowest, phase: r.phase });
        expect(r.won, `seed ${seed}: the guardian falls (${r.ticks} ticks, hero ${d.p.health.current}/${maxLife}, boss ${r.bossLife}/${boss!.health.max})`).toBe(true);
        expect(d.p.health.dead, `seed ${seed}`).toBe(false);
        expect(r.lowest, `seed ${seed}`).toBeGreaterThanOrEqual(1);
        expect(r.hurt, `seed ${seed}: points of life lost over the whole fight (bottles included)`).toBeLessThanOrEqual(maxLife * 2);
        expect(r.ticks, `seed ${seed}: more than ten seconds`).toBeGreaterThan(600);
        expect(r.ticks, `seed ${seed}: and under eight minutes`).toBeLessThan(28800);
        expect(r.phase, `seed ${seed}: it changed phase on the way`).toBeGreaterThanOrEqual(2);
        d.step(150);
        const defeat = ROOMS[room]!.bosses![0]!.defeatFlag;
        expect(d.session.flags.has(defeat), `seed ${seed}: ${defeat} is set for good`).toBe(true);
        expect(['door_w', 'door_e'].map((id) => d.session.collision.get(id)!.enabled), `seed ${seed}: the doors are open`).toEqual([false, false]);
      }
    });
  }
});
