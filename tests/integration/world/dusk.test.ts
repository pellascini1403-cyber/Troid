import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { DUSK_ROOMS } from '@/content/rooms/dusk';
import { GROVE_ROOMS } from '@/content/rooms/grove';
import { Boss } from '@/enemies/boss/Boss';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { ALL_CATALOGS } from '../../helpers/catalogs';
import { Pilot } from '../../helpers/pilot';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { at, bare, describeArena, expectSound, log, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE DUSK VERGE (src/content/rooms/dusk.ts), through the real session: ten rooms that the audit finds sound and crossable, the lava that is learned one pool at a time (the first pool with two stones in it, terraces, a river of eight stones, a lake with a ladder of planks over it that
 * only the Double Jump climbs), the split floor of the Ruins and the Cellar under it, the lever that opens the way home, the shrines and the arena of the Dusk Shepherd — whose east door leads on to the Orb Grove.
 */
const ROOMS = registry(DUSK_ROOMS);
const BARE = registry(DUSK_ROOMS.map(bare));
/** The room with nobody in it and nobody to be killed by — but with its exits, so that the pilot can walk out of it. */
const quiet = (room: RoomDefinition): RoomDefinition => ({ ...room, spawns: [], bosses: [] });
const QUIET = registry(DUSK_ROOMS.map(quiet));
/** What the hero has had since the Sanctum, the Echo Chamber, the Sinkhole and the Old Forge: all of it. */
const HELD = ['air_dash', 'double_jump', 'wall_jump', 'ground_slam'];
const KIT = ['dash', ...HELD];
/** The ember creatures of the Verge and the Grove (content/creaturesEmber.ts): the zone is peopled by them and by nothing of the first half. */
const EMBER = ['ash_bat', 'ash_toller', 'basalt_guard', 'cinder_crawler', 'cinder_weaver', 'dusk_shade', 'ember_wisp', 'magma_piston', 'magma_toad', 'slag_spitter'];

describe('the ten rooms', () => {
  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(DUSK_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are ten different rooms with ten different pictures', () => {
    expect(DUSK_ROOMS).toHaveLength(10);
    for (const r of DUSK_ROOMS) for (const [lang, catalog] of Object.entries(ALL_CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(DUSK_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(10);
  });

  it('are peopled by the ember creatures and only by them: the crawler, the toad, the guard, the wisp, the bat, the spitter, the toller and the piston', () => {
    const defs = new Set(DUSK_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => s.enemy)));
    for (const id of defs) expect(EMBER, id).toContain(id);
    const kinds = new Set([...defs].map((id) => ENEMIES[id]!.ai.archetype));
    expect([...kinds].sort()).toEqual(['bat', 'crawler', 'guard', 'piston', 'spitter', 'toad', 'toller', 'wisp']);
  });

  it('have lava in seven of them — and none in the Lookout (a shrine), the Ruins (a hall with a split floor) or the Corral (the arena)', () => {
    const wet = DUSK_ROOMS.filter((r) => (r.hazards ?? []).some((h) => h.kind === 'lava')).map((r) => r.id);
    expect(wet).toEqual(['dv_gate', 'dv_orchard', 'dv_ford', 'dv_lake', 'dv_ridge', 'dv_approach', 'dv_cellar']);
    for (const r of DUSK_ROOMS) expect((r.hazards ?? []).filter((h) => h.kind !== 'lava'), `${r.id}: no spikes in the Verge`).toEqual([]);
  });
});

describe('the Gate of Dusk: the first pool', () => {
  it('a hero who walks into it is burned once, loses a point of life, and is put back on the bank they came from: out of the lava, and not burned again', () => {
    const d = at(BARE, 'dv_gate', 'west', KIT);
    const hits = log(d, 'hazard:hit');
    d.teleport(24.5, 2);
    d.settle();
    d.step(6);
    d.right();
    d.until(() => hits.length > 0, 160);
    d.stop();
    d.step(90);
    expect(hits).toHaveLength(1);
    expect((hits[0]![1] as { kind: string }).kind).toBe('lava');
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(d.body.y, 'out of the pool').toBeGreaterThan(1.9);
    expect(d.body.x, 'on the west bank').toBeLessThan(26.5);
  });

  it('two stones stand in the pool, level with the banks: the way across is two jumps, and the pilot makes them without a burn', () => {
    const d = at(QUIET, 'dv_gate', 'west', ['dash']);
    const hits = log(d, 'hazard:hit');
    const p = new Pilot(d);
    expect(p.exit('east'), p.trace.slice(0, 6).join('\n')).toBe(true);
    expect(d.session.room.id).toBe('dv_orchard');
    expect(hits).toHaveLength(0);
    expect(d.p.health.current).toBe(d.p.health.max);
  });
});

describe('the Ford: eight stones over a river of lava', () => {
  it('the pilot crosses the 68 m of it from bank to bank, hop by hop, with the dash alone and without a burn', () => {
    const d = at(QUIET, 'dv_ford', 'west', ['dash']);
    d.session.godMode = false;
    const hits = log(d, 'hazard:hit');
    const p = new Pilot(d);
    expect(p.exit('east'), p.trace.slice(0, 6).join('\n')).toBe(true);
    expect(d.session.room.id).toBe('dv_shrine');
    expect(hits, 'burns').toHaveLength(0);
    expect(p.misses, p.trace.filter((l) => /hop "|crawl/.test(l)).slice(0, 6).join('\n')).toBe(0);
  });

  it('a hero who falls between two stones is burned once and put back on the stone they last stood on — not on the bank they started from', () => {
    const d = at(BARE, 'dv_ford', 'west', ['dash']);
    const hits = log(d, 'hazard:hit');
    d.teleport(18.5, 2);
    d.settle();
    d.step(6);
    d.teleport(22.5, 1.05); // between the first stone and the second
    d.step(2);
    d.until(() => d.body.y > 1.9 && d.p.controller.state !== 'hurt', 120);
    d.step(30);
    expect(hits).toHaveLength(1);
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(d.body.x, 'on the first stone').toBeGreaterThan(16.9);
    expect(d.body.x).toBeLessThan(20.1);
  });
});

describe('the Burning Lake: a ladder of ten planks that only the Double Jump climbs', () => {
  it('without the Double Jump the first plank (4 m up) is out of reach, however the dash, the wall and the slam are used; with it the way across exists', () => {
    const phys = new RoomPhysics(ROOMS.dv_lake!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    expect(phys.reachFrom(west, abilitySet('dash', 'air_dash', 'wall_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(east.index), 'without the Double Jump').toBe(false);
    expect(phys.reachFrom(west, abilitySet(...KIT)).surfaces.has(east.index), 'with the Double Jump').toBe(true);
  });

  it('the pilot climbs it with real inputs — a Double Jump at every plank — to the stone ledge at the top, and walks out east without a burn', () => {
    const d = at(QUIET, 'dv_lake', 'west', KIT);
    const hits = log(d, 'hazard:hit');
    const p = new Pilot(d);
    expect(p.exit('east'), p.trace.slice(0, 6).join('\n')).toBe(true);
    expect(d.session.room.id).toBe('dv_ruins');
    expect(hits, 'burns').toHaveLength(0);
    expect(p.misses, p.trace.filter((l) => /hop "|crawl/.test(l)).slice(0, 6).join('\n')).toBe(0);
  });

  it('a fall from the ladder is a burn and a walk back: one point of life, and the hero is on a stone or a ledge again, never in the lake', () => {
    const d = at(BARE, 'dv_lake', 'west', KIT);
    const hits = log(d, 'hazard:hit');
    d.teleport(5, 2);
    d.settle();
    d.step(6);
    d.teleport(40, 1.05); // in the middle of the lake
    d.step(2);
    d.until(() => d.body.y > 1.9 && d.p.controller.state !== 'hurt', 120);
    d.step(60);
    expect(hits).toHaveLength(1);
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(d.body.x, 'back on the bank at the foot of the lake').toBeLessThan(10);
  });
});

describe('the Ruins and the Burnt Cellar: a split floor, and a vessel of magic under it', () => {
  it('the crack turns the sword away and gives way to the Slam: the hero falls into the Cellar onto the ledge at the top of its stair; the stairs down, the pool and the pedestal are there', () => {
    const d = at(QUIET, 'dv_ruins', 'west', KIT);
    d.teleport(41.5, 4);
    d.settle();
    d.moveY = -1;
    d.tap('attack');
    d.step(20);
    expect(d.session.flags.has('broken:dv_ruins_crack'), 'the sword is turned away').toBe(false);
    d.stop();
    d.teleport(41.5, 9);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:dv_ruins_crack'), 90);
    d.stop();
    d.until(() => d.session.room.id === 'dv_cellar', 200);
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    expect(d.body.y, 'on the ledge of the Cellar').toBeCloseTo(16, 1);
  });

  it('a hero who has not the Slam cannot go down: down and attack in the air is only the air blow', () => {
    const d = at(BARE, 'dv_ruins', 'west', ['dash', 'air_dash', 'double_jump', 'wall_jump']);
    d.teleport(41.5, 9);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.step(100);
    expect(d.session.flags.has('broken:dv_ruins_crack')).toBe(false);
  });

  it('the vessel of magic is at the end of a pool with three stones in it, and taking it raises the hero\'s magic by 20', () => {
    const d = at(BARE, 'dv_cellar', 'north', KIT);
    const before = d.session.magic.max;
    d.teleport(5.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:mana_4')).toBe(true);
    expect(d.session.magic.max).toBe(before + 20);
  });
});

describe('the shrines, the lever and the way home', () => {
  it('the Lookout is the first place to rest in the Verge and the Approach the last before the Shepherd', () => {
    for (const [room, x, y] of [['dv_shrine', 22.5, 5], ['dv_approach', 55.5, 2]] as const) {
      const d = at(ROOMS, room, 'west', KIT);
      d.teleport(x, y);
      d.settle();
      d.tap('interact');
      d.step(20);
      expect(d.session.checkpoint, room).toEqual({ room, entry: 'rest' });
    }
  });

  it('the stone door in the Gate is shut until the lever in the Approach is used; then the Approach leads back to the gallery behind it', () => {
    const cold = at(ROOMS, 'dv_gate', 'shortcut', KIT);
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(8);
    cold.stop();

    const world = registry(DUSK_ROOMS);
    const d = at(world, 'dv_approach', 'west', KIT);
    d.session.godMode = true;
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:dv_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('dv_gate');
    d.right();
    d.step(80);
    d.stop();
    expect(d.body.x, 'open: past the door and on along the gallery').toBeGreaterThan(10);
  });
});

describeArena(
  registry([...DUSK_ROOMS, ...GROVE_ROOMS]),
  {
    room: 'dv_arena',
    west: 'west',
    east: 'east',
    defeated: 'defeated:dv_boss',
    fight: '~fight:dv_boss',
    outside: 11.3,
    inside: 12,
    reward: { x: 60.5, y: 2, flag: 'taken:life_6' },
    onward: { exit: 'east', room: 'og_edge', entry: 'west' },
  },
  Boss,
  { describe, it },
);
