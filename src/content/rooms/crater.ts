import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { abilityFlag } from '@/world/worldGraph';
import { lever, vessel } from './kit';

/**
 * THE EMBER CRATER (docs/PROMPT23-LOG.md §7): the spheres are dying and the light comes from below. The hero goes down into a caldera of black basalt, cracked with fire, where lava is no longer a pool in a floor but the floor: a stair of banks with a pool before each step, a ladder of planks
 * over a lake with pistons hanging over it, a river 106 m wide to cross in leaps of six and seven metres, a forge with two levers that ask for the Double Jump and the Wall Jump and a pool between them, a room with a river on top of it and a tunnel under it, and a mountain standing in the lava. The creatures are
 * heavier here (Basalt Guards, Magma Toads, Magma Pistons). It ends with the CRATER BEHEMOTH.
 *
 *   og_arena → ec_rim → ec_slope → ec_river → ec_shrine → ec_forge → ec_tunnel → ec_caldera → ec_approach → ec_arena → (the Cinder Throne)
 *                ↑ ╲ a door that the lever in the approach opens   ┆ shrine ┆ two levers ┆ …                             ┆ cracked stone ┆ shrine, lever
 *                │   └───────────────────────────────────────────────────────────────────────────────────────────────┘        ec_cache (a vessel of life, under the cracked stone of the mountain)
 */
const REGION = 'ember_crater';
/** What the squares of the canvas are made of here (black basalt, scorched ground that is stone at the top, and volcanic glass): a material is a piece of art (docs/PROMPT23-LOG.md §7). */
const MATERIALS = { '#': 'basalt', G: 'scorch', '-': 'obsidian' } as const;

// ---------------------------------------------------------------------------------------------------------------- the Rim
/**
 * «Borde del Cráter»: 92 × 32 m. The way down into the crater: ten terraces, each 2 m lower than the one before, each a bank of 3 m and then 4 m of lava to jump to the next — a stair that is a jump at every step. Magma Toads leap the pools from two of the banks, bats hang under the roof, an ember
 * wisp floats over the middle and a Cinder Crawler keeps the ninth bank. The way back up is the same ten jumps, 2 m higher each — or, over the ledge the hero comes in by, two planks up to a gallery with a stone door in it: the way home, which the lever in the approach opens.
 */
