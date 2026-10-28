import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { SPIRE_ROOMS } from '@/content/rooms/spire';
import { Boss } from '@/enemies/boss/Boss';
import { CATALOGS } from '@/i18n';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { chainTo, playChain } from '../../helpers/chain';
import { at, bare, describeArena, expectSound, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE BELL SPIRE (src/content/rooms/spire.ts), through the real session: eleven rooms that the audit finds sound and crossable, the shafts that only the Wall Jump climbs, the plank that only the Double Jump gets onto, the two levers of the Belfry
 * (the second works only after the first), the cracked island of the bridge and the Loft under it, the shrines and the way home, and the arena of the Bell Warden.
 */
const ROOMS = registry(SPIRE_ROOMS);
const BARE = registry(SPIRE_ROOMS.map(bare));
/** What the hero has had since the Sanctum, the Echo Chamber, the Sinkhole and the Old Forge: all of it. */
const HELD = ['air_dash', 'double_jump', 'wall_jump', 'ground_slam'];
const KIT = ['dash', ...HELD];

describe('the eleven rooms', () => {
  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(SPIRE_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are eleven different rooms with eleven different pictures', () => {
    expect(SPIRE_ROOMS).toHaveLength(11);
    for (const r of SPIRE_ROOMS) for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(SPIRE_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(11);
  });

  it('are peopled by the creatures of the tower: tollers that ring waves along the floor, bats and wisps', () => {
    const kinds = new Set(SPIRE_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => ENEMIES[s.enemy]!.ai.archetype)));
    expect([...kinds].sort()).toEqual(['bat', 'toller', 'wisp']);
  });
});

