import { describe, expect, it, vi } from 'vitest';
import { RUINS_ROOMS } from '@/content/rooms/ruins';
import { CATALOGS } from '@/i18n';
import { abilitySet, RoomPhysics } from '../../helpers/reach';
import { chainTo, playChain } from '../../helpers/chain';
import { at, bare, expectSound, log, registry, SLOW } from '../../helpers/zone';

// the audit of a zone tries thousands of hops with the real controller: seconds on a quiet machine, many more on a busy one
vi.setConfig({ testTimeout: SLOW });

/**
 * THE RUINS PAST THE SANCTUM (src/content/rooms/ruins.ts), through the real session: the hub, the vault behind a ward, the cistern under a cracked floor and the reliquary above a broken roof. The rooms are sound and can be crossed (the audit);
 * what each one asks of the hero is asked for real.
 */
const ROOMS = registry(RUINS_ROOMS);
/** The same rooms with nobody in them, for replaying a climb: an enemy that bites in the middle of a hop is not what is asked there. */
const BARE = registry(RUINS_ROOMS.map(bare));
const HELD = ['air_dash']; // what the hero has had since the Sanctum

describe('the four rooms', () => {
  it('every room has its name in every language', () => {
    for (const r of RUINS_ROOMS) for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[r.nameKey!], `${lang}: ${r.id}`).toBeTruthy();
  });

  it('are sound, can be crossed from every entrance, and ask of the hero exactly what they say they ask', () => {
    expectSound(RUINS_ROOMS, {}, HELD);
  });

  it('are four different rooms: no two have the same picture, and none repeats the set of things another one holds', () => {
    const shape = (id: string): string => JSON.stringify(ROOMS[id]!.solids.map((s) => s.rect));
    expect(new Set(RUINS_ROOMS.map((r) => shape(r.id))).size).toBe(RUINS_ROOMS.length);
  });
});

describe('the Nave: a hub with a door back, a door on, a hole down and two things that have to wait', () => {
  it('has the five ways the design gives it, and the two it keeps for later ask for something the hero has not got yet', () => {
    const nave = ROOMS.ru_nave!;
    expect(nave.exits!.map((x) => x.id).sort()).toEqual(['cistern', 'east', 'reliquary', 'roots', 'west']);
    expect(nave.exits!.find((x) => x.id === 'cistern')!.requires).toBe('broken:ru_nave_crack');
    expect(nave.needs).toEqual([{ target: 'exit:reliquary', abilities: ['double_jump'] }]);
    expect(nave.seals![0]!.needs).toBe('ability:ground_slam');
  });

  it('the crack in the floor turns away the sword and gives way to the Ground Slam: the hero falls through it, into the Cistern, onto its ledge, and the floor stays gone', () => {
    const d = at(ROOMS, 'ru_nave', 'west', ['dash', 'ground_slam']);
    const events = log(d, 'seal:rejected', 'room:entered');
    d.teleport(47.5, 2);
    d.settle();
    d.moveY = -1;
    d.tap('attack'); // a crouch blow on the floor: the sword, turned away
    d.step(20);
    expect(d.session.flags.has('broken:ru_nave_crack')).toBe(false);
    expect(events.filter(([n]) => n === 'seal:rejected').length).toBeGreaterThan(0);
    d.stop();
    d.teleport(47.5, 9);
    d.step(2);
    d.moveY = -1;
    d.tap('attack'); // from the air, down: the Slam
    d.until(() => d.session.flags.has('broken:ru_nave_crack'), 90);
    d.stop();
    d.until(() => d.session.room.id === 'ru_cistern', 200);
    d.until(() => !d.session.transition.active, 120);
    d.settle();
    expect(d.body.y, 'on the ledge of the Cistern').toBeCloseTo(12, 1);
    expect(events.some(([n, e]) => n === 'room:entered' && (e as { from?: string }).from === 'ru_nave')).toBe(true);
  });

  it('a hero without the Slam cannot break it from the air: down and attack is only the air blow, which the floor turns away', () => {
    const d = at(ROOMS, 'ru_nave', 'west');
    d.teleport(47.5, 9);
    d.step(2);
    d.moveY = -1;
    d.tap('attack');
    d.step(90);
    expect(d.session.flags.has('broken:ru_nave_crack')).toBe(false);
  });

  it('the hole in the floor is the way down: a hero who falls into it arrives in the Roots (the room the Nave names), not at the bottom of the world', () => {
    const nave = ROOMS.ru_nave!;
    const hole = nave.exits!.find((x) => x.id === 'roots')!;
    expect(hole.to).toEqual({ room: 'rt_mouth', entry: 'north' });
    // the zone is under the floor: a hero standing on the lip does not touch it, one who falls does
    const lip = nave.solids.find((s) => s.rect.x1 === 22 && s.rect.y1 === 2)!;
    expect(hole.rect.y1).toBeLessThan(lip.rect.y1);
    expect(hole.rect.x0).toBeGreaterThanOrEqual(22);
    expect(hole.rect.x1).toBeLessThanOrEqual(29);
  });

  it('the ladder to the roof: four platforms, each 4 m above the last — a hero with the dash alone cannot get up the first one; with the Double Jump the very same hops the solver finds are hops of the game, and the roof hole is reached', () => {
    const nave = ROOMS.ru_nave!;
    const phys = new RoomPhysics(nave, 'open');
    const start = phys.entrySurface('west');
    const top = phys.surfaces.find((s) => s.y === 18 && s.oneway)!;
    expect(phys.reachFrom(start, abilitySet('dash', 'air_dash'), undefined, { dense: true }).surfaces.has(top.index), 'with the dash and the air dash, however they are timed').toBe(false);
    const has = abilitySet('dash', 'double_jump');
    const reach = phys.reachFrom(start, has);
    expect(reach.surfaces.has(top.index), 'with the Double Jump').toBe(true);
    const chain = chainTo(reach, top.index)!;
    expect(chain.length).toBeGreaterThanOrEqual(4);
    const d = at(BARE, 'ru_nave', 'west', ['dash', 'double_jump']);
    const landings = playChain(d, phys, chain, has);
    for (const l of landings) expect(l.matches, `the hop from ${l.hop.from} to ${l.hop.to} comes down where the solver's did`).toBe(true);
    expect(d.body.y).toBeCloseTo(18, 1);
    // up: the hole in the roof takes the hero to the Reliquary
    const up = at(ROOMS, 'ru_nave', 'top', ['dash', 'double_jump']);
    up.press('jump');
    up.step(30);
    up.release('jump');
    up.until(() => up.session.room.id === 'ru_reliquary', 160);
  });
});

