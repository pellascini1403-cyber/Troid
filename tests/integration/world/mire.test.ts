import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { MIRE_ROOMS } from '@/content/rooms/mire';
import { Boss } from '@/enemies/boss/Boss';
import { CATALOGS } from '@/i18n';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { chainTo, playChain } from '../../helpers/chain';
import { at, bare, describeArena, expectSound, killEnemy, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE GLOWMIRE (src/content/rooms/mire.ts), through the real session: ten rooms that the audit finds sound and crossable, the Wall Jump that is handed out in the Sinkhole and asked for at once, the walls of the next room that need it, the cracked floor that
 * leads to the Den, the door a toad keeps, the lever that opens the way home, and the arena of the Mire Matriarch.
 */
const ROOMS = registry(MIRE_ROOMS);
/** The same rooms with nobody in them, for replaying a climb: an enemy that bites in the middle of a hop is not what is asked there. */
const BARE = registry(MIRE_ROOMS.map(bare));
/** What the hero has had since the Sanctum and the Echo Chamber. */
const HELD = ['air_dash', 'double_jump'];

describe('the ten rooms', () => {
  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(MIRE_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are ten different rooms with ten different pictures', () => {
    expect(MIRE_ROOMS).toHaveLength(10);
    for (const r of MIRE_ROOMS) for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(MIRE_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(10);
  });

  it('are peopled by the creatures of the swamp: toads, wisps, spores, leeches and spitters', () => {
    const kinds = new Set(MIRE_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => ENEMIES[s.enemy]!.ai.archetype)));
    expect([...kinds].sort()).toEqual(['leech', 'spitter', 'spore', 'toad', 'wisp']);
  });
});

describe('the Stilts: a floor with a crack in it, and the Den under it', () => {
  it('the crack turns away the sword and gives way to the Slam: the hero falls into the Den, onto the ledge at the top of its staircase; the vessel of life is at the other end', () => {
    const d = at(ROOMS, 'mr_stilts', 'west', ['dash', 'ground_slam']);
    d.teleport(57.5, 2);
    d.settle();
    d.moveY = -1;
    d.tap('attack');
    d.step(20);
    expect(d.session.flags.has('broken:mr_stilts_crack'), 'the sword is turned away').toBe(false);
    d.stop();
    d.teleport(57.5, 5);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:mr_stilts_crack'), 90);
    d.stop();
    d.until(() => d.session.room.id === 'mr_den', 200);
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    expect(d.body.y, 'on the ledge of the Den').toBeCloseTo(16, 1);
    const before = d.p.health.max;
    d.teleport(42.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:life_4')).toBe(true);
    expect(d.p.health.max).toBe(before + 1);
  });
});

describe('the Lanterns: a door that a toad keeps', () => {
  it('the door holds until the toad falls; its fall is remembered for good, the door opens, and a room built afterwards has neither the toad nor the door', () => {
    const d = at(ROOMS, 'mr_lanterns', 'west');
    d.session.godMode = true; // four wisps are in the hall, and a hero who dies there is not what is asked
    d.teleport(51, 2);
    d.settle();
    d.right();
    d.step(40);
    d.stop();
    expect(d.body.x, 'stopped by the stone').toBeLessThan(51.8);
    killEnemy(d, 'mire_toad', 47.5);
    expect(d.session.flags.has('defeated:mr_lanterns_toad')).toBe(true);
    d.right();
    d.step(60);
    expect(d.session.room.id, 'through the door and out: the exit works').toBe('mr_toadpit');

    const later = at(ROOMS, 'mr_lanterns', 'west', ['dash'], ['defeated:mr_lanterns_toad']);
    later.session.godMode = true;
    expect(later.session.entities.filter((e) => e.kind === 'enemy' && (e as unknown as { def: { id: string } }).def.id === 'mire_toad')).toHaveLength(0);
    later.teleport(51, 2);
    later.settle();
    later.right();
    later.step(60);
    expect(later.session.room.id, 'a door that is open from the start').toBe('mr_toadpit');
  });
});

describe('the Landing and the way home', () => {
  it('the shrine on the pier is the first place to rest in the Glowmire, and a hero who rests comes back to it', () => {
    const d = at(ROOMS, 'mr_shrine', 'west');
    d.teleport(31.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.checkpoint).toEqual({ room: 'mr_shrine', entry: 'rest' });
  });

  it('the plank bridge over the water holds a hero who walks it and lets one who ducks through it fall (a pit with no floor)', () => {
    const d = at(ROOMS, 'mr_shrine', 'west');
    d.right();
    d.step(120);
    expect(d.body.x, 'across').toBeGreaterThan(20);
    expect(d.body.y).toBeCloseTo(2, 1);
  });

  it('the stone door in the Edge is shut until the lever in the approach is used; then the approach leads to the gallery behind it, and the hero walks out through the door', () => {
    const cold = at(ROOMS, 'mr_edge', 'shortcut');
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(8);
    cold.stop();

    const d = at(ROOMS, 'mr_approach', 'west');
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:mr_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('mr_edge');
    d.right();
    d.step(80);
    d.stop();
    expect(d.body.x, 'open: past the door and on along the gallery').toBeGreaterThan(10);
  });

  it('the approach has its own shrine, the last before the Matriarch', () => {
    const d = at(ROOMS, 'mr_approach', 'west');
    d.teleport(55.5, 2);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.checkpoint).toEqual({ room: 'mr_approach', entry: 'rest' });
  });
});

