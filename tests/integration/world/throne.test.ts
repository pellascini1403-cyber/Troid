import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { THRONE_ROOMS } from '@/content/rooms/throne';
import { Boss } from '@/enemies/boss/Boss';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { ALL_CATALOGS } from '../../helpers/catalogs';
import { Pilot } from '../../helpers/pilot';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { at, describeArena, expectSound, log, registry, SLOW, through, zoneOf } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE CINDER THRONE (src/content/rooms/throne.ts), through the real session: ten rooms that the audit finds sound and crossable, the last of the lava in its hardest form (a causeway of three stones with a guardian on each, a stair of seven floors with a pool in each, a pit of
 * chains with two peaks, a gauntlet of 106 m), the two rooms with no lava in them at all that are the room of the creatures and the last quiet before the Sovereign, the lever, the shrines, the arena of the Cinder Sovereign — and, past it, the Sky of Ash, whose east wall is the way out of
 * the world: the end of the adventure.
 */
const ROOMS = registry(THRONE_ROOMS);
/** The room with nobody in it and nobody to be killed by — but with its exits, so that the pilot can walk out of it. */
const quiet = (room: RoomDefinition): RoomDefinition => ({ ...room, spawns: [], bosses: [] });
const QUIET = registry(THRONE_ROOMS.map(quiet));
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
    expectSound(THRONE_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are ten different rooms with ten different pictures', () => {
    expect(THRONE_ROOMS).toHaveLength(10);
    for (const r of THRONE_ROOMS) for (const [lang, catalog] of Object.entries(ALL_CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(THRONE_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(10);
  });

  it('are peopled by the ember creatures and only by them, the Dusk Shades and the Cinder Weavers among them — the zone has no crawler: the throne is kept by what comes back and by what weaves', () => {
    const defs = new Set(THRONE_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => s.enemy)));
    for (const id of defs) expect(EMBER, id).toContain(id);
    expect([...new Set([...defs].map((id) => ENEMIES[id]!.ai.archetype))].sort()).toEqual(['bat', 'guard', 'piston', 'shade', 'spitter', 'toad', 'toller', 'weaver', 'wisp']);
  });

  it('have lava in five of them — the gate, the gallery, the stair, the pit and the gauntlet — and none in the hall, the chapel, the antechamber, the throne or the sky: the last lava is a run and the rest of the zone is the creatures', () => {
    const wet = THRONE_ROOMS.filter((r) => (r.hazards ?? []).some((h) => h.kind === 'lava')).map((r) => r.id);
    expect(wet).toEqual(['ct_gate', 'ct_gallery', 'ct_stair', 'ct_chains', 'ct_gauntlet']);
    for (const r of THRONE_ROOMS) expect((r.hazards ?? []).filter((h) => h.kind !== 'lava'), `${r.id}: no spikes in the Throne`).toEqual([]);
  });
});

describe('the Gate of Ash: a causeway of three stones, and a guardian on each', () => {
  it('the pilot crosses the 38 m of the moat by the three stones — 3 m of lava between each — without a burn (the guardians are not there: this is the question of the terrain)', () => {
    const r = walk(QUIET, 'ct_gate', 'west', 'east');
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('ct_hall');
    expect(r.hits, 'burns').toHaveLength(0);
    expect(r.p.misses, r.misses).toBe(0);
  });

  it('a Basalt Guard on the first stone and another on the second, a Magma Toad on the third: nobody can be avoided on the way across', () => {
    const on = ROOMS.ct_gate!.spawns!.map((s) => [s.enemy, Math.round(s.x)]);
    expect(on.filter(([e]) => e === 'basalt_guard').map(([, x]) => x as number).every((x) => (x >= 22 && x <= 31) || (x >= 34 && x <= 44))).toBe(true);
    expect(on.filter(([e]) => e === 'magma_toad').map(([, x]) => x as number).every((x) => x >= 47 && x <= 56)).toBe(true);
  });
});

