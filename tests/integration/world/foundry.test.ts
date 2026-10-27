import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { FOUNDRY_ROOMS } from '@/content/rooms/foundry';
import { Boss } from '@/enemies/boss/Boss';
import { CATALOGS } from '@/i18n';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { chainTo, playChain } from '../../helpers/chain';
import { at, bare, describeArena, expectSound, killEnemy, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE INK FOUNDRY (src/content/rooms/foundry.ts), through the real session: ten rooms that the audit finds sound and crossable, the furnace that is a ladder of Double Jumps over spikes, the press that only the Wall Jump climbs, the cracked wall
 * on the line with the Scrapyard behind it, the door a Stoneback keeps, the shrines and the way home, and the arena of the Foundry Engine.
 */
const ROOMS = registry(FOUNDRY_ROOMS);
const BARE = registry(FOUNDRY_ROOMS.map(bare));
/** What the hero has had since the Sanctum, the Echo Chamber, the Sinkhole and the Old Forge. */
const HELD = ['air_dash', 'double_jump', 'wall_jump', 'ground_slam'];
const KIT = ['dash', ...HELD];

describe('the ten rooms', () => {
  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(FOUNDRY_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are ten different rooms with ten different pictures', () => {
    expect(FOUNDRY_ROOMS).toHaveLength(10);
    for (const r of FOUNDRY_ROOMS) for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(FOUNDRY_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(10);
  });

  it('are peopled by the machines of the foundry and what came with the stone: pistons, weavers, stonebacks, leeches and spitters', () => {
    const kinds = new Set(FOUNDRY_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => ENEMIES[s.enemy]!.ai.archetype)));
    expect([...kinds].sort()).toEqual(['guard', 'leech', 'piston', 'spitter', 'weaver']);
  });
});