export function rim(): RoomDefinition {
  const c = new RoomCanvas('ec_rim', 92, 32).walls().ground(82, 91, 2);
  c.rock(1, 21, 12, 22);
  c.plat(12, 16, 24).plat(10, 15, 26).rock(1, 26, 10, 27).region('D', 10, 26, 11, 31); // (the gallery: two planks up from the ledge and a cell with a stone door in it)
  for (let k = 1; k <= 10; k++) {
    const x0 = 12 + 7 * (k - 1);
    const top = 22 - 2 * k;
    c.rock(x0, 1, x0 + 7, top);
    c.pool(x0 + 3, x0 + 7, top);
  }
  c.mark('a', 5, 22).mark('s', 5, 27).mark('b', 87, 2).mark('t', 27, 16).mark('u', 55, 8).mark('z', 40, 30).mark('y', 66, 30).mark('w', 47, 14).mark('g', 69, 4);
  return mapRoom(
    { id: 'ec_rim', regionId: REGION, name: 'Crater Rim', nameKey: 'room.ec_rim.name', art: { backdrop: 'crater', seed: 91 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('toad_1', 'magma_toad', 't', { facing: 1 }), m.spawn('toad_2', 'magma_toad', 'u', { facing: 1 }), m.spawn('bat_1', 'ash_bat', 'z', { facing: 1 }), m.spawn('bat_2', 'ash_bat', 'y'), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('crawler_1', 'cinder_crawler', 'g')],
      gates: [m.gate('home_gate', 'home_door', 'lever:ec_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'og_arena', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'ec_slope', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'ec_approach', entry: 'shortcut' }, { requires: 'lever:ec_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Slope
/**
 * «Ladera»: 40 × 56 m. A lake of lava and, over it, a ladder of twelve planks that climbs the inside of the crater — 4 m above one another, the ones on the left and the ones on the right, a stone ledge to stand on every third — with Magma Pistons hanging over it that follow whoever climbs and drop on them,
 * ember wisps in the air and a bat under the roof. Every step up is a Double Jump; a fall is a burn and a walk back to the last stone.
 */
export function slope(): RoomDefinition {
  const c = new RoomCanvas('ec_slope', 40, 56).walls().ground(1, 9, 2);
  c.lava(9, 39, 1, 1).islet(10, 13, 3);
  for (let i = 0; i < 12; i++) {
    const x0 = i % 2 === 0 ? 13 : 21;
    const y = 6 + 4 * i;
    if (i % 3 === 2) c.rock(x0, y - 1, x0 + 6, y);
    else c.plat(x0, x0 + 6, y);
  }
  c.rock(27, 49, 38, 50);
  c.mark('a', 5, 2).mark('e', 31, 50).mark('p', 17, 24).mark('q', 14, 34).mark('x', 24, 14).mark('y', 16, 32).mark('w', 24, 38).mark('z', 20, 54);
  return mapRoom(
    { id: 'ec_slope', regionId: REGION, name: 'Slope', nameKey: 'room.ec_slope.name', art: { backdrop: 'crater', seed: 92 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'q'), m.spawn('wisp_1', 'ember_wisp', 'x'), m.spawn('wisp_2', 'ember_wisp', 'y'), m.spawn('wisp_3', 'ember_wisp', 'w'), m.spawn('bat_1', 'ash_bat', 'z')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ec_rim', entry: 'east' }), m.exitSide('east', 'east', 'e', { room: 'ec_river', entry: 'west' })],
      needs: [{ target: 'exit:east', abilities: ['double_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the River of Fire
/**
 * «Río de Fuego»: 130 × 26 m. The widest lava in the world — 106 m of it — crossed on nine stones, each 6 or 7 m from the next: a running jump and a dash at every one, no stone to stand on between. Two Ash Tollers keep the two broad stones, two Magma Pistons hang over the narrow ones and ember
 * wisps drift over the water.
 */
export function river(): RoomDefinition {
  const c = new RoomCanvas('ec_river', 130, 26).walls().ground(1, 12, 2).ground(118, 129, 2);
  c.lava(12, 118, 1, 1);
  c.islet(18, 21, 2).islet(27, 30, 3).islet(37, 40, 2).islet(46, 56, 2).islet(63, 66, 4).islet(73, 76, 3).islet(83, 87, 5).islet(93, 103, 2).islet(110, 113, 3);
  c.mark('a', 5, 2).mark('b', 124, 2).mark('k', 51, 3).mark('l', 98, 3).mark('p', 38, 12).mark('q', 75, 13).mark('w', 58, 9).mark('x', 90, 10);
  return mapRoom(
    { id: 'ec_river', regionId: REGION, name: 'River of Fire', nameKey: 'room.ec_river.name', art: { backdrop: 'crater', seed: 93 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 'k'), m.spawn('toller_2', 'ash_toller', 'l'), m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'q'), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('wisp_2', 'ember_wisp', 'x')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ec_slope', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ec_shrine', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Refuge
/**
 * «Refugio»: 44 × 24 m. A dais of black basalt on the far bank of the river with the shrine on it — the first place to rest in the Crater, and the only quiet in it. No creature; the glow of the lava on the walls.
 */
export function shrine(): RoomDefinition {
  const c = new RoomCanvas('ec_shrine', 44, 24).walls().ground(1, 43, 2);
  c.rock(14, 2, 30, 4).rock(18, 4, 26, 5);
  c.mark('a', 5, 2).mark('b', 38, 2).mark('q', 20, 5).mark('r', 23, 5);
  return mapRoom(
    { id: 'ec_shrine', regionId: REGION, name: 'Refuge', nameKey: 'room.ec_shrine.name', art: { backdrop: 'crater', seed: 94 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ec_river', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ec_forge', entry: 'west' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Volcanic Forge
/**
 * «Forja Volcánica»: 84 × 34 m. Three chambers with a stone door between each, and a lever for each door: the first on a plank 4 m up in the air (the Double Jump), the second on a block at the top of a chimney 15 m tall (the Wall Jump), and it works only once the first has been used. Between the
 * two doors a pool of lava 10 m wide with two stones in it, and the chimney is at the far end of it. A Basalt Guard in the first chamber, a wisp and a toller in the second, bats under the roof.
 */
export function forge(): RoomDefinition {
  const c = new RoomCanvas('ec_forge', 84, 34).walls().ground(1, 83, 2);
  c.plat(14, 20, 6);
  c.rock(22, 24, 30, 28).rock(25, 28, 27, 33);
  c.region('D', 40, 2, 41, 33).region('E', 74, 2, 75, 33);
  c.pool(44, 54).islet(46, 49, 2).islet(51, 53, 3);
  c.rock(58, 5, 59, 20).rock(62, 5, 69, 20);
  c.mark('a', 5, 2).mark('b', 79, 2).mark('l', 17, 6).mark('m', 65, 20).mark('x', 30, 2).mark('y', 56, 2).mark('w', 50, 10).mark('p', 34, 32).mark('q', 50, 32);
  return mapRoom(
    { id: 'ec_forge', regionId: REGION, name: 'Volcanic Forge', nameKey: 'room.ec_forge.name', art: { backdrop: 'crater', seed: 95 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'forge_door_1', material: 'gate' }, E: { id: 'forge_door_2', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('guard_1', 'basalt_guard', 'x', { facing: 1 }), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('toller_1', 'ash_toller', 'y'), m.spawn('bat_1', 'ash_bat', 'p', { facing: 1 }), m.spawn('bat_2', 'ash_bat', 'q')],
      gates: [m.gate('door_1', 'forge_door_1', 'lever:ec_forge_1'), m.gate('door_2', 'forge_door_2', 'lever:ec_forge_2')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ec_shrine', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ec_tunnel', entry: 'west' }, { requires: 'lever:ec_forge_2' })],
      interactables: [lever(m, 'lever_1', 'l', 'lever:ec_forge_1'), { ...lever(m, 'lever_2', 'm', 'lever:ec_forge_2'), whenSet: 'lever:ec_forge_1' }],
      needs: [{ target: 'item:lever_1', abilities: ['double_jump'] }, { target: 'item:lever_2', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Tunnel
/**
 * «Bajo el Río»: 104 × 28 m. Two ways through one mountain. Over it, a river of lava 76 m wide with six stones to cross it and magma pistons hanging over it; under it, a tunnel 100 m long that a shaft at each end leads down to — a drop — and that the Wall Jump climbs out of at the other end, with a Basalt
 * Guard, a spitter and a toller in it and not a drop of lava.
 */
export function tunnel(): RoomDefinition {
  const c = new RoomCanvas('ec_tunnel', 104, 28).walls().ground(1, 103, 14);
  c.air(2, 2, 102, 7);
  c.air(8, 7, 12, 14).air(92, 7, 96, 14);
  c.plat(8, 10, 5).plat(10, 12, 8).plat(8, 10, 11).plat(92, 94, 5).plat(94, 96, 8).plat(92, 94, 11);
  c.pool(14, 90, 14).islet(18, 22, 2, 14).islet(30, 34, 2, 14).islet(42, 52, 2, 14).islet(58, 62, 2, 14).islet(68, 72, 2, 14).islet(80, 84, 2, 14);
  c.mark('a', 5, 14).mark('b', 98, 14).mark('p', 36, 22).mark('q', 66, 22).mark('w', 56, 20).mark('g', 30, 2).mark('s', 62, 2).mark('t', 86, 2);
  return mapRoom(
    { id: 'ec_tunnel', regionId: REGION, name: 'Under the River', nameKey: 'room.ec_tunnel.name', art: { backdrop: 'crater', seed: 96 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'q'), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('guard_1', 'basalt_guard', 'g', { facing: 1 }), m.spawn('spitter_1', 'slag_spitter', 's'), m.spawn('toller_1', 'ash_toller', 't')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ec_forge', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ec_caldera', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Caldera
/**
 * «Caldera»: 100 × 30 m. A mountain standing in the lava: three stones up, 3 m each, to a plateau 32 m wide and 9 m high — a toller and a Basalt Guard on the top of it — and three stones down. In the top of the plateau, a stretch of stone that is split: the Ground Slam breaks it, and
 * through the mountain is the Hornilla. Bats under the roof, a wisp in the air.
 */
export function caldera(): RoomDefinition {
  const c = new RoomCanvas('ec_caldera', 100, 30).walls().ground(1, 12, 2).ground(88, 99, 2);
  c.lava(12, 88, 1, 1);
  c.islet(14, 17, 2).islet(20, 24, 5).islet(27, 31, 8);
  c.rock(34, 1, 66, 10).air(48, 0, 52, 9).region('F', 48, 9, 52, 10);
  c.islet(69, 73, 8).islet(76, 80, 5).islet(83, 86, 2);
  c.mark('a', 5, 2).mark('b', 94, 2).mark('k', 50, 10).mark('v', 45, 10).mark('t', 63, 10).mark('g', 57, 10).mark('w', 24, 14).mark('z', 30, 28).mark('y', 74, 28);
  return mapRoom(
    { id: 'ec_caldera', regionId: REGION, name: 'Caldera', nameKey: 'room.ec_caldera.name', art: { backdrop: 'crater', seed: 97 }, rows: c.rows(), materials: MATERIALS, regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('cache', 'v', 1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 't', { facing: 1 }), m.spawn('guard_1', 'basalt_guard', 'g'), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('bat_1', 'ash_bat', 'z', { facing: 1 }), m.spawn('bat_2', 'ash_bat', 'y')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:ec_caldera_crack')],
      seals: [m.seal('crack', 'k', { area: rect(47.9, 9.4, 52.1, 10.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:ec_caldera_crack', needs: abilityFlag('ground_slam') })],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'ec_tunnel', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'ec_approach', entry: 'west' }),
        m.exitShaft('cache', 'south', 'k', { room: 'ec_cache', entry: 'north' }, { width: 3, depth: 1, requires: 'broken:ec_caldera_crack' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Approach
/**
 * «Antesala del Behemot»: 64 × 22 m. The last stretch before the Behemoth: a Basalt Guard, a Magma Toad and a Magma Piston, a pool of lava between two banks, and at the east end the shrine — the last place to rest. On a gallery in the west, a lever: it opens the stone door in the Rim.
 */
export function approach(): RoomDefinition {
  const c = new RoomCanvas('ec_approach', 64, 22).walls().ground(1, 63, 2);
  c.plat(1, 12, 7).plat(13, 16, 4);
  c.pool(24, 34).islet(26, 29, 2).islet(30, 33, 3);
  c.rock(44, 2, 46, 4);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('l', 9, 7).mark('x', 20, 2).mark('p', 30, 12).mark('q', 54, 2).mark('r', 56, 2).mark('t', 41, 2);
  return mapRoom(
    { id: 'ec_approach', regionId: REGION, name: 'Behemoth Approach', nameKey: 'room.ec_approach.name', art: { backdrop: 'crater', seed: 98 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('guard_1', 'basalt_guard', 'x', { facing: 1 }), m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('toad_1', 'magma_toad', 't')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'ec_caldera', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'ec_arena', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'ec_rim', entry: 'shortcut' }, { requires: 'lever:ec_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:ec_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Furnace
/**
 * «Horno del Behemot»: 80 × 26 m. The arena of the CRATER BEHEMOTH: 57 m of black floor between two doors that shut when the fight begins and open when it ends — a long run of floor, because it charges the length of it. Its crust cracks open when it comes down, from a stomp or from a
 * charge that ends against a wall; it throws lava from its mouth in arcs and rolls it along the floor. When it falls a vessel of life lies where it stood, and the way on — to the Cinder Throne — works.
 */
export function arena(): RoomDefinition {
  const c = new RoomCanvas('ec_arena', 80, 26).walls().ground(1, 79, 2);
  c.region('A', 8, 2, 9, 25).region('B', 69, 2, 70, 25);
  c.mark('a', 4, 2).mark('b', 75, 2).mark('l', 11, 2).mark('r', 68, 2).mark('k', 60, 2).mark('v', 64, 2);
  return mapRoom(
    { id: 'ec_arena', regionId: REGION, name: 'Behemoth Furnace', nameKey: 'room.ec_arena.name', art: { backdrop: 'crater', seed: 99 }, rows: c.rows(), materials: MATERIALS, regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:ec_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:ec_boss' },
      ],
      bosses: [m.boss('behemoth', 'boss_behemoth', 'k', { from: 'l', to: 'r', top: 14 }, { defeatFlag: 'defeated:ec_boss', fightFlag: '~fight:ec_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 68.5, 16), bounds: rect(7, 0, 71, 24), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:ec_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'ec_approach', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ct_gate', entry: 'west' }, { requires: 'defeated:ec_boss' })],
      interactables: [{ ...vessel(m, 'life_8', 'v'), whenSet: 'defeated:ec_boss' }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Hornilla
/**
 * «Hornilla»: 52 × 22 m, through the mountain of the Caldera. The hero falls onto a ledge at the top of a stair of four planks; at the foot of it, a lake of lava 18 m wide with four small stones in it between the stair and the pedestal of the last vessel of life, and two Magma Pistons hanging over the
 * stones: whoever stands on a stone is dropped on, so they do not stand.
 */
export function cache(): RoomDefinition {
  const c = new RoomCanvas('ec_cache', 52, 22).walls().ground(1, 51, 2);
  c.rock(1, 15, 6, 16);
  c.plat(5, 11, 13).plat(9, 15, 10).plat(13, 19, 7).plat(17, 23, 4);
  c.pool(24, 42).islet(26, 28, 2).islet(30, 32, 3).islet(34, 36, 2).islet(38, 40, 3);
  c.rock(44, 2, 50, 4);
  c.mark('n', 3, 16).mark('v', 47, 4).mark('p', 33, 11).mark('q', 39, 11).mark('x', 12, 2);
  return mapRoom(
    { id: 'ec_cache', regionId: REGION, name: 'Hornilla', nameKey: 'room.ec_cache.name', art: { backdrop: 'crater', seed: 100 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('north', 'n', 1)],
      spawns: [m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'q'), m.spawn('guard_1', 'basalt_guard', 'x')],
      exits: [m.exitShaft('north', 'north', 'n', { room: 'ec_caldera', entry: 'cache' }, { width: 6, depth: 2 })],
      interactables: [vessel(m, 'life_9', 'v')],
    }),
  );
}

export const CRATER_ROOMS: readonly RoomDefinition[] = [rim(), slope(), river(), shrine(), forge(), tunnel(), caldera(), approach(), arena(), cache()];