describe('the shafts: the Wall Jump, asked for in earnest', () => {
  for (const [room, from, to, ledgeY] of [
    ['sp_foot', 'west', 'east', 30],
    ['sp_chimney', 'west', 'east', 34],
  ] as const) {
    it(`${room}: a hero with everything but the Wall Jump cannot climb it, however they time the jumps; with it the hops the solver finds are hops of the game and the hero comes out on the ledge with the door`, () => {
      const phys = new RoomPhysics(ROOMS[room]!, 'open');
      const start = phys.entrySurface(from);
      const ledge = phys.entrySurface(to);
      expect(phys.reachFrom(start, abilitySet('dash', 'air_dash', 'double_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(ledge.index), 'without the Wall Jump').toBe(false);
      const has = abilitySet(...KIT);
      const reach = phys.reachFrom(start, has);
      expect(reach.surfaces.has(ledge.index), 'with the Wall Jump').toBe(true);
      const d = at(BARE, room, from, KIT);
      const landings = playChain(d, phys, chainTo(reach, ledge.index)!, has);
      expect(landings.every((l) => l.matches), 'every hop comes down where the solver\'s did').toBe(true);
      expect(d.body.y).toBeCloseTo(ledgeY, 1);
    });
  }
});

describe('the Spiral Stair: seven floors, and stairs at the ends of them', () => {
  it('the dash alone climbs it, both ways, and the very hops the solver finds are hops of the game', () => {
    const phys = new RoomPhysics(ROOMS.sp_stair!, 'open');
    const bottom = phys.entrySurface('bottom');
    const top = phys.entrySurface('top');
    const has = abilitySet('dash');
    const reach = phys.reachFrom(bottom, has);
    expect(reach.surfaces.has(top.index)).toBe(true);
    const d = at(BARE, 'sp_stair', 'bottom', ['dash']);
    const landings = playChain(d, phys, chainTo(reach, top.index)!, has);
    expect(landings.every((l) => l.matches), 'every hop comes down where the solver\'s did').toBe(true);
    expect(d.body.y).toBeCloseTo(44, 1);
  });
});

describe('the Belfry: two levers, two doors, and the second lever works only after the first', () => {
  const d0 = () => at(ROOMS, 'sp_belfry', 'west', KIT);

  it('the plank of the first lever is reached with the Double Jump alone, and the lever of the second is not there to use until the first has been', () => {
    const d = d0();
    d.session.godMode = true;
    d.teleport(19.5, 6);
    d.settle();
    d.teleport(43.5, 20);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:sp_bell_2'), 'the second lever does nothing yet').toBe(false);
    d.teleport(19.5, 6);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:sp_bell_1')).toBe(true);
    d.teleport(43.5, 20);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:sp_bell_2')).toBe(true);
  });

  it('each lever opens its own door: the first the stone between the chambers, the second the one before the way on; and the way on works only after the second', () => {
    const d = at(ROOMS, 'sp_belfry', 'west', KIT, ['lever:sp_bell_1']);
    d.session.godMode = true;
    const doors = (): boolean[] => ['bell_door_1', 'bell_door_2'].map((id) => d.session.collision.get(id)!.enabled);
    expect(doors()).toEqual([false, true]);
    const cold = at(ROOMS, 'sp_belfry', 'west', KIT);
    expect(['bell_door_1', 'bell_door_2'].map((id) => cold.session.collision.get(id)!.enabled)).toEqual([true, true]);
    const open = at(ROOMS, 'sp_belfry', 'west', KIT, ['lever:sp_bell_1', 'lever:sp_bell_2']);
    open.session.godMode = true;
    expect(['bell_door_1', 'bell_door_2'].map((id) => open.session.collision.get(id)!.enabled)).toEqual([false, false]);
    open.teleport(45.5, 2);
    open.settle();
    through(open, 'east');
    expect(open.session.room.id).toBe('sp_roofs');
  });
});

describe('the Windy Bridge: a cracked island, and the Loft under it', () => {
  it('the crack gives way to the Slam: the hero dives onto the island from above its west end, and falls into the Loft; Piercing Ink lies at the foot of the staircase', () => {
    const d = at(ROOMS, 'sp_bridge', 'loft', KIT);
    d.session.godMode = true;
    d.teleport(37.2, 5);
    d.settle();
    d.teleport(37.2, 11); // over the west end of the island, clear of the platform that is over its middle
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:sp_bridge_crack'), 90);
    d.stop();
    d.right(); // the hero stands on the lip of the island: a step toward the hole
    d.until(() => d.session.room.id === 'sp_loft', 200);
    d.stop();
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    expect(d.body.y, 'on the ledge of the Loft').toBeCloseTo(13, 1);
    d.teleport(5.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.abilities.has('relic_pierce')).toBe(true);
    expect(d.session.flags.has('taken:relic_pierce')).toBe(true);
  });

  it('a fall from the bridge anywhere else is a fall out of the world: the hole to the Loft is under the island and nowhere else', () => {
    const exit = ROOMS.sp_bridge!.exits!.find((x) => x.id === 'loft')!;
    expect(exit.requires).toBe('broken:sp_bridge_crack');
    expect(exit.rect.x1 - exit.rect.x0).toBe(3);
    expect(exit.rect.x0).toBeGreaterThan(30);
    expect(exit.rect.x1).toBeLessThan(45);
  });
});

describe('the shrines and the way home', () => {
  it('the sacristy is the first place to rest in the Spire, and the antechamber the last', () => {
    const a = at(ROOMS, 'sp_shrine', 'west', KIT);
    a.teleport(21.5, 4);
    a.settle();
    a.tap('interact');
    a.step(20);
    expect(a.session.checkpoint).toEqual({ room: 'sp_shrine', entry: 'rest' });
    const b = at(ROOMS, 'sp_approach', 'west', KIT);
    b.teleport(43.5, 2);
    b.settle();
    b.tap('interact');
    b.step(20);
    expect(b.session.checkpoint).toEqual({ room: 'sp_approach', entry: 'rest' });
  });

  it('the stone door in the Foot is shut until the lever in the antechamber is used; then the antechamber leads to the gallery behind it', () => {
    const cold = at(ROOMS, 'sp_foot', 'shortcut', KIT);
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(8);
    cold.stop();

    const d = at(ROOMS, 'sp_approach', 'west', KIT);
    d.session.godMode = true;
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:sp_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('sp_foot');
    d.right();
    d.step(80);
    d.stop();
    expect(d.body.x, 'open: past the door and on along the gallery').toBeGreaterThan(10);
  });
});

describeArena(
  ROOMS,
  {
    room: 'sp_arena',
    west: 'west',
    east: 'east',
    defeated: 'defeated:sp_boss',
    fight: '~fight:sp_boss',
    outside: 11.3,
    inside: 12,
    reward: { x: 60.5, y: 2, flag: 'taken:relic_swift' },
    onward: { exit: 'east', room: 'fd_gate', entry: 'west' },
  },
  Boss,
  { describe, it },
);
