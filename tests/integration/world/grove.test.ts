import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { CRATER_ROOMS } from '@/content/rooms/crater';
import { GROVE_ROOMS } from '@/content/rooms/grove';
import { Boss } from '@/enemies/boss/Boss';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { ALL_CATALOGS } from '../../helpers/catalogs';
import { Pilot } from '../../helpers/pilot';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { at, bare, describeArena, expectSound, killEnemy, log, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE ORB GROVE (src/content/rooms/grove.ts), through the real session: eleven rooms that the audit finds sound and crossable, the lava that is now UNDER what the hero does (a bridge that has lost its planks, a descent over a river whose way back is four Double Jumps, a chimney
 * of wood that only the Wall Jump climbs, an island chain, a spring that pours out of a stone in the air), the door a Cinder Weaver keeps, the split floor of the Clearing and the Root Vault under it, the lever, the shrines and the arena of the Grove Gardener — whose east door leads on to the Ember Crater.
 */
const ROOMS = registry(GROVE_ROOMS);
const BARE = registry(GROVE_ROOMS.map(bare));
/** The room with nobody in it and nobody to be killed by — but with its exits, so that the pilot can walk out of it. */
const quiet = (room: RoomDefinition): RoomDefinition => ({ ...room, spawns: [], bosses: [] });
const QUIET = registry(GROVE_ROOMS.map(quiet));
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

describe('the eleven rooms', () => {
  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(GROVE_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are eleven different rooms with eleven different pictures', () => {
    expect(GROVE_ROOMS).toHaveLength(11);
    for (const r of GROVE_ROOMS) for (const [lang, catalog] of Object.entries(ALL_CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(GROVE_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(11);
  });

  it('are peopled by the ember creatures and only by them, the Cinder Weaver — that keeps a door — the one that is new here', () => {
    const defs = new Set(GROVE_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => s.enemy)));
    for (const id of defs) expect(EMBER, id).toContain(id);
    expect(defs.has('cinder_weaver')).toBe(true);
    expect([...new Set([...defs].map((id) => ENEMIES[id]!.ai.archetype))].sort()).toEqual(['bat', 'crawler', 'guard', 'piston', 'spitter', 'toad', 'toller', 'weaver', 'wisp']);
  });

  it('have lava in eight of them — and none in the Shrine, the Clearing or the Garden (the arena): the eyes rest where the hero does', () => {
    const wet = GROVE_ROOMS.filter((r) => (r.hazards ?? []).some((h) => h.kind === 'lava')).map((r) => r.id);
    expect(wet).toEqual(['og_edge', 'og_roots', 'og_trunk', 'og_gap', 'og_spring', 'og_canopy', 'og_approach', 'og_vault']);
    for (const r of GROVE_ROOMS) expect((r.hazards ?? []).filter((h) => h.kind !== 'lava'), `${r.id}: no spikes in the Grove`).toEqual([]);
  });
});

describe('the Edge of the Grove: a bridge that has lost its planks', () => {
  it('the pilot crosses the 48 m of lava by its stretches and the stone in the middle, jump by jump, and walks out east without a burn', () => {
    const r = walk(QUIET, 'og_edge', 'west', 'east', ['dash']);
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('og_roots');
    expect(r.hits, 'burns').toHaveLength(0);
    expect(r.p.misses, r.misses).toBe(0);
  });

  it('a hero who is thrown into one of the gaps beside the stone in the middle is burned once and put back ON THE STONE — the planks are not ground to come back to — and the bridge goes on from there', () => {
    const d = at(BARE, 'og_edge', 'west', ['dash']);
    const hits = log(d, 'hazard:hit');
    d.teleport(39, 4);
    d.settle();
    d.step(6);
    d.teleport(43.5, 1.05); // in the gap between the stone and the next stretch
    d.step(2);
    d.until(() => d.body.y > 3.9 && d.p.controller.state !== 'hurt', 120);
    d.step(30);
    expect(hits).toHaveLength(1);
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(d.body.x, 'on the stone').toBeGreaterThan(35.9);
    expect(d.body.x).toBeLessThan(42.1);
    expect(d.body.y).toBeCloseTo(4, 1);
  });
});

describe('the High Roots: the way down is a drop, and the way back up is four Double Jumps', () => {
  it('without the Double Jump the ledge 20 m up is out of reach from the floor, however the dash, the wall and the slam are used; with it the four planks are a climb', () => {
    const phys = new RoomPhysics(ROOMS.og_roots!, 'open');
    const ledge = phys.entrySurface('west');
    const floor = phys.entrySurface('east');
    expect(phys.reachFrom(floor, abilitySet('dash', 'air_dash', 'wall_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(ledge.index), 'without the Double Jump').toBe(false);
    expect(phys.reachFrom(floor, abilitySet(...KIT)).surfaces.has(ledge.index), 'with the Double Jump').toBe(true);
  });

  it('down: the pilot drops from the ledge by the planks to the far bank and walks out; up: from the far bank it climbs back to the ledge with a Double Jump at every plank — neither costs a burn', () => {
    const down = walk(QUIET, 'og_roots', 'west', 'east');
    expect(down.ok, down.why).toBe(true);
    expect(down.d.session.room.id).toBe('og_trunk');
    expect(down.hits, 'burns on the way down').toHaveLength(0);
    const up = walk(QUIET, 'og_roots', 'east', 'west');
    expect(up.ok, up.why).toBe(true);
    expect(up.d.session.room.id).toBe('og_edge');
    expect(up.hits, 'burns on the way up').toHaveLength(0);
    expect(up.p.misses, up.misses).toBe(0);
  });
});

describe('the Trunk: a chimney of wood that only the Wall Jump climbs', () => {
  it('without the Wall Jump the 31 m are a wall; with it the pilot climbs from wall to wall, past the three beds of embers, and comes out on the block at the top', () => {
    const phys = new RoomPhysics(ROOMS.og_trunk!, 'open');
    const bottom = phys.entrySurface('west');
    const top = phys.entrySurface('east');
    expect(phys.reachFrom(bottom, abilitySet('dash', 'air_dash', 'double_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(top.index), 'without the Wall Jump').toBe(false);
    const r = walk(QUIET, 'og_trunk', 'west', 'east');
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('og_shrine');
    expect(r.hits, 'burns').toHaveLength(0);
  });
});

describe('the Rift, the Spring and the Canopy: the lava in three shapes', () => {
  it('the Rift: ten stones from 2 to 7 m high over 84 m of lava, with two tollers and two pistons — the pilot crosses it without a burn', () => {
    const r = walk(QUIET, 'og_gap', 'west', 'east');
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('og_spring');
    expect(r.hits, 'burns').toHaveLength(0);
    expect(r.p.misses, r.misses).toBe(0);
  });

  it('the Spring: a fall of lava pours out of a stone that hangs in the air; the stone is walked over with the fall under the feet, and the pilot crosses without a burn', () => {
    const fall = ROOMS.og_spring!.hazards!.find((h) => h.kind === 'lava' && h.rect.y1 - h.rect.y0 > 5)!;
    expect(fall, 'a column of lava, taller than a pool is deep').toBeDefined();
    const r = walk(QUIET, 'og_spring', 'west', 'east');
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('og_canopy');
    expect(r.hits, 'burns').toHaveLength(0);
  });

  it('the Canopy has two ways through it: along the floor between three pools, or up a stair of three planks and along a walkway 10 m up; both are reachable from the door', () => {
    const phys = new RoomPhysics(ROOMS.og_canopy!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    const reach = phys.reachFrom(west, abilitySet('dash'));
    expect(reach.surfaces.has(east.index), 'the way out').toBe(true);
    const walkway = phys.surfaces.filter((s) => Math.abs(s.y - 12) < 0.01 && s.x0 > 23);
    expect(walkway.length, 'the walkway of planks').toBeGreaterThanOrEqual(6);
    for (const s of walkway) expect(reach.surfaces.has(s.index), `the plank at x = ${s.x0}`).toBe(true);
    const r = walk(QUIET, 'og_canopy', 'west', 'east', ['dash']);
    expect(r.ok, r.why).toBe(true);
    expect(r.hits, 'burns').toHaveLength(0);
  });
});

describe('the Clearing: a door that a Cinder Weaver keeps, and a split floor with the Vault under it', () => {
  const only = (keep: (id: string) => boolean): Record<string, RoomDefinition> => registry(GROVE_ROOMS.map((r) => (r.id === 'og_clearing' ? { ...r, spawns: r.spawns!.filter((s) => keep(s.id)) } : r)));

  it('the door holds until the keeper falls; its fall is remembered for good and the door opens; a room built afterwards has neither the keeper nor the door', () => {
    const d = at(only((id) => id === 'weaver_key'), 'og_clearing', 'west', KIT);
    d.session.godMode = true;
    d.teleport(72, 2);
    d.settle();
    d.right();
    d.step(60);
    d.stop();
    expect(d.body.x, 'stopped by the stone').toBeLessThan(75.9);
    killEnemy(d, 'cinder_weaver', 24.5);
    expect(d.session.flags.has('defeated:og_clearing_keeper')).toBe(true);
    d.right();
    d.step(100);
    expect(d.session.room.id, 'through the door and out: the exit works').toBe('og_gap');

    const later = at(ROOMS, 'og_clearing', 'west', ['dash'], ['defeated:og_clearing_keeper']);
    expect(later.session.entities.filter((e) => e.kind === 'enemy' && (e as unknown as { def: { id: string } }).def.id === 'cinder_weaver')).toHaveLength(0);
  });

  it('the split floor turns the sword away and gives way to the Slam: the hero falls into the Vault onto the ledge at the top of its stair', () => {
    const d = at(QUIET, 'og_clearing', 'west', KIT);
    d.teleport(41.5, 3);
    d.settle();
    d.moveY = -1;
    d.tap('attack');
    d.step(20);
    expect(d.session.flags.has('broken:og_clearing_crack'), 'the sword is turned away').toBe(false);
    d.stop();
    d.teleport(41.5, 9);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:og_clearing_crack'), 90);
    d.stop();
    d.until(() => d.session.room.id === 'og_vault', 200);
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    expect(d.body.y, 'on the ledge of the Vault').toBeCloseTo(16, 1);
  });

  it('the vessel of life is across a moat of lava with two stones in it; taking it raises the hero\'s life by one', () => {
    const d = at(BARE, 'og_vault', 'north', KIT);
    const before = d.p.health.max;
    d.teleport(6.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:life_7')).toBe(true);
    expect(d.p.health.max).toBe(before + 1);
    const r = walk(QUIET, 'og_vault', 'north', 'north');
    expect(r.ok, r.why).toBe(true);
  });
});

describe('the shrines, the lever and the way home', () => {
  it('the Shrine is the first place to rest in the Grove and the Approach the last before the Gardener', () => {
    for (const [room, x, y] of [['og_shrine', 25.5, 4], ['og_approach', 55.5, 2]] as const) {
      const d = at(ROOMS, room, 'west', KIT);
      d.teleport(x, y);
      d.settle();
      d.tap('interact');
      d.step(20);
      expect(d.session.checkpoint, room).toEqual({ room, entry: 'rest' });
    }
  });

  it('the stone door in the Edge is shut until the lever in the Approach is used; then the Approach leads back to the gallery behind it', () => {
    const cold = at(ROOMS, 'og_edge', 'shortcut', KIT);
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(8);
    cold.stop();

    const d = at(ROOMS, 'og_approach', 'west', KIT);
    d.session.godMode = true;
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:og_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('og_edge');
    d.right();
    d.step(80);
    d.stop();
    expect(d.body.x, 'open: past the door and on along the gallery').toBeGreaterThan(10);
  });
});

describeArena(
  registry([...GROVE_ROOMS, ...CRATER_ROOMS]),
  {
    room: 'og_arena',
    west: 'west',
    east: 'east',
    defeated: 'defeated:og_boss',
    fight: '~fight:og_boss',
    outside: 11.3,
    inside: 12,
    reward: { x: 60.5, y: 2, flag: 'taken:mana_5' },
    onward: { exit: 'east', room: 'ec_rim', entry: 'west' },
  },
  Boss,
  { describe, it },
);
