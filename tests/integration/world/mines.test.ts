import { describe, expect, it, vi } from 'vitest';
import { ENEMIES } from '@/content/enemies';
import { MINES_ROOMS } from '@/content/rooms/mines';
import { Boss } from '@/enemies/boss/Boss';
import { CATALOGS } from '@/i18n';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { chainTo, playChain } from '../../helpers/chain';
import { at, bare, describeArena, expectSound, registry, SLOW, through } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE CRYSTAL MINES (src/content/rooms/mines.ts), through the real session: ten rooms that the audit finds sound and crossable, the Ground Slam that is handed out in the Old Forge and asked for at once, the three cracked floors it breaks (one on the way on,
 * one in the well, one over the vault), the shrines and the lever that opens the way home, and the arena of the Crystal Colossus.
 */
const ROOMS = registry(MINES_ROOMS);
const BARE = registry(MINES_ROOMS.map(bare));
/** What the hero has had since the Sanctum, the Echo Chamber and the Sinkhole. */
const HELD = ['air_dash', 'double_jump', 'wall_jump'];
const KIT = ['dash', ...HELD];

describe('the ten rooms', () => {
  it('are sound, can be crossed from every entrance with what each one asks of the hero, and ask for exactly that', () => {
    expectSound(MINES_ROOMS, {}, HELD);
  });

  it('every room has its name in every language, and they are ten different rooms with ten different pictures', () => {
    expect(MINES_ROOMS).toHaveLength(10);
    for (const r of MINES_ROOMS) for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
    expect(new Set(MINES_ROOMS.map((r) => JSON.stringify(r.solids.map((s) => s.rect)))).size).toBe(10);
  });

  it('are peopled by the creatures of the stone: shardlings that roll, stonebacks that keep a shield, and the bats of any cave', () => {
    const kinds = new Set(MINES_ROOMS.flatMap((r) => (r.spawns ?? []).map((s) => ENEMIES[s.enemy]!.ai.archetype)));
    expect([...kinds].sort()).toEqual(['bat', 'guard', 'roller']);
  });
});

describe('the Old Forge: the Ground Slam, and the floor that asks for it', () => {
  it('the rune lies on the anvil and teaches the Slam once, in the same press that writes the flag', () => {
    const d = at(ROOMS, 'mn_forge', 'west', ['dash', ...HELD]);
    expect(d.session.abilities.has('ground_slam')).toBe(false);
    d.teleport(10.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.abilities.has('ground_slam')).toBe(true);
    expect(d.session.flags.has('taken:ground_slam')).toBe(true);
  });

  it('the split floor turns the sword away and gives way to the Slam: the hero falls into the Coal Well, onto the top platform of the staircase down, and the floor stays gone', () => {
    const d = at(ROOMS, 'mn_forge', 'west', ['dash', ...HELD, 'ground_slam']);
    d.teleport(37.5, 2);
    d.settle();
    d.moveY = -1;
    d.tap('attack');
    d.step(20);
    expect(d.session.flags.has('broken:mn_forge_crack'), 'the sword is turned away').toBe(false);
    d.stop();
    d.teleport(37.5, 8);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:mn_forge_crack'), 90);
    d.stop();
    d.until(() => d.session.room.id === 'mn_descent', 200);
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    expect(d.body.y, 'on the top platform').toBeCloseTo(18, 1);
  });

  it('a hero who has not the Slam cannot go on from the forge: down and attack in the air is only the air blow', () => {
    const d = at(ROOMS, 'mn_forge', 'west', ['dash', ...HELD]);
    d.teleport(37.5, 8);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.step(100);
    expect(d.session.flags.has('broken:mn_forge_crack')).toBe(false);
  });
});

