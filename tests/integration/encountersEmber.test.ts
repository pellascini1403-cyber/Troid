import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOMS } from '@/content';
import { EMBER_CREATURES } from '@/content/creaturesEmber';
import { ENEMIES } from '@/content/enemies';
import { UPGRADES } from '@/content/upgrades';
import { Boss } from '@/enemies/boss/Boss';
import { Enemy } from '@/enemies/Enemy';
import { Brawler } from '../helpers/brawler';
import { BossFighter } from '../helpers/bossFight';
import { hall } from '../helpers/hall';
import { heldAt } from '../helpers/road';
import { driver } from '../helpers/sim';
import { FALLBACK, KIN, TACTICS } from '../helpers/tactics';

/**
 * THE ENCOUNTERS OF THE SECOND HALF, WON BY A MORTAL HERO (docs/PROMPT23-LOG.md §7.3; the method is that of `encounters.test.ts`, docs/PROMPT22-LOG.md §4): the ten creatures that burn, each in the hall from three distances and with
 * three seeds, and the four guardians of the Verge, the Grove, the Crater and the Throne, each in its own arena with what the hero has when it gets there (the abilities and the vessels of the road before it). The hero is mortal, plays
 * with the inputs of a person and reads the telegraphs; what each fight cost is measured, and a fight that cannot be won, or costs too much, is a finding about the creature and not about the hero.
 */
const IDS = EMBER_CREATURES.map((c) => c.id);
const GAPS = [7, 10, 13];
const SEEDS = [1, 2, 3];
const heightOf = (id: string): number => {
  const a = ENEMIES[id]!.ai.archetype;
  return a === 'bat' ? 8 : a === 'piston' || a === 'wisp' ? 6 : 2;
};

/** `ENCOUNTERS_REPORT=<file>` writes what every fight cost (for the log of the work: docs/PROMPT23-LOG.md §7.3). */
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

function meet(id: string, gap: number, seed: number): Trial {
  const d = driver({ room: hall(), unlocked: ['dash'], entry: 'start', seed, extra: { enemies: ENEMIES } });
  const x = 36;
  d.teleport(x - gap, 2);
  d.settle();
  d.p.facing = 1;
  d.session.spawn(new Enemy(d.session.ids.next(id), ENEMIES[id]!, { x, y: heightOf(id), facing: -1 }));
  d.step(1);
  const f = new Brawler(d, TACTICS, FALLBACK);
  const alive = (): boolean => d.session.entities.some((e) => e.kind === 'enemy' && !(e as unknown as Enemy).health.dead);
  const r = f.run(() => !alive(), 3600);
  return { won: r.won, hurt: r.hurt, ticks: r.ticks, swings: r.swings };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('the ten creatures that burn, in the hall, against a hero who reads them', () => {
  it('are ten, each the variant of a creature of the first half, answered the way that one is', () => {
    expect(IDS).toHaveLength(10);
    expect(Object.keys(KIN).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(ENEMIES[id]!.ai.archetype, id).toBe(ENEMIES[KIN[id]!]!.ai.archetype);
  });

  for (const id of IDS) {
    it(`${id}: beaten from every distance and seed, at a cost of at most three points of life a time and one on average`, () => {
      const trials = GAPS.flatMap((g) => SEEDS.map((s) => meet(id, g, s)));
      report[`creature:${id}`] = { fights: trials.length, hurtMean: +mean(trials.map((t) => t.hurt)).toFixed(2), hurtMax: Math.max(...trials.map((t) => t.hurt)), ticksMean: Math.round(mean(trials.map((t) => t.ticks))), swingsMean: +mean(trials.map((t) => t.swings)).toFixed(1) };
      expect(trials.map((t) => t.won), 'every fight is won').toEqual(trials.map(() => true));
      expect(Math.max(...trials.map((t) => t.hurt)), 'the worst fight').toBeLessThanOrEqual(3);
      expect(mean(trials.map((t) => t.hurt)), 'on average').toBeLessThanOrEqual(1);
      expect(Math.max(...trials.map((t) => t.ticks)), 'and it ends: nothing is stuck, nothing is out of reach').toBeLessThan(3600);
    });
  }
});

describe('the four guardians of the second half, in their own arenas, against a mortal hero with what the road has given', () => {
  const ARENAS = [
    ['dv_arena', 'boss_shepherd'],
    ['og_arena', 'boss_gardener'],
    ['ec_arena', 'boss_behemoth'],
    ['ct_arena', 'boss_cinder_sovereign'],
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
      }
    }, 240_000);
  }
});