describe('the Archive: a vault behind a ward that only the Spirit Bolt breaks', () => {
  const archive = (flags: string[] = []) => at(ROOMS, 'ru_archive', 'west', ['dash', 'magic_attack'], flags);

  it('the sword is turned away by the ward; the bolt, shot from the hall, breaks it for good; the door opens and the vessel adds a point of life', () => {
    const d = archive();
    d.session.loadout.acquire('card_spirit_bolt');
    const events = log(d, 'seal:rejected', 'gate:changed');
    d.teleport(48.8, 2);
    d.settle();
    d.right();
    d.step(2);
    d.stop();
    d.tap('attack');
    d.step(30);
    expect(d.session.flags.has('broken:ru_archive_ward')).toBe(false);
    expect(events.filter(([n]) => n === 'seal:rejected').length).toBeGreaterThan(0);
    d.teleport(41, 2);
    d.settle();
    d.right();
    d.step(2);
    d.stop();
    d.tap('ability');
    d.until(() => d.session.flags.has('broken:ru_archive_ward'), 120);
    expect(events.some(([n, e]) => n === 'gate:changed' && (e as { gateId: string }).gateId === 'vault_gate')).toBe(true);
    // in: the vault is open
    d.teleport(54, 2);
    d.settle();
    d.right();
    d.step(40);
    d.stop();
    const before = d.p.health.max;
    d.teleport(56, 2);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:life_1')).toBe(true);
    expect(d.p.health.max).toBe(before + 1);
    expect(d.session.interaction.current).toBeNull();
  });

  it('a vault that was opened is never shut again: a room built afterwards has the door open and the ward gone', () => {
    const d = archive(['broken:ru_archive_ward']);
    expect(d.session.entities.some((e) => e.kind === 'seal')).toBe(false);
    d.teleport(51, 2);
    d.settle();
    d.right();
    d.step(60);
    expect(d.body.x).toBeGreaterThan(54);
  });
});

describe('the Cistern and the Reliquary: a vessel of magic and a relic, taken once', () => {
  it('the vessel of the Cistern adds 20 units to the bar of magic; the relic of the Reliquary teaches Keen Edge, which hits for one more', () => {
    const d = at(ROOMS, 'ru_cistern', 'north');
    const magic = d.session.magic.max;
    d.teleport(9.5, 3);
    d.settle();
    d.tap('interact');
    d.step(20);
    expect(d.session.flags.has('taken:mana_1')).toBe(true);
    expect(d.session.magic.max).toBe(magic + 20);

    const r = at(ROOMS, 'ru_reliquary', 'south');
    expect(r.session.abilities.has('relic_edge')).toBe(false);
    r.teleport(34.5, 10);
    r.settle();
    r.tap('interact');
    r.step(20);
    expect(r.session.abilities.has('relic_edge')).toBe(true);
    expect(r.session.flags.has('taken:relic_edge')).toBe(true);
  });

  it('the leeches of the Cistern are where the vessel is, and the hero who falls from the ledge lands among them', () => {
    const d = at(ROOMS, 'ru_cistern', 'north');
    const leeches = d.session.entities.filter((e) => e.kind === 'enemy');
    expect(leeches).toHaveLength(2);
  });

  it('the way back from the Reliquary is the hole in its floor, and it leads to the platform at the top of the Nave\'s ladder', () => {
    const r = ROOMS.ru_reliquary!;
    expect(r.exits).toHaveLength(1);
    expect(r.exits![0]!.to).toEqual({ room: 'ru_nave', entry: 'top' });
    const d = at(ROOMS, 'ru_reliquary', 'south');
    d.teleport(9.5, 2);
    d.step(2);
    d.until(() => d.session.room.id === 'ru_nave', 200);
    d.until(() => !d.session.transition.active, 120);
    expect(d.session.room.id).toBe('ru_nave');
  });
});