describe('the Coal Well: a second floor to break, and the way back up through the hole', () => {
  it('the floor of the upper chamber gives way to the Slam and the hero falls into the lower one', () => {
    const d = at(ROOMS, 'mn_descent', 'north', KIT.concat('ground_slam'));
    d.teleport(18.5, 10);
    d.settle();
    d.teleport(18.5, 14);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:mn_well_crack'), 90);
    d.stop();
    d.until(() => d.body.y < 8, 120);
    d.settle();
    expect(d.body.y, 'in the lower chamber, on the last step of its staircase, which is what the hole is over').toBeCloseTo(7, 1);
  });

  it('with the floor gone, the staircase of three platforms in the lower chamber leads up through the hole to the upper floor: the very hops the solver finds are hops of the game', () => {
    const phys = new RoomPhysics(ROOMS.mn_descent!, 'open');
    const low = phys.entrySurface('east');
    const up = phys.surfaces.find((s) => Math.abs(s.y - 10) < 0.01 && s.x0 < 5)!;
    const has = abilitySet('dash');
    const reach = phys.reachFrom(low, has);
    expect(reach.surfaces.has(up.index), 'reachable with the dash alone').toBe(true);
    const d = at(BARE, 'mn_descent', 'east', ['dash'], ['broken:mn_well_crack']);
    const landings = playChain(d, phys, chainTo(reach, up.index)!, has);
    expect(landings.every((l) => l.matches), 'every hop comes down where the solver\'s did').toBe(true);
    expect(d.body.y).toBeCloseTo(10, 1);
  });
});

describe('the Crystal Hall: a plateau with a split top, and the Vault under it', () => {
  it('the crack gives way to the Slam: the hero falls into the Vault onto the ledge at the top of its staircase; the vessel of life is at the foot of it', () => {
    const d = at(ROOMS, 'mn_hall', 'west', ['dash', ...HELD, 'ground_slam']);
    d.session.godMode = true; // three stonebacks are on the plateau
    d.teleport(38.5, 8);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.until(() => d.session.flags.has('broken:mn_hall_crack'), 90);
    d.stop();
    d.until(() => d.session.room.id === 'mn_vault', 200);
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    expect(d.body.y, 'on the ledge of the Vault').toBeCloseTo(16, 1);
    const before = d.p.health.max;
    d.teleport(5.5, 4);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:life_5')).toBe(true);
    expect(d.p.health.max).toBe(before + 1);
  });

  it('the way back up from the Vault is the staircase to the ledge, and the ledge leads to the plateau of the Hall', () => {
    const v = ROOMS.mn_vault!;
    expect(v.exits).toHaveLength(1);
    expect(v.exits![0]!.to).toEqual({ room: 'mn_hall', entry: 'vault' });
    const hall = ROOMS.mn_hall!;
    expect(hall.entries.find((e) => e.id === 'vault')).toBeDefined();
  });
});

describe('the camp, the gallery and the way home', () => {
  it('the shrine on the loft of the camp is the first place to rest in the Mines', () => {
    const d = at(ROOMS, 'mn_camp', 'west');
    d.teleport(29.5, 6);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.checkpoint).toEqual({ room: 'mn_camp', entry: 'rest' });
  });

  it('the stone door in the Mine Mouth is shut until the lever in the gallery is used; then the gallery leads to the one behind the door, and the hero walks out through it', () => {
    const cold = at(ROOMS, 'mn_gate', 'shortcut');
    cold.right();
    cold.step(60);
    expect(cold.body.x, 'shut: the stone is in the way').toBeLessThan(8);
    cold.stop();

    const d = at(ROOMS, 'mn_approach', 'west');
    d.teleport(9.5, 7);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('lever:mn_lift')).toBe(true);
    through(d, 'shortcut');
    expect(d.session.room.id).toBe('mn_gate');
    d.right();
    d.step(80);
    d.stop();
    expect(d.body.x, 'open: past the door and on along the gallery').toBeGreaterThan(10);
  });

  it('the gallery has its own shrine, the last before the Colossus', () => {
    const d = at(ROOMS, 'mn_approach', 'west');
    d.teleport(55.5, 2);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.checkpoint).toEqual({ room: 'mn_approach', entry: 'rest' });
  });
});

describeArena(
  ROOMS,
  {
    room: 'mn_arena',
    west: 'west',
    east: 'east',
    defeated: 'defeated:mn_boss',
    fight: '~fight:mn_boss',
    outside: 11.3,
    inside: 12,
    reward: { x: 60.5, y: 2, flag: 'taken:relic_brew' },
    onward: { exit: 'east', room: 'sp_foot', entry: 'west' },
  },
  Boss,
  { describe, it },
);
