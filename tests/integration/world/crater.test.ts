import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { CRATER_ROOMS } from '@/content/rooms/crater';
import { GROVE_ROOMS } from '@/content/rooms/grove';
import { THRONE_ROOMS } from '@/content/rooms/throne';
import { Boss } from '@/enemies/boss/Boss';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { ALL_CATALOGS } from '../../helpers/catalogs';
import { Pilot } from '../../helpers/pilot';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { at, bare, describeArena, expectSound, log, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE EMBER CRATER (src/content/rooms/crater.ts), through the real session: ten rooms that the audit finds sound and crossable, the lava that is no longer a pool in a floor but THE FLOOR (ten terraces with four metres of lava before each, a ladder of twelve planks with pistons,
 * a river of 106 m crossed in leaps of six and seven metres), the forge with its two levers — the first asks the Double Jump and the second the Wall Jump and works only after the first —, the tunnel under a river, the mountain in the lava with the Hornilla in it, the lever, the shrines
 * and the arena of the Crater Behemoth — whose east door leads on to the Cinder Throne.
 */
const ROOMS = registry(CRATER_ROOMS);
const BARE = registry(CRATER_ROOMS.map(bare));
/** The room with nobody in it and nobody to be killed by — but with its exits, so that the pilot can walk out of it. */
const quiet = (room: RoomDefinition): RoomDefinition => ({ ...room, spawns: [], bosses: [] });
const QUIET = registry([...CRATER_ROOMS.map(quiet), ...GROVE_ROOMS.filter((r) => r.id === 'og_arena')]);
/** What the hero has had since the Sanctum, the Echo Chamber, the Sinkhole and the Old Forge: all of it. */
const HELD = ['air_dash', 'double_jump', 'wall_jump', 'ground_slam'];
const KIT = ['dash', ...HELD];
const EMBER = ['ash_bat', 'ash_toller', 'basalt_guard', 'cinder_crawler', 'cinder_weaver', 'dusk_shade', 'ember_wisp', 'magma_piston', 'magma_toad', 'slag_spitter'];

/** The pilot walks `room` from `entry` to the way out `exit`, with the real inputs of a person and a hero who can be burned; the answer is how it went. */
function walk(rooms: Record<string, RoomDefinition>, room: string, entry: string, exit: string, kit: string[] = KIT) {
  const d = at(rooms, room, entry, kit);
  const hits = log(d, 'hazard:hit');
  const p = new Pilot(d);
  const ok = p.exit(exit);
  return { d, p, ok, hits, why: p.trace.slice(0, 6).join('\n'), misses: p.trace.filter((l) => /hop "|crawl/.test(l)).slice(0, 6).join('\n') };
}

describe('the ten rooms', () => {
  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(CRATER_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are ten different rooms with ten different pictures', () => {
    expect(CRATER_ROOMS).toHaveLength(10);
    for (const r of CRATER_ROOMS) for (const [lang, catalog] of Object.entries(ALL_CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(CRATER_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(10);
  });

  it('are peopled by the heavy ones — the guards, the toads and the pistons — and by nothing of the first half', () => {
    const defs = new Set(CRATER_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => s.enemy)));
    for (const id of defs) expect(EMBER, id).toContain(id);
    expect([...new Set([...defs].map((id) => ENEMIES[id]!.ai.archetype))].sort()).toEqual(['bat', 'crawler', 'guard', 'piston', 'spitter', 'toad', 'toller', 'wisp']);
    const pistons = CRATER_ROOMS.reduce((n, r) => n + (r.spawns ?? []).filter((s) => ENEMIES[s.enemy]!.ai.archetype === 'piston').length, 0);
    expect(pistons, 'pistons in the Crater').toBeGreaterThanOrEqual(8);
  });

  it('have lava in eight of them — and none in the Refuge (the first shrine) or the Pit (the arena); the lava here is the most of any zone', () => {
    const wet = CRATER_ROOMS.filter((r) => (r.hazards ?? []).some((h) => h.kind === 'lava')).map((r) => r.id);
    expect(wet).toEqual(['ec_rim', 'ec_slope', 'ec_river', 'ec_forge', 'ec_tunnel', 'ec_caldera', 'ec_approach', 'ec_cache']);
    for (const r of CRATER_ROOMS) expect((r.hazards ?? []).filter((h) => h.kind !== 'lava'), `${r.id}: no spikes in the Crater`).toEqual([]);
    const metres = (rooms: readonly RoomDefinition[]): number => rooms.reduce((n, r) => n + (r.hazards ?? []).filter((h) => h.kind === 'lava').reduce((m, h) => m + (h.rect.x1 - h.rect.x0), 0), 0);
    expect(metres(CRATER_ROOMS), 'metres of lava').toBeGreaterThan(200);
  });
});

describe('the Rim: ten terraces, and a jump at every step', () => {
  it('the pilot goes down them — a bank of 3 m, 4 m of lava, the next bank 2 m lower — and walks out east without a burn; and goes back up the same ten jumps, 2 m higher each', () => {
    const down = walk(QUIET, 'ec_rim', 'west', 'east');
    expect(down.ok, down.why).toBe(true);
    expect(down.d.session.room.id).toBe('ec_slope');
    expect(down.hits, 'burns going down').toHaveLength(0);
    const up = walk(QUIET, 'ec_rim', 'east', 'west');
    expect(up.ok, up.why).toBe(true);
    expect(up.d.session.room.id).toBe('og_arena');
    expect(up.hits, 'burns going up').toHaveLength(0);
  });

  it('a hero who misses a jump is burned once and put back on the bank they jumped from, 4 m of lava away', () => {
    const d = at(BARE, 'ec_rim', 'west', ['dash']);
    const hits = log(d, 'hazard:hit');
    d.teleport(13.5, 20); // the middle of the bank of the first terrace (top at y = 20)
    d.settle();
    d.step(6);
    d.teleport(17.5, 19.05); // in the lava before the second
    d.step(2);
    d.until(() => d.body.y > 19.9 && d.p.controller.state !== 'hurt', 120);
    d.step(30);
    expect(hits).toHaveLength(1);
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(d.body.x, 'on the bank').toBeLessThan(15);
    expect(d.body.y).toBeCloseTo(20, 1);
  });
});

describe('the Slope and the River: a ladder of twelve planks, and 106 m of lava', () => {
  it('Slope: without the Double Jump the first plank is out of reach, however the dash, the wall and the slam are used; with it the pilot climbs the twelve planks and comes out on the ledge at the top without a burn', () => {
    const phys = new RoomPhysics(ROOMS.ec_slope!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    expect(phys.reachFrom(west, abilitySet('dash', 'air_dash', 'wall_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(east.index), 'without the Double Jump').toBe(false);
    const r = walk(QUIET, 'ec_slope', 'west', 'east');
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('ec_river');
    expect(r.hits, 'burns').toHaveLength(0);
    expect(r.p.misses, r.misses).toBe(0);
  });

  it('River: without the dash the first leap (6 m) is out of reach; with it the pilot crosses all nine stones, a running jump and a dash at each, without a burn', () => {
    const phys = new RoomPhysics(ROOMS.ec_river!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    expect(phys.reachFrom(west, abilitySet(), undefined, { dense: true }).surfaces.has(east.index), 'without the dash').toBe(false);
    const r = walk(QUIET, 'ec_river', 'west', 'east', ['dash']);
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('ec_shrine');
    expect(r.hits, 'burns').toHaveLength(0);
    expect(r.p.misses, r.misses).toBe(0);
  });
});

describe('the Forge: two levers, and the second works only after the first', () => {
  it('the first lever is on a plank 4 m up (the Double Jump) and the second on a block at the top of a chimney (the Wall Jump): neither is within reach without its ability', () => {
    const phys = new RoomPhysics(ROOMS.ec_forge!, 'open');
    const west = phys.entrySurface('west');
    const plank = phys.surfaces.find((s) => Math.abs(s.y - 6) < 0.01 && s.x0 > 12 && s.x1 < 22)!;
    const block = phys.surfaces.find((s) => Math.abs(s.y - 20) < 0.01 && s.x0 > 60)!;
    const without = (...gone: string[]) => abilitySet(...['dash', ...HELD].filter((a) => !gone.includes(a)));
    expect(phys.reachFrom(west, without('double_jump'), undefined, { dense: true }).surfaces.has(plank.index), 'plank, without the Double Jump').toBe(false);
    expect(phys.reachFrom(west, without('wall_jump'), undefined, { dense: true }).surfaces.has(block.index), 'block, without the Wall Jump').toBe(false);
    const all = phys.reachFrom(west, abilitySet(...KIT));
    expect(all.surfaces.has(plank.index) && all.surfaces.has(block.index), 'with all of it').toBe(true);
  });

  it('lever 1 opens the first stone door; lever 2 does nothing before it and opens the second door after it; the way east works only then', () => {
    const d = at(QUIET, 'ec_forge', 'west', KIT);
    d.session.godMode = true;
    const door = (id: string): boolean => d.session.collision.get(id)!.enabled;
    expect([door('forge_door_1'), door('forge_door_2')], 'shut').toEqual([true, true]);

    d.teleport(65.5, 20);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:ec_forge_2'), 'the second lever is dead before the first').toBe(false);

    d.teleport(17.5, 6);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:ec_forge_1')).toBe(true);
    expect([door('forge_door_1'), door('forge_door_2')], 'the first door open').toEqual([false, true]);

    d.teleport(65.5, 20);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:ec_forge_2')).toBe(true);
    expect([door('forge_door_1'), door('forge_door_2')], 'both open').toEqual([false, false]);

    through(d, 'east');
    expect(d.session.room.id).toBe('ec_tunnel');
  });
});

describe('the Tunnel and the Caldera: a river over a mountain, and a mountain in the lava', () => {
  it('the Tunnel: over, six stones and 76 m of lava; under, a tunnel without a drop of lava that the Wall Jump climbs out of at the far end — both ways through are open to the pilot', () => {
    const lava = ROOMS.ec_tunnel!.hazards!.filter((h) => h.kind === 'lava');
    expect(lava.every((h) => h.rect.y0 >= 13), 'all the lava is over the mountain').toBe(true);
    const over = walk(QUIET, 'ec_tunnel', 'west', 'east');
    expect(over.ok, over.why).toBe(true);
    expect(over.d.session.room.id).toBe('ec_caldera');
    expect(over.hits, 'burns').toHaveLength(0);
  });

  it('the Caldera: three stones up, 32 m of plateau, three stones down; the pilot crosses without a burn', () => {
    const r = walk(QUIET, 'ec_caldera', 'west', 'east');
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('ec_approach');
    expect(r.hits, 'burns').toHaveLength(0);
    expect(r.p.misses, r.misses).toBe(0);
  });

  it('the split stone on top of the mountain gives way to the Slam only: the hero falls into the Hornilla onto the ledge at the top of its stair', () => {
    const no = at(QUIET, 'ec_caldera', 'west', ['dash', 'air_dash', 'double_jump', 'wall_jump']);
    no.teleport(50.5, 15);
    no.step(2);
    no.moveY = -1;
    no.tap('attack');
    no.step(100);
    expect(no.session.flags.has('broken:ec_caldera_crack'), 'without the Slam').toBe(false);

    const d = at(QUIET, 'ec_caldera', 'west', KIT);
    d.teleport(50.5, 15);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:ec_caldera_crack'), 90);
    d.stop();
    d.until(() => d.session.room.id === 'ec_cache', 200);
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    expect(d.body.y, 'on the ledge of the Hornilla').toBeCloseTo(16, 1);
  });

  it('the Hornilla keeps the last vessel of life across a lake of lava with four small stones in it; taking it raises the hero\'s life by one', () => {
    const d = at(BARE, 'ec_cache', 'north', KIT);
    const before = d.p.health.max;
    d.teleport(47.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:life_9')).toBe(true);
    expect(d.p.health.max).toBe(before + 1);
    const r = walk(QUIET, 'ec_cache', 'north', 'north');
    expect(r.ok, r.why).toBe(true);
    expect(r.hits, 'burns').toHaveLength(0);
  });
});

describe('the shrines, the lever and the way home', () => {
  it('the Refuge is the first place to rest in the Crater and the Approach the last before the Behemoth', () => {
    for (const room of ['ec_shrine', 'ec_approach']) {
      const shrine = ROOMS[room]!.interactables!.find((i) => i.kind === 'rest')!;
      const d = at(ROOMS, room, 'west', KIT);
      d.teleport(shrine.x, shrine.y);
      d.settle();
      d.tap('interact');
      d.step(20);
      expect(d.session.checkpoint, room).toEqual({ room, entry: 'rest' });
    }
  });

  it('the stone door in the Rim is shut until the lever in the Approach is used; then the Approach leads back to the gallery behind it', () => {
    const cold = at(ROOMS, 'ec_rim', 'shortcut', KIT);
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(10);
    cold.stop();

    const d = at(ROOMS, 'ec_approach', 'west', KIT);
    d.session.godMode = true;
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:ec_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('ec_rim');
  });
});

describeArena(
  registry([...CRATER_ROOMS, ...THRONE_ROOMS]),
  {
    room: 'ec_arena',
    west: 'west',
    east: 'east',
    defeated: 'defeated:ec_boss',
    fight: '~fight:ec_boss',
    outside: 11.3,
    inside: 12,
    reward: { x: 64.5, y: 2, flag: 'taken:life_8' },
    onward: { exit: 'east', room: 'ct_gate', entry: 'west' },
  },
  Boss,
  { describe, it },
);
