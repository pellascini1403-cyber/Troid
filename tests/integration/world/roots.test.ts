import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { ROOTS_ROOMS } from '@/content/rooms/roots';
import { Boss } from '@/enemies/boss/Boss';
import { CATALOGS } from '@/i18n';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { chainTo, playChain } from '../../helpers/chain';
import { at, expectSound, log, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE SUNKEN ROOTS (src/content/rooms/roots.ts), through the real session: nine rooms that the audit finds sound and crossable, the Double Jump that is handed out in the Echo Chamber and asked for at once, the chimney of the Gallery that only the Wall Jump
 * climbs, the lever that opens the way home, the split wall with a vessel behind it, and the arena of the Root Tyrant — its doors, its flags, its reward.
 */
const ROOMS = registry(ROOTS_ROOMS);
const HELD = ['air_dash']; // what the hero has had since the Sanctum

describe('the nine rooms', () => {
  it('every room has its name in every language', () => {
    for (const r of ROOTS_ROOMS) for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
  });

  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(ROOTS_ROOMS, {}, HELD);
  });

  it('are nine different rooms with nine different pictures', () => {
    expect(ROOTS_ROOMS).toHaveLength(9);
    expect(new Set(ROOTS_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(9);
  });

  it('are peopled by the creatures of the Roots: crawlers, bats, leeches, spores and spitters — five ways to fight, none of them the same', () => {
    const kinds = new Set(ROOTS_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => ENEMIES[s.enemy]!.ai.archetype)));
    expect([...kinds].sort()).toEqual(['bat', 'crawler', 'leech', 'spitter', 'spore']);
  });

});

describe('the Echo Chamber: the Double Jump, and the pit that asks for it', () => {
  const echo = ROOMS.rt_echo!;

  it('the rune lies on the pedestal and teaches the Double Jump once, in the same press that writes the flag', () => {
    const d = at(ROOMS, 'rt_echo', 'west');
    expect(d.session.abilities.has('double_jump')).toBe(false);
    d.teleport(14.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.abilities.has('double_jump')).toBe(true);
    expect(d.session.flags.has('taken:double_jump')).toBe(true);
    expect(d.session.interaction.current).toBeNull();
  });

  it('with the dash and the air dash the plateau (4 m) is a wall, however the jump is timed; with the Double Jump the very hops the solver finds are hops of the game, and the hero lands on it', () => {
    const phys = new RoomPhysics(echo, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    const kit = abilitySet('dash', 'air_dash');
    expect(phys.reachFrom(west, kit, undefined, { dense: true }).surfaces.has(east.index), 'with the dash and the air dash').toBe(false);
    const has = abilitySet('dash', 'air_dash', 'double_jump');
    const reach = phys.reachFrom(west, has);
    expect(reach.surfaces.has(east.index), 'with the Double Jump').toBe(true);
    const chain = chainTo(reach, east.index)!;
    const d = at(ROOMS, 'rt_echo', 'west', ['dash', 'air_dash', 'double_jump']);
    const landings = playChain(d, phys, chain, has);
    for (const l of landings) expect(l.landed, `the hop from ${l.hop.from} to ${l.hop.to}`).toBe(true);
    expect(d.body.y).toBeCloseTo(6, 1);
    expect(d.body.x).toBeGreaterThan(33);
  });

  it('a hero without the Double Jump who throws everything at the plateau — a full jump with a dash in it, a short hop — stays on the floor; and the way back down is free', () => {
    const d = at(ROOMS, 'rt_echo', 'west', ['dash', 'air_dash']);
    d.teleport(31.5, 2);
    d.settle();
    d.right();
    d.press('jump');
    d.step(10);
    d.tap('dash');
    d.step(20);
    d.release('jump');
    d.stop();
    d.step(80);
    expect(d.body.y, 'still on the floor').toBeCloseTo(2, 1);
    const top = at(ROOMS, 'rt_echo', 'east');
    top.left();
    top.step(160);
    top.stop();
    top.settle();
    expect(top.body.y, 'a drop is free').toBeCloseTo(2, 1);
  });
});

describe('the Tangle: a split wall with a vessel behind it', () => {
  it('the wall is brought down by any blow of the sword, for good: the hero walks into the nook and the vessel adds a point of life', () => {
    const d = at(ROOMS, 'rt_tangle', 'west');
    const events = log(d, 'gate:changed');
    d.teleport(54, 10);
    d.settle();
    d.right();
    d.step(8);
    expect(d.body.x, 'stopped by the stone').toBeLessThan(54.7);
    d.stop();
    d.tap('attack');
    d.step(16);
    expect(d.session.flags.has('broken:rt_tangle_wall')).toBe(true);
    expect(events.some(([n, e]) => n === 'gate:changed' && (e as { gateId: string }).gateId === 'nook_gate')).toBe(true);
    d.right();
    d.step(40);
    d.stop();
    expect(d.body.x).toBeGreaterThan(56);
    const before = d.p.health.max;
    d.teleport(59.5, 10);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:life_2')).toBe(true);
    expect(d.p.health.max).toBe(before + 1);
  });
});

describe('the way home: a lever in the Cellar opens a door in the Mouth', () => {
  it('the door is shut until the lever is used; the lever sets the flag once; the Cellar then leads to the Mouth, behind the door, and the hero can walk out through it', () => {
    const cold = at(ROOMS, 'rt_mouth', 'shortcut');
    cold.teleport(24.5, 29);
    cold.settle();
    cold.left();
    cold.step(40);
    expect(cold.body.x, 'shut: the stone is in the way').toBeGreaterThan(22.3);
    cold.stop();

    const d = at(ROOMS, 'rt_cellar', 'west');
    expect(d.session.flags.has('lever:rt_lift')).toBe(false);
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:rt_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('rt_mouth');
    expect(d.body.x).toBeCloseTo(24.5, 1);
    d.left();
    d.step(80);
    d.stop();
    expect(d.body.x, 'open: through the door and on along the ledge').toBeLessThan(20);
  });

  it('the Cellar is the quiet place: a shrine, no enemy, and a rest brings the hero back to it', () => {
    const cellar = ROOMS.rt_cellar!;
    expect(cellar.spawns ?? []).toHaveLength(0);
    const d = at(ROOMS, 'rt_cellar', 'west');
    d.teleport(24.5, 2);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.checkpoint).toEqual({ room: 'rt_cellar', entry: 'rest' });
  });
});

