import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { abilityFlag } from '@/world/worldGraph';
import { teach, vessel } from './kit';

/**
 * THE RUINS AFTER THE WARDEN (docs/PROMPT21-LOG.md): the four rooms of the first slice (`r1_gate` … `r4_sanctum`) are the way IN; these four are what lies past the Sanctum. The Nave is the hub of the whole world — one door back,
 * one to the Archive, a hole in the floor that is the way down into the Roots — and two things in it that cannot be done yet: a cracked stretch of floor that only the Ground Slam breaks, and a ladder of platforms to the broken roof
 * that only the Double Jump climbs. The other three rooms are what those lead to, and a seal of violet ink that the Spirit Bolt, which the hero already has, breaks.
 *
 *   r4_sanctum ⇄ ru_nave ⇄ ru_archive            the Archive holds a vessel of life behind a ward
 *                  ↓  ↑          (roots: rt_mouth)
 *                  ↓ crack floor ⇄ ru_cistern     a vessel of magic, at the bottom of a hollow of leeches (the Ground Slam)
 *                  ↑ roof hole  ⇄ ru_reliquary    Keen Edge, at the end of a field of spikes (the Double Jump)
 */
const REGION = 'ancient_forest_ruins';

// ---------------------------------------------------------------------------------------------------------------- the Nave
/**
 * «Nave Derrumbada»: 72 × 24 m. A hall whose roof has fallen in. West door (the Sanctum), east door (the Archive), a hole in the floor in the middle (the Roots, a 7 m drop that a running jump clears), and the two secrets:
 * the crack in the floor at x 46…49 (the Slam, 3 m wide) and the ladder at the east — four platforms, each 4 m above the last, which is more than a jump and less than two. Two crawlers keep the tops of the pillars and two spitters the first platforms of the ladder:
 * the floor, where the five doors of the hub put the hero, is nobody's.
 */
