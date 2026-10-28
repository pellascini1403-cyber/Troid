import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { COMPLETED_FLAG } from '@/progression/adventure';
import { ROAD } from '../helpers/road';
import { Runner } from '../helpers/runner';

/**
 * THE WHOLE ADVENTURE, FROM A NEW GAME TO THE WAY OUT OF THE WORLD (docs/PROMPT22-LOG.md §5). One session, the integrated world — the seven zones, the fifty-six rooms of the road, the seven guardians — played by a scripted player (`runner.ts`) that
 * has the inputs of a person (the stick, jump, attack, dash, the Spirit Bolt, a bottle, Interact) and a hero who CAN DIE: it walks the road (`pilot.ts`), fights what it meets (`brawler.ts`, `tactics.ts`), beats the guardians (`bossFight.ts`),
 * pulls the levers, takes the cards and the lessons, breaks the seals the way each one asks (the bolt, the slam, the sword), rests at the shrines — where the game is SAVED by the page's own recorder, into a storage, and read back as the page
 * reads it — and, when it falls, is brought back by the shrine and goes on. At the end it walks out of the world.
 *
 * What this proves: that the world, as ONE piece, can be finished by the inputs a person has — on three different seeds of the simulation's random generator, and across a game closed and opened again at four shrines — and what the page saved
 * at the end says so. What it does NOT prove: that a person can do it (it knows the whole map and never explores; it reads the creatures' states, which are the telegraphs a person reads, but with perfect attention), how long it takes a person, or
 * how many times they fall: its time is a LOWER bound, "the pure run", and is reported as such.
 */
const SEEDS = [1, 2, 3];
const RELOAD_AT = ['mr_shrine', 'mn_camp', 'sp_shrine', 'ih_shrine'];

/** Everything a hero must hold at the end: the five abilities the road teaches and the Spirit Bolt of the card. */
const ABILITIES = ['dash', 'air_dash', 'double_jump', 'wall_jump', 'ground_slam', 'magic_attack'];
const GUARDIANS = ['r4_boss', 'rt_boss', 'mr_boss', 'mn_boss', 'sp_boss', 'fd_boss', 'ih_boss'].map((id) => `defeated:${id}`);
const SHRINES = ROAD.filter((id) => ROOMS[id]!.interactables?.some((i) => i.kind === 'rest'));

const report: Record<string, unknown> = {};
afterAll(() => {
  if (process.env.FULLRUN_REPORT) writeFileSync(process.env.FULLRUN_REPORT, JSON.stringify(report, null, 1));
});

const minutes = (ticks: number): number => +(ticks / 3600).toFixed(1);

describe('the whole adventure, from a new game to the way out of the world', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: the hero walks out of the world, every guardian down and every ability won, and the page's own save says so`, async () => {
      const r = new Runner({ seed });
      await r.play();
      const s = r.d.session;
      expect(r.ended, 'the adventure ended: the hero touched the way out of the last room').toBe(true);
      expect(s.room.id).toBe(ROAD[ROAD.length - 1]);
      expect(s.flags.has(COMPLETED_FLAG)).toBe(true);
      expect(r.tasks.filter((t) => !t.done(r)).map((t) => t.id), 'every thing the road has to do was done').toEqual([]);
      for (const flag of GUARDIANS) expect(s.flags.has(flag), flag).toBe(true);
      for (const a of ABILITIES) expect(s.abilities.has(a), `the hero holds ${a}`).toBe(true);
      expect(s.player.health.max, 'and the vessels of life along the road').toBeGreaterThan(5);

      // what the PAGE saved: the same code, into a storage, read back as the page reads it
      const saved = await r.stored();
      expect(saved, 'a game is saved').not.toBeNull();
      expect(saved!.flags, 'and it is completed').toContain(COMPLETED_FLAG);
      expect(saved!.at.room).toBe('ih_end');
      for (const a of ABILITIES) expect(saved!.abilities, `the save holds ${a}`).toContain(a);
      expect([...saved!.flags].filter((f) => !f.startsWith('~')).sort(), 'the save is the session, flag for flag').toEqual(s.flags.list().filter((f) => !f.startsWith('~')).sort());
      expect(saved!.stats.deaths, 'the page counted the defeats').toBe(r.deaths);
      expect(saved!.stats.ticks, 'and the time played').toBe(r.now);
      expect(saved!.stats.rooms.length, 'and the rooms seen').toBeGreaterThanOrEqual(ROAD.length);
      expect(r.saves.length, 'the game was saved at every shrine of the road').toBe(SHRINES.length);

      // the length of it: the lower bound
      expect(minutes(r.now), `minutes of play (the pure run: ${r.deaths} falls)`).toBeGreaterThan(15);
      expect(minutes(r.now)).toBeLessThan(60);
      expect(r.deaths, 'falls on the way').toBeLessThanOrEqual(30);
      expect(r.bossTicks, 'ticks against guardians').toBeGreaterThan(7 * 600);

      report[`seed ${seed}`] = { minutes: minutes(r.now), deaths: r.deaths, combatMinutes: minutes(r.combatTicks), guardianMinutes: minutes(r.bossTicks), zones: r.zones().map((z) => ({ ...z, minutes: minutes(z.ticks), combatMinutes: minutes(z.combat) })) };
    }, 120_000);
  }

  it(`the game closed and opened again at four shrines (${RELOAD_AT.join(', ')}) is the same game: nothing won is lost, and it still ends`, async () => {
    const r = new Runner({ seed: 1, reloadAt: RELOAD_AT });
    await r.play();
    expect(r.reloads).toBe(RELOAD_AT.length);
    expect(r.ended).toBe(true);
    const s = r.d.session;
    expect(s.flags.has(COMPLETED_FLAG)).toBe(true);
    // nothing that any save held was lost on the way: the progress only grows
    const now = new Set(s.flags.list());
    for (const save of r.saves) for (const f of save.flags) if (!f.startsWith('~')) expect(now.has(f), `${f} (saved at ${save.at.room}) is still there at the end`).toBe(true);
    for (const a of ABILITIES) expect(s.abilities.has(a), a).toBe(true);
    // the saves grow too: each holds what the one before it held
    for (let i = 1; i < r.saves.length; i++) {
      const before = new Set(r.saves[i - 1]!.flags.filter((f) => !f.startsWith('~')));
      for (const f of before) expect(r.saves[i]!.flags, `save ${i + 1} (${r.saves[i]!.at.room}) keeps ${f}`).toContain(f);
    }
    const saved = await r.stored();
    expect(saved!.flags).toContain(COMPLETED_FLAG);
    expect(saved!.stats.ticks, 'the time played goes on across the reloads').toBe(r.now);
    report['reloads'] = { minutes: minutes(r.now), deaths: r.deaths, reloads: r.reloads };
  }, 120_000);

  it('the world the run goes through is the whole of it: 7 zones, the 56 rooms of the road, and the 8 optional rooms it does not need', () => {
    expect(new Set(ROAD.map((id) => ROOMS[id]!.regionId.replace('ancient_forest_sanctum', 'ancient_forest_ruins'))).size).toBe(7);
    expect(ROAD.length).toBe(56);
    expect(WORLD.rooms.length - ROAD.length).toBe(8);
  });
});