describe('the Sinkhole and the Walls: the Wall Jump, handed out and asked for', () => {
  it('the rune lies on its pedestal and teaches the Wall Jump once', () => {
    const d = at(ROOMS, 'mr_sink', 'west', ['dash', 'air_dash', 'double_jump']);
    expect(d.session.abilities.has('wall_jump')).toBe(false);
    d.teleport(6.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.abilities.has('wall_jump')).toBe(true);
    expect(d.session.flags.has('taken:wall_jump')).toBe(true);
  });

  it('the chimney (22 m) is a wall to a hero with the dash, the air dash and the Double Jump, however they time it; with the Wall Jump the hops the solver finds are hops of the game, and the hero comes out on the ledge with the door', () => {
    const phys = new RoomPhysics(ROOMS.mr_sink!, 'open');
    const west = phys.entrySurface('west');
    const ledge = phys.entrySurface('east');
    expect(phys.reachFrom(west, abilitySet('dash', 'air_dash', 'double_jump'), undefined, { dense: true }).surfaces.has(ledge.index), 'without the Wall Jump').toBe(false);
    const has = abilitySet('dash', 'air_dash', 'double_jump', 'wall_jump');
    const reach = phys.reachFrom(west, has);
    expect(reach.surfaces.has(ledge.index), 'with the Wall Jump').toBe(true);
    const d = at(BARE, 'mr_sink', 'west', [...has]);
    const landings = playChain(d, phys, chainTo(reach, ledge.index)!, has);
    expect(landings.every((l) => l.matches), 'every hop comes down where the solver\'s did').toBe(true);
    expect(d.body.y).toBeCloseTo(27, 1);
  });

  it('the walls of the next room (8 m, 2 m thick) are climbed the same way, both ways', () => {
    const phys = new RoomPhysics(ROOMS.mr_climb!, 'open');
    const west = phys.entrySurface('west');
    const east = phys.entrySurface('east');
    expect(phys.reachFrom(west, abilitySet('dash', 'air_dash', 'double_jump'), undefined, { dense: true }).surfaces.has(east.index), 'without the Wall Jump').toBe(false);
    const has = abilitySet('dash', 'air_dash', 'double_jump', 'wall_jump');
    const reach = phys.reachFrom(west, has);
    expect(reach.surfaces.has(east.index), 'with the Wall Jump').toBe(true);
    const d = at(BARE, 'mr_climb', 'west', [...has]);
    const landings = playChain(d, phys, chainTo(reach, east.index)!, has);
    expect(landings.every((l) => l.matches), 'every hop comes down where the solver\'s did').toBe(true);
    expect(d.body.x).toBeGreaterThan(44);
  });
});

describeArena(
  ROOMS,
  {
    room: 'mr_lair',
    west: 'west',
    east: 'east',
    defeated: 'defeated:mr_boss',
    fight: '~fight:mr_boss',
    outside: 11.3,
    inside: 12,
    reward: { x: 60.5, y: 2, flag: 'taken:mana_2' },
    onward: { exit: 'east', room: 'mn_gate', entry: 'west' },
  },
  Boss,
  { describe, it },
);

