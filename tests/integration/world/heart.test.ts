import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { HEART_ROOMS } from '@/content/rooms/heart';
import { Boss } from '@/enemies/boss/Boss';
import { CATALOGS } from '@/i18n';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { chainTo, playChain } from '../../helpers/chain';
import { at, bare, describeArena, expectSound, log, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE HEART OF THE INK (src/content/rooms/heart.ts), through the real session: seven rooms that the audit finds sound and crossable, the ladder of Double Jumps over spikes, the double chimney that only the Wall Jump climbs, the shrines and the way home, the arena of the
 * Inkheart Sovereign — and, past it, the room with the way out of the world.
 */
const ROOMS = registry(HEART_ROOMS);
const BARE = registry(HEART_ROOMS.map(bare));
/** What the hero has had since the Sanctum, the Echo Chamber, the Sinkhole and the Old Forge: all of it. */
const HELD = ['air_dash', 'double_jump', 'wall_jump', 'ground_slam'];
const KIT = ['dash', ...HELD];

describe('the seven rooms', () => {
  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(HEART_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are seven different rooms with seven different pictures', () => {
    expect(HEART_ROOMS).toHaveLength(7);
    for (const r of HEART_ROOMS) for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(HEART_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(7);
  });

  it('are peopled by the Veil Shade, the one creature that is new here, and by the weavers, tollers, wisps and the leech of the zones before: shades come back behind whoever comes close', () => {
    const kinds = new Set(HEART_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => ENEMIES[s.enemy]!.ai.archetype)));
    expect([...kinds].sort()).toEqual(['leech', 'shade', 'toller', 'weaver', 'wisp']);
    expect(HEART_ROOMS.filter((r) => (r.spawns ?? []).some((s) => ENEMIES[s.enemy]!.ai.archetype === 'shade')).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the Veins: a ladder of Double Jumps over spikes, both ways', () => {
  it('without the Double Jump the first plank is out of reach, however the dash and the wall are used; with it the hops the solver finds are hops of the game, both ways', () => {
    const phys = new RoomPhysics(ROOMS.ih_veins!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    expect(phys.reachFrom(west, abilitySet('dash', 'air_dash', 'wall_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(east.index), 'without the Double Jump').toBe(false);
    const has = abilitySet(...KIT);
    for (const [from, to, entry] of [[west, east, 'west'] as const, [east, west, 'east'] as const]) {
      const reach = phys.reachFrom(from, has);
      expect(reach.surfaces.has(to.index), `${entry}: with the Double Jump`).toBe(true);
      const d = at(BARE, 'ih_veins', entry, KIT);
      const landings = playChain(d, phys, chainTo(reach, to.index)!, has);
      expect(landings.every((l) => l.matches), `${entry}: every hop comes down where the solver's did`).toBe(true);
    }
  });
});

describe('the Ascent: two chimneys and a gallery between them', () => {
  it('without the Wall Jump the 42 m are a wall; with it the hops the solver finds are hops of the game, through the first chimney, along the gallery, through the tunnel and up the second, and the hero comes out on the slab with the door', () => {
    const phys = new RoomPhysics(ROOMS.ih_ascent!, 'open');
    const start = phys.entrySurface('bottom');
    const top = phys.entrySurface('top');
    expect(phys.reachFrom(start, abilitySet('dash', 'air_dash', 'double_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(top.index), 'without the Wall Jump').toBe(false);
    const has = abilitySet(...KIT);
    const reach = phys.reachFrom(start, has);
    expect(reach.surfaces.has(top.index), 'with the Wall Jump').toBe(true);
    const d = at(BARE, 'ih_ascent', 'bottom', KIT);
    const landings = playChain(d, phys, chainTo(reach, top.index)!, has);
    expect(landings.every((l) => l.matches), 'every hop comes down where the solver\'s did').toBe(true);
    expect(d.body.y).toBeCloseTo(44, 1);
  });
});

describe('the shrines and the way home', () => {
  it('the Pulse is the first place to rest in the Heart, the Antechamber the last before the Sovereign, and the Rest the very last', () => {
    for (const [room, x, y, id] of [['ih_shrine', 19.5, 2, 'ih_shrine'], ['ih_approach', 51.5, 2, 'ih_approach'], ['ih_end', 22.5, 2, 'ih_end']] as const) {
      const d = at(ROOMS, room, 'west', KIT);
      d.teleport(x, y);
      d.settle();
      d.tap('interact');
      d.step(20);
      expect(d.session.checkpoint, room).toEqual({ room: id, entry: 'rest' });
    }
  });

  it('the stone door in the Threshold is shut until the lever in the antechamber is used; then the antechamber leads to the gallery behind it', () => {
    const cold = at(ROOMS, 'ih_threshold', 'shortcut', KIT);
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(8);
    cold.stop();

    const d = at(ROOMS, 'ih_approach', 'west', KIT);
    d.session.godMode = true;
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:ih_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('ih_threshold');
    d.right();
    d.step(80);
    d.stop();
    expect(d.body.x, 'open: past the door and on along the gallery').toBeGreaterThan(10);
  });
});

describeArena(
  ROOMS,
  {
    room: 'ih_arena',
    west: 'west',
    east: 'east',
    defeated: 'defeated:ih_boss',
    fight: '~fight:ih_boss',
    outside: 11.3,
    inside: 12,
    onward: { exit: 'east', room: 'ih_end', entry: 'west' },
  },
  Boss,
  { describe, it },
);

describe('the way out of the world', () => {
  it('is in the last room, at the east wall, and works only once the Sovereign has fallen: touching it ends the adventure, once per touch, and leaves the hero where they stand', () => {
    const end = ROOMS.ih_end!.exits!.find((x) => x.end)!;
    expect(end.requires).toBe('defeated:ih_boss');
    expect(end.to).toBeUndefined();

    const shut = at(ROOMS, 'ih_end', 'west', KIT);
    const events = log(shut, 'adventure:ended');
    shut.teleport(37, 2);
    shut.step(4);
    expect(events, 'shut: nothing happens').toHaveLength(0);

    const open = at(ROOMS, 'ih_end', 'west', KIT, ['defeated:ih_boss']);
    const ended = log(open, 'adventure:ended');
    open.teleport(37, 2);
    open.step(2);
    expect(ended).toEqual([['adventure:ended', { roomId: 'ih_end', exitId: 'end' }]]);
    expect(open.session.room.id).toBe('ih_end');
  });
});