describe('the Gallery: a chimney that only the Wall Jump climbs, and the shrine before the arena', () => {
  const gallery = ROOMS.rt_gallery!;

  it('the dash alone, the Double Jump and the air dash together do not get up it; the Wall Jump does, with hops that are hops of the game, and the hero comes out under the hole in the roof', () => {
    const phys = new RoomPhysics(gallery, 'open');
    const west = phys.entrySurface('west');
    const ledge = phys.entrySurface('hideout');
    expect(phys.reachFrom(west, abilitySet('dash', 'double_jump', 'air_dash')).surfaces.has(ledge.index), 'without the Wall Jump').toBe(false);
    const has = abilitySet('dash', 'wall_jump');
    const reach = phys.reachFrom(west, has);
    expect(reach.surfaces.has(ledge.index), 'with the Wall Jump').toBe(true);
    const chain = chainTo(reach, ledge.index)!;
    const d = at(ROOMS, 'rt_gallery', 'west', ['dash', 'wall_jump']);
    const landings = playChain(d, phys, chain, has);
    expect(landings.every((l) => l.landed)).toBe(true);
    expect(d.body.y).toBeCloseTo(17, 1);
  });

  it('the shrine is the last place to rest before the arena', () => {
    const d = at(ROOMS, 'rt_gallery', 'west');
    d.teleport(52.5, 2);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.checkpoint).toEqual({ room: 'rt_gallery', entry: 'rest' });
  });

  it('the Hideout holds the Siphon Bead: the hero who takes it can win magic back with every blow that lands', () => {
    const d = at(ROOMS, 'rt_hideout', 'south');
    d.teleport(30.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.abilities.has('relic_siphon')).toBe(true);
    expect(d.session.flags.has('taken:relic_siphon')).toBe(true);
  });
});

describe('the arena of the Root Tyrant', () => {
  const boss = (d: ReturnType<typeof at>): Boss => d.session.entities.find((e): e is Boss => e instanceof Boss)!;
  const doors = (d: ReturnType<typeof at>): boolean[] => ['door_w', 'door_e'].map((id) => d.session.collision.get(id)!.enabled);

  it('the Tyrant waits dormant with both doors open; arriving by either entrance does not wake it; the feet crossing x = 11.5 do, and shut both doors', () => {
    for (const entry of ['west', 'east']) {
      const d = at(ROOMS, 'rt_arena', entry);
      d.step(120);
      expect(boss(d).state, entry).toBe('dormant');
      expect(doors(d)).toEqual([false, false]);
    }
    const d = at(ROOMS, 'rt_arena', 'west');
    d.teleport(11.3, 2);
    d.settle();
    d.step(3);
    expect(boss(d).state).toBe('dormant');
    d.teleport(12, 2);
    d.settle();
    d.until(() => boss(d).state !== 'dormant', 30);
    expect(d.session.flags.has('~fight:rt_boss')).toBe(true);
    expect(doors(d)).toEqual([true, true]);
  });

  it('when it falls the flag is set for good, the doors open, the vessel of life appears where it stood and the way east works; a room built afterwards has no Tyrant', () => {
    const d = at(ROOMS, 'rt_arena', 'west');
    d.session.godMode = true;
    d.teleport(12, 2);
    d.settle();
    d.until(() => boss(d).state !== 'dormant', 30);
    expect(d.session.interaction.current).toBeNull();
    const b = boss(d);
    b.receiveHit({ attackId: 'test', attackerId: 'test', damage: 1e6, direction: 1, knockbackX: 0, knockbackY: 0, stun: 0, hitStop: 0, shake: 0, x: b.body.x, y: b.body.y + 1, part: 'core' });
    d.until(() => d.session.flags.has('defeated:rt_boss'), 900);
    expect(d.session.flags.has('~fight:rt_boss')).toBe(false);
    d.step(2);
    expect(doors(d)).toEqual([false, false]);
    d.teleport(60.5, 2);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:life_3')).toBe(true);

    const later = at(ROOMS, 'rt_arena', 'west', ['dash'], ['defeated:rt_boss', 'taken:life_3']);
    expect(later.session.entities.some((e) => e instanceof Boss)).toBe(false);
  });
});