export function nave(): RoomDefinition {
  const c = new RoomCanvas('ru_nave', 72, 24).walls().ground(1, 71, 2).pit(22, 29).air(46, 0, 49, 1).region('F', 46, 1, 49, 2);
  c.rock(13, 2, 16, 4).rock(33, 2, 36, 3).rock(40, 2, 43, 4); // two pillars and a heap of rubble
  c.plat(53, 57, 6).plat(58, 62, 10).plat(53, 57, 14).plat(58, 62, 18); // the ladder to the roof
  c.air(59, 23, 62, 24); // the hole in the roof, over the top of it
  c.mark('a', 5, 2).mark('b', 66, 2).mark('r', 20, 2).mark('s', 44, 2).mark('t', 59, 18); // west, east, from the Roots, from the Cistern, from the Reliquary
  c.mark('p', 25, 12).mark('k', 47, 2).mark('h', 60, 20); // the middle of the pit, the crack, the roof hole
  c.mark('c', 14, 4).mark('d', 41, 4).mark('x', 54, 6).mark('y', 60, 10); // two crawlers on the pillars, two spitters on the ladder
  return mapRoom(
    {
      id: 'ru_nave',
      regionId: REGION,
      name: 'Ruins Nave',
      nameKey: 'room.ru_nave.name',
      art: { backdrop: 'ruins', seed: 5 },
      rows: c.rows(),
      regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' } },
    },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('roots', 'r', 1), m.entry('cistern', 's', -1), m.entry('top', 't', 1)],
      spawns: [m.spawn('crawler_1', 'bramble_crawler', 'c', { facing: 1 }), m.spawn('crawler_2', 'bramble_crawler', 'd'), m.spawn('spitter_1', 'ink_spitter', 'x', { facing: 1 }), m.spawn('spitter_2', 'ink_spitter', 'y')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:ru_nave_crack')],
      seals: [m.seal('crack', 'k', { area: rect(45.9, 1.4, 49.1, 2.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:ru_nave_crack', needs: abilityFlag('ground_slam') })],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'r4_sanctum', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'ru_archive', entry: 'west' }),
        m.exitShaft('roots', 'south', 'p', { room: 'rt_mouth', entry: 'north' }, { width: 6, depth: 1 }),
        m.exitShaft('cistern', 'south', 'k', { room: 'ru_cistern', entry: 'north' }, { width: 3, depth: 1, requires: 'broken:ru_nave_crack' }),
        m.exitShaft('reliquary', 'north', 'h', { room: 'ru_reliquary', entry: 'south' }, { width: 3, depth: 3 }),
      ],
      needs: [{ target: 'exit:reliquary', abilities: ['double_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Archive
/**
 * «Archivo Sellado»: 60 × 18 m. A long hall of shelves, two ink spitters on the upper ones and a crawler below, and at the east end a vault shut by a stone door with a ward in front of it: only the Spirit Bolt breaks it (the card
 * lies in the Seal Chamber, two rooms back, so the hero who comes here has it). Behind the door, a vessel of life. A dead end, and a lesson: the bolt reaches farther than the sword, so the ward is shot from the hall.
 */
export function archive(): RoomDefinition {
  const c = new RoomCanvas('ru_archive', 60, 18).walls().ground(1, 59, 2);
  c.plat(10, 16, 5).plat(20, 27, 8).plat(31, 37, 5).plat(40, 46, 8); // the shelves
  c.rock(24, 2, 27, 4); // a plinth
  c.region('D', 52, 2, 53, 11); // the door of the vault
  c.mark('a', 5, 2).mark('c', 18, 2).mark('x', 23, 8).mark('y', 43, 8).mark('w', 51, 2).mark('v', 56, 2);
  return mapRoom(
    {
      id: 'ru_archive',
      regionId: REGION,
      name: 'Sealed Archive',
      nameKey: 'room.ru_archive.name',
      art: { backdrop: 'ruins', seed: 6 },
      rows: c.rows(),
      regions: { D: { id: 'vault_door', material: 'gate' } },
    },
    (m) => ({
      entries: [m.entry('west', 'a', 1)],
      spawns: [m.spawn('crawler_1', 'bramble_crawler', 'c'), m.spawn('spitter_1', 'ink_spitter', 'x', { facing: 1 }), m.spawn('spitter_2', 'ink_spitter', 'y')],
      gates: [m.gate('vault_gate', 'vault_door', 'broken:ru_archive_ward')],
      seals: [m.seal('ward', 'w', { accepts: ['spirit_bolt'], flag: 'broken:ru_archive_ward', needs: 'taken:card_spirit_bolt' })],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ru_nave', entry: 'east' })],
      interactables: [vessel(m, 'life_1', 'v')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Cistern
/**
 * «Aljibe Hundido»: 44 × 18 m, under the crack in the Nave's floor. The hero falls in onto a ledge 10 m up, and the vessel of magic is on a pedestal at the bottom, in a hollow where two floor leeches wait in the damp — and where a
 * step too far west is a strip of spikes. The way back up is a staircase of five platforms, each 2 m above the last, climbed with the dash alone.
 */
export function cistern(): RoomDefinition {
  const c = new RoomCanvas('ru_cistern', 44, 18).walls().ground(1, 43, 2);
  c.plat(16, 25, 12).plat(26, 31, 10).plat(32, 37, 8).plat(38, 42, 6).plat(32, 37, 4); // the ledge and the staircase down to the east
  c.rock(8, 2, 11, 3); // the pedestal
  c.spikes(3, 7, 2); // beyond it, to the west
  c.mark('n', 20, 12).mark('v', 9, 3).mark('l', 14, 2).mark('m', 21, 2);
  return mapRoom(
    { id: 'ru_cistern', regionId: REGION, name: 'Sunken Cistern', nameKey: 'room.ru_cistern.name', art: { backdrop: 'ruins', seed: 7 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('north', 'n', 1)],
      spawns: [m.spawn('leech_1', 'floor_leech', 'l'), m.spawn('leech_2', 'floor_leech', 'm')],
      exits: [m.exitShaft('north', 'north', 'n', { room: 'ru_nave', entry: 'cistern' }, { width: 6, depth: 2 })],
      interactables: [vessel(m, 'mana_1', 'v')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Reliquary
/**
 * «Relicario»: 40 × 22 m, above the Nave's roof. A hole in the floor takes the hero back down; past it, a field of spikes 17 m wide that four platforms cross, each 2 m above the last, and on the last one a relic: Keen Edge, every blow of the
 * sword one point stronger. No enemy — the way here was the trial — only the cost of a fall.
 */
export function reliquary(): RoomDefinition {
  const c = new RoomCanvas('ru_reliquary', 40, 22).walls().ground(1, 39, 2).pit(8, 11);
  c.spikes(16, 34, 2); // the field
  c.plat(14, 18, 4).plat(20, 24, 6).plat(26, 30, 8).plat(32, 37, 10); // across it
  c.mark('s', 4, 2).mark('h', 9, 2).mark('r', 34, 10);
  return mapRoom(
    { id: 'ru_reliquary', regionId: REGION, name: 'Reliquary', nameKey: 'room.ru_reliquary.name', art: { backdrop: 'ruins', seed: 8 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('south', 's', 1)],
      exits: [m.exitShaft('south', 'south', 'h', { room: 'ru_nave', entry: 'top' }, { width: 3, depth: 1 })],
      interactables: [teach(m, 'relic_edge', 'r')],
    }),
  );
}

export const RUINS_ROOMS: readonly RoomDefinition[] = [nave(), archive(), cistern(), reliquary()];