describe('the Furnace: a ladder of Double Jumps over a floor of spikes', () => {
  it('without the Double Jump the first plank (4 m up) is out of reach, however the dash and the wall are used; with it the hops the solver finds are hops of the game, both ways', () => {
    const phys = new RoomPhysics(ROOMS.fd_furnace!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    expect(phys.reachFrom(west, abilitySet('dash', 'air_dash', 'wall_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(east.index), 'without the Double Jump').toBe(false);
    const has = abilitySet(...KIT);
    for (const [from, to, entry, x] of [[west, east, 'west', 55] as const, [east, west, 'east', 10] as const]) {
      const reach = phys.reachFrom(from, has);
      expect(reach.surfaces.has(to.index), `${entry}: with the Double Jump`).toBe(true);
      const d = at(BARE, 'fd_furnace', entry, KIT);
      const landings = playChain(d, phys, chainTo(reach, to.index)!, has);
      expect(landings.every((l) => l.matches), `${entry}: every hop comes down where the solver's did`).toBe(true);
      expect(Math.sign(d.body.x - 33)).toBe(Math.sign(x - 33));
    }
  });

  it('a hero who falls from the planks lands on the spikes and is hurt; the way out of them is a jump', () => {
    const d = at(ROOMS, 'fd_furnace', 'west', KIT);
    d.teleport(30, 3);
    d.step(30);
    expect(d.p.health.current).toBeLessThan(d.p.health.max);
  });
});

describe('the Press: the Wall Jump, up a clean face, past ledges of spikes', () => {
  it('without the Wall Jump the 36 m of the chimney are a wall; with it the hops the solver finds are hops of the game and the hero comes out on the block with the door', () => {
    const phys = new RoomPhysics(ROOMS.fd_press!, 'open');
    const start = phys.entrySurface('west');
    const ledge = phys.entrySurface('east');
    expect(phys.reachFrom(start, abilitySet('dash', 'air_dash', 'double_jump', 'ground_slam'), undefined, { dense: true }).surfaces.has(ledge.index), 'without the Wall Jump').toBe(false);
    const has = abilitySet(...KIT);
    const reach = phys.reachFrom(start, has);
    expect(reach.surfaces.has(ledge.index), 'with the Wall Jump').toBe(true);
    const d = at(BARE, 'fd_press', 'west', KIT);
    const landings = playChain(d, phys, chainTo(reach, ledge.index)!, has);
    expect(landings.every((l) => l.matches), 'every hop comes down where the solver\'s did').toBe(true);
    expect(d.body.y).toBeCloseTo(38, 1);
  });
});

describe('the Assembly Line: a cracked wall, and a passage behind it to the Scrapyard', () => {
  it('any blow of the sword brings the wall down for good; the passage leads to the Scrapyard, where the vessel of magic is at the end; the way back is the same door', () => {
    const d = at(ROOMS, 'fd_line', 'west', KIT);
    d.session.godMode = true; // two weavers and their creatures are on the line
    d.teleport(81, 7);
    d.settle();
    d.right();
    d.step(8);
    expect(d.body.x, 'stopped by the iron').toBeLessThan(81.7);
    d.stop();
    d.tap('attack');
    d.step(16);
    expect(d.session.flags.has('broken:fd_line_wall')).toBe(true);
    d.right();
    d.until(() => d.session.room.id === 'fd_scrap', 200);
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    const before = d.session.magic.max;
    d.teleport(36.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:mana_3')).toBe(true);
    expect(d.session.magic.max).toBe(before + 20);
    through(d, 'west');
    expect(d.session.room.id).toBe('fd_line');
    expect(d.body.x).toBeCloseTo(85.5, 1);
  });
});

describe('the Vats: a door that a Stoneback keeps', () => {
  it('the door holds until the keeper falls; its fall is remembered for good and the door opens; a room built afterwards has neither the keeper nor the door', () => {
    const d = at(ROOMS, 'fd_vats', 'west', KIT);
    d.session.godMode = true;
    d.teleport(46, 2);
    d.settle();
    d.right();
    d.step(40);
    d.stop();
    expect(d.body.x, 'stopped by the iron').toBeLessThan(47.8);
    killEnemy(d, 'stoneback', 43.5);
    expect(d.session.flags.has('defeated:fd_vats_keeper')).toBe(true);
    d.right();
    d.step(80);
    expect(d.session.room.id, 'through the door and out: the exit works').toBe('fd_workshop');

    const later = at(ROOMS, 'fd_vats', 'west', ['dash'], ['defeated:fd_vats_keeper']);
    expect(later.session.entities.filter((e) => e.kind === 'enemy' && (e as unknown as { def: { id: string } }).def.id === 'stoneback')).toHaveLength(0);
  });
});

describe('the shrines and the way home', () => {
  it('the workshop is the first place to rest in the Foundry, and the control room the last', () => {
    const a = at(ROOMS, 'fd_workshop', 'west', KIT);
    a.teleport(20.5, 2);
    a.settle();
    a.tap('interact');
    a.step(20);
    expect(a.session.checkpoint).toEqual({ room: 'fd_workshop', entry: 'rest' });
    const b = at(ROOMS, 'fd_control', 'west', KIT);
    b.teleport(48.5, 2);
    b.settle();
    b.tap('interact');
    b.step(20);
    expect(b.session.checkpoint).toEqual({ room: 'fd_control', entry: 'rest' });
  });

  it('the stone door in the Gate is shut until the lever in the control room is used; then the control room leads to the gallery behind it', () => {
    const cold = at(ROOMS, 'fd_gate', 'shortcut', KIT);
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(8);
    cold.stop();

    const d = at(ROOMS, 'fd_control', 'west', KIT);
    d.session.godMode = true;
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:fd_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('fd_gate');
    d.right();
    d.step(80);
    d.stop();
    expect(d.body.x, 'open: past the door and on along the gallery').toBeGreaterThan(10);
  });
});

describeArena(
  ROOMS,
  {
    room: 'fd_arena',
    west: 'west',
    east: 'east',
    defeated: 'defeated:fd_boss',
    fight: '~fight:fd_boss',
    outside: 11.3,
    inside: 12,
    reward: { x: 60.5, y: 2, flag: 'taken:relic_ward' },
    onward: { exit: 'east', room: 'ih_threshold', entry: 'west' },
  },
  Boss,
  { describe, it },
);