describe('the Great Hall and the Gallery of Chains: the room of the creatures, and two ways along a hall', () => {
  it('the Hall has no lava and seven creatures, all of them awake: three Dusk Shades, a Cinder Weaver, a Basalt Guard and two spitters on planks', () => {
    expect((ROOMS.ct_hall!.hazards ?? []).length).toBe(0);
    const kinds = ROOMS.ct_hall!.spawns!.map((s) => ENEMIES[s.enemy]!.ai.archetype).sort();
    expect(kinds).toEqual(['guard', 'shade', 'shade', 'shade', 'spitter', 'spitter', 'weaver']);
  });

  it('the Gallery: along the floor between three pools, or up a stair of five planks and along a walkway 18 m up; both are reachable from the door, and the pilot walks out without a burn', () => {
    const phys = new RoomPhysics(ROOMS.ct_gallery!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    const reach = phys.reachFrom(west, abilitySet('dash'));
    expect(reach.surfaces.has(east.index), 'the way out').toBe(true);
    const walkway = phys.surfaces.filter((s) => Math.abs(s.y - 20) < 0.01);
    expect(walkway.length, 'the walkway of planks').toBe(4);
    for (const s of walkway) expect(reach.surfaces.has(s.index), `the plank at x = ${s.x0}`).toBe(true);
    const r = walk(QUIET, 'ct_gallery', 'west', 'east', ['dash']);
    expect(r.ok, r.why).toBe(true);
    expect(r.hits, 'burns').toHaveLength(0);
  });
});

describe('the Stair: seven floors, and a pool of lava in the middle of each', () => {
  it('the pilot climbs it floor by floor — a crossing before every stair — to the top, 44 m up, and walks out by the east wall without a burn; and goes down again', () => {
    expect(ROOMS.ct_stair!.hazards!.filter((h) => h.kind === 'lava').length, 'two pieces of lava (either side of the stone in it) on each of the seven floors').toBe(14);
    const up = walk(QUIET, 'ct_stair', 'bottom', 'top');
    expect(up.ok, up.why).toBe(true);
    expect(up.d.session.room.id).toBe('ct_chains');
    expect(up.hits, 'burns going up').toHaveLength(0);
    expect(up.p.misses, up.misses).toBe(0);
    const down = walk(QUIET, 'ct_stair', 'top', 'bottom');
    expect(down.ok, down.why).toBe(true);
    expect(down.d.session.room.id).toBe('ct_shrine');
    expect(down.hits, 'burns going down').toHaveLength(0);
  });
});

describe('the Pit of Chains and the Gauntlet: the hardest road of the world', () => {
  it('the Pit: two peaks 13 m high over 76 m of lava, with a stair of stones and planks up to each and down from each — the pilot crosses it without a burn', () => {
    const r = walk(QUIET, 'ct_chains', 'west', 'east');
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('ct_gauntlet');
    expect(r.hits, 'burns').toHaveLength(0);
    expect(r.p.misses, r.misses).toBe(0);
  });

  it('the Gauntlet: without the dash the first leap is out of reach; with it the pilot crosses eleven stones over 106 m, a running jump and a dash at each, and walks out without a burn', () => {
    const phys = new RoomPhysics(ROOMS.ct_gauntlet!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    expect(phys.reachFrom(west, abilitySet(), undefined, { dense: true }).surfaces.has(east.index), 'without the dash').toBe(false);
    const r = walk(QUIET, 'ct_gauntlet', 'west', 'east', ['dash']);
    expect(r.ok, r.why).toBe(true);
    expect(r.d.session.room.id).toBe('ct_approach');
    expect(r.hits, 'burns').toHaveLength(0);
    expect(r.p.misses, r.misses).toBe(0);
  });

  it('a hero who falls off a stone of the Gauntlet is burned once and put back on the stone they last stood on — a few seconds of walking, not the whole road', () => {
    const d = at(registry(THRONE_ROOMS.map((r) => ({ ...r, spawns: [], bosses: [], exits: [] }))), 'ct_gauntlet', 'west', ['dash']);
    const hits = log(d, 'hazard:hit');
    d.teleport(26.5, 3);
    d.settle();
    d.step(6);
    d.teleport(31, 1.05); // in the lava, between the second stone and the third
    d.step(2);
    d.until(() => d.body.y > 2.9 && d.p.controller.state !== 'hurt', 120);
    d.step(30);
    expect(hits).toHaveLength(1);
    expect(d.p.health.current).toBe(d.p.health.max - 1);
    expect(d.body.x, 'on the stone').toBeGreaterThan(24.9);
    expect(d.body.x).toBeLessThan(28.1);
  });
});

describe('the shrines, the lever and the way home', () => {
  it('the Chapel is the first place to rest in the Throne and the Antechamber the last before the Sovereign, and the Sky of Ash the last place of all', () => {
    for (const room of ['ct_shrine', 'ct_approach', 'ct_end']) {
      const shrine = ROOMS[room]!.interactables!.find((i) => i.kind === 'rest')!;
      const d = at(ROOMS, room, 'west', KIT);
      d.teleport(shrine.x, shrine.y);
      d.settle();
      d.tap('interact');
      d.step(20);
      expect(d.session.checkpoint, room).toEqual({ room, entry: 'rest' });
    }
  });

  it('the stone door in the Gate is shut until the lever in the Antechamber is used; then the Antechamber leads back to the gallery behind it', () => {
    const cold = at(ROOMS, 'ct_gate', 'shortcut', KIT);
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(8);
    cold.stop();

    const d = at(ROOMS, 'ct_approach', 'west', KIT);
    d.session.godMode = true;
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:ct_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('ct_gate');
  });
});

describeArena(
  ROOMS,
  {
    room: 'ct_arena',
    west: 'west',
    east: 'east',
    defeated: 'defeated:ct_boss',
    fight: '~fight:ct_boss',
    outside: 11.3,
    inside: 12,
    onward: { exit: 'east', room: 'ct_end', entry: 'west' },
  },
  Boss,
  { describe, it },
);

describe('the way out of the world', () => {
  it('is in the last room, at the east wall, and works only once the Sovereign has fallen: touching it ends the adventure, once per touch, and leaves the hero where they stand', () => {
    const end = ROOMS.ct_end!.exits!.find((x) => x.end)!;
    expect(end.requires).toBe('defeated:ct_boss');
    expect(end.to).toBeUndefined();
    expect(THRONE_ROOMS.flatMap((r) => (r.exits ?? []).filter((x) => x.end)).length, 'the only way out of the world in the whole zone').toBe(1);

    const z = zoneOf(ROOMS.ct_end!, 'end');
    const shut = at(ROOMS, 'ct_end', 'west', KIT);
    const events = log(shut, 'adventure:ended');
    shut.teleport(z.x, z.y);
    shut.step(4);
    expect(events, 'shut: nothing happens').toHaveLength(0);

    const open = at(ROOMS, 'ct_end', 'west', KIT, ['defeated:ct_boss']);
    const ended = log(open, 'adventure:ended');
    open.teleport(z.x, z.y);
    open.step(2);
    expect(ended).toEqual([['adventure:ended', { roomId: 'ct_end', exitId: 'end' }]]);
    expect(open.session.room.id).toBe('ct_end');
  });
});
