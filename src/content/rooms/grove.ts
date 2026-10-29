import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { abilityFlag } from '@/world/worldGraph';
import { lever, vessel } from './kit';

/**
 * THE ORB GROVE (docs/PROMPT23-LOG.md §7): the dusk, deeper and denser. The trees stand close and carry their spheres in bunches; the ground between their roots is lava, and the way is over it — a bridge that has lost its planks, a descent of planks over a river, a chimney of
 * wood, a clearing with a door that a keeper holds, an island chain with the rhythm of two tollers on it, a spring that pours out of a stone in the air. Everything the hero has learned is asked of them again, with the lava under it. It ends with the GROVE GARDENER.
 *
 *   dv_arena → og_edge → og_roots → og_trunk → og_shrine → og_clearing → og_gap → og_spring → og_canopy → og_approach → og_arena → (the Ember Crater)
 *                ↑ ╲ a door that the lever in the approach opens          ┆ a descent that wants the Double Jump back ┆ a chimney ┆ shrine ┆ a door a weaver keeps ┆ …
 *                │   └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘           og_vault (a vessel of life, under the cracked floor of the clearing)
 */
const REGION = 'orb_grove';
const MATERIALS = { '#': 'cinder', G: 'ash', '-': 'charwood' } as const;

// ---------------------------------------------------------------------------------------------------------------- the Edge of the Grove
/**
 * «Linde de la Arboleda»: 84 × 22 m. A bridge of planks over a lake of lava, 48 m of it — and a bridge that has lost its planks: five stretches of 6 m and a last of 3 m with 3 m of lava between them, the third a solid stone to stand on, a crawler on the second stretch that rushes at whoever comes and a spitter on the fifth that throws across the gaps.
 * A hero who is thrown into a gap is burned, and is put back on the last stone. At the west end, up the stairs, a gallery with a stone door in it: the way home, which the lever in the approach opens.
 */
export function edge(): RoomDefinition {
  const c = new RoomCanvas('og_edge', 84, 22).walls().ground(1, 83, 2);
  c.plat(1, 12, 7).plat(13, 16, 4).region('D', 8, 7, 9, 11);
  c.pool(18, 66);
  c.rock(16, 2, 18, 4).rock(66, 2, 68, 4);
  [18, 27, 45, 54, 63].forEach((x0) => c.plat(x0, x0 + (x0 === 63 ? 3 : 6), 4));
  c.rock(36, 1, 42, 4);
  c.mark('a', 5, 2).mark('b', 78, 2).mark('s', 6, 7).mark('x', 30, 4).mark('y', 57, 4).mark('w', 40, 10);
  return mapRoom(
    { id: 'og_edge', regionId: REGION, name: 'Edge of the Grove', nameKey: 'room.og_edge.name', art: { backdrop: 'grove', seed: 80 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('crawler_1', 'cinder_crawler', 'x'), m.spawn('spitter_1', 'slag_spitter', 'y'), m.spawn('wisp_1', 'ember_wisp', 'w')],
      gates: [m.gate('home_gate', 'home_door', 'lever:og_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'dv_arena', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'og_roots', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'og_approach', entry: 'shortcut' }, { requires: 'lever:og_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the High Roots
/**
 * «Raíces Altas»: 100 × 30 m. The hero comes in on a ledge 20 m up and the way is DOWN: four planks over a river of lava, 4 m below one another, two of them stones to stand on — a spitter on the second, wisps in the air — to the floor on the far bank, where a toller keeps the ground and a
 * crawler waits at the foot. The way down is a drop; the way back up is four Double Jumps.
 */
export function roots(): RoomDefinition {
  const c = new RoomCanvas('og_roots', 100, 30).walls().ground(46, 99, 2);
  c.lava(1, 46, 1, 1);
  c.rock(1, 21, 12, 22);
  [[14, 18], [22, 14], [30, 10], [38, 6]].forEach(([x0, y]) => c.plat(x0!, x0! + 4, y!));
  c.rock(22, 13, 26, 14).rock(38, 5, 42, 6);
  c.mark('a', 5, 22).mark('b', 94, 2).mark('p', 24, 14).mark('x', 20, 18).mark('y', 36, 12).mark('c', 58, 2).mark('k', 76, 2).mark('z', 70, 28);
  return mapRoom(
    { id: 'og_roots', regionId: REGION, name: 'High Roots', nameKey: 'room.og_roots.name', art: { backdrop: 'grove', seed: 81 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('spitter_1', 'slag_spitter', 'p', { facing: 1 }), m.spawn('wisp_1', 'ember_wisp', 'x'), m.spawn('wisp_2', 'ember_wisp', 'y'), m.spawn('crawler_1', 'cinder_crawler', 'c', { facing: 1 }), m.spawn('toller_1', 'ash_toller', 'k'), m.spawn('bat_1', 'ash_bat', 'z')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'og_edge', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'og_trunk', entry: 'west' })],
      needs: [{ target: 'exit:west', abilities: ['double_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Trunk
/**
 * «Tronco Ardiente»: 14 × 40 m. A chimney 5 m wide and 33 m tall between a wall and a block of the wood of the grove, with a ledge coming out of the block every 8 m — each one a bed of embers that takes the 2 m of the shaft nearest the block, a pool of lava let into the wood — and two ember wisps hanging in the air between. The way on
 * is at the top of the block. The Wall Jump, and a good eye for the ledges.
 */
export function trunk(): RoomDefinition {
  const c = new RoomCanvas('og_trunk', 14, 40).walls().ground(1, 13, 2);
  c.rock(6, 2, 13, 33);
  [12, 20, 28].forEach((y) => c.rock(4, y - 2, 6, y).pool(4, 6, y));
  c.mark('a', 4, 2).mark('e', 9, 33).mark('p', 3, 24).mark('r', 3, 16);
  return mapRoom(
    { id: 'og_trunk', regionId: REGION, name: 'Burning Trunk', nameKey: 'room.og_trunk.name', art: { backdrop: 'grove', seed: 82 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('wisp_1', 'ember_wisp', 'p'), m.spawn('wisp_2', 'ember_wisp', 'r')],
      exits: [{ ...m.exitSide('west', 'west', 'a', { room: 'og_roots', entry: 'east' }), rect: rect(1, 2, 3.4, 3) }, m.exitSide('east', 'east', 'e', { room: 'og_shrine', entry: 'west' })],
      needs: [{ target: 'exit:east', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Glade
/**
 * «Claro»: 48 × 26 m. A glade between two climbs, with the shrine on a dais of roots in the middle of it — the first place to rest in the Grove. No creature; a bunch of spheres hangs over the dais and nobody has taken one.
 */
export function shrine(): RoomDefinition {
  const c = new RoomCanvas('og_shrine', 48, 26).walls().ground(1, 47, 2);
  c.rock(18, 2, 30, 3).rock(21, 3, 27, 4);
  c.mark('a', 5, 2).mark('b', 42, 2).mark('q', 22, 4).mark('r', 25, 4);
  return mapRoom(
    { id: 'og_shrine', regionId: REGION, name: 'Glade', nameKey: 'room.og_shrine.name', art: { backdrop: 'grove', seed: 83 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      exits: [m.exitSide('west', 'west', 'a', { room: 'og_trunk', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'og_clearing', entry: 'west' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Clearing
/**
 * «Calvero»: 88 × 26 m. A clearing under the spheres with a stone door in the east wall: the door opens when the Cinder Weaver that keeps it falls — the same keeper as the Atrium of the Heart, with a Basalt Guard between it and the door and two planks to dodge from, and bats on the roof. In the
 * middle of the floor, a split stretch of stone: the Ground Slam breaks it, and under it is the Root Vault.
 */
export function clearing(): RoomDefinition {
  const c = new RoomCanvas('og_clearing', 88, 26).walls().ground(1, 87, 2).air(40, 0, 43, 2);
  c.rock(37, 2, 46, 3).region('F', 40, 2, 43, 3);
  c.plat(22, 30, 7).plat(54, 62, 7);
  c.region('D', 76, 2, 77, 12);
  c.mark('a', 5, 2).mark('b', 82, 2).mark('k', 41, 3).mark('v', 38, 3).mark('w', 24, 2).mark('g', 66, 2).mark('x', 18, 24).mark('y', 60, 24);
  return mapRoom(
    { id: 'og_clearing', regionId: REGION, name: 'Clearing', nameKey: 'room.og_clearing.name', art: { backdrop: 'grove', seed: 84 }, rows: c.rows(), materials: MATERIALS, regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' }, D: { id: 'keeper_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('vault', 'v', 1)],
      spawns: [m.spawn('weaver_key', 'cinder_weaver', 'w', { facing: 1, defeatFlag: 'defeated:og_clearing_keeper' }), m.spawn('guard_1', 'basalt_guard', 'g'), m.spawn('bat_1', 'ash_bat', 'x', { facing: 1 }), m.spawn('bat_2', 'ash_bat', 'y')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:og_clearing_crack'), m.gate('keeper_gate', 'keeper_door', 'defeated:og_clearing_keeper')],
      seals: [m.seal('crack', 'k', { area: rect(39.9, 2.4, 43.1, 3.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:og_clearing_crack', needs: abilityFlag('ground_slam') })],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'og_shrine', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'og_gap', entry: 'west' }, { requires: 'defeated:og_clearing_keeper' }),
        m.exitShaft('vault', 'south', 'k', { room: 'og_vault', entry: 'north' }, { width: 3, depth: 1, requires: 'broken:og_clearing_crack' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Rift
/**
 * «Hendidura»: 110 × 28 m. A lake of lava 84 m wide and ten stones to cross it, their tops from 2 to 7 m up, with the rhythm of TWO tollers — one on the first broad stone, in the middle of the lake, and one on the second, near the far bank — and a magma piston over the third stone and another over
 * the seventh, the highest. The tollers are not on the same beat. Ember wisps drift over the water.
 */
export function rift(): RoomDefinition {
  const c = new RoomCanvas('og_gap', 110, 28).walls().ground(1, 13, 2).ground(97, 109, 2);
  c.lava(13, 97, 1, 1);
  c.islet(14, 17, 2).islet(21, 24, 4).islet(28, 32, 6).islet(36, 39, 4).islet(44, 54, 2).islet(58, 61, 4).islet(65, 69, 7).islet(73, 76, 5).islet(80, 90, 2).islet(93, 96, 3);
  c.mark('a', 5, 2).mark('b', 104, 2).mark('k', 49, 3).mark('l', 85, 3).mark('p', 30, 16).mark('q', 67, 17).mark('w', 40, 10).mark('x', 76, 12);
  return mapRoom(
    { id: 'og_gap', regionId: REGION, name: 'The Rift', nameKey: 'room.og_gap.name', art: { backdrop: 'grove', seed: 85 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 'k'), m.spawn('toller_2', 'ash_toller', 'l'), m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'q'), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('wisp_2', 'ember_wisp', 'x')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'og_clearing', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'og_spring', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Spring
/**
 * «Manantial»: 64 × 30 m. A fall of lava pours out of a stone that hangs in the air and into a pool 24 m wide: the way across is over the pool, by two planks up to the stone — which is walked over, with the fall under the feet — and two planks down, with a spitter on the second plank of each side to throw across it
 * and a wisp in the air.
 */
export function spring(): RoomDefinition {
  const c = new RoomCanvas('og_spring', 64, 30).walls().ground(1, 63, 2);
  c.pool(20, 44);
  c.rock(12, 2, 16, 4);
  c.plat(17, 22, 7).plat(22, 28, 10);
  c.rock(29, 12, 35, 13);
  c.lava(30, 34, 2, 10);
  c.plat(36, 42, 10).plat(42, 47, 7);
  c.rock(48, 2, 52, 4);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('p', 25, 10).mark('q', 39, 10).mark('w', 32, 20);
  return mapRoom(
    { id: 'og_spring', regionId: REGION, name: 'Spring', nameKey: 'room.og_spring.name', art: { backdrop: 'grove', seed: 86 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('spitter_1', 'slag_spitter', 'p', { facing: 1 }), m.spawn('spitter_2', 'slag_spitter', 'q'), m.spawn('wisp_1', 'ember_wisp', 'w')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'og_gap', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'og_canopy', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Canopy
/**
 * «Dosel»: 104 × 34 m. A hall of roots with two ways through it: along the floor, between pools — three of them, 6, 8 and 10 m, two with a stone in them — or up a stair of three planks at the west end to the canopy, a walkway of planks 10 m up with gaps of 3 m. Crawlers and a toad on the floor, spitters and a wisp up in the
 * branches.
 */
export function canopy(): RoomDefinition {
  const c = new RoomCanvas('og_canopy', 104, 34).walls().ground(1, 103, 2);
  c.pool(22, 28).pool(46, 54).islet(49, 51, 2).pool(72, 82).islet(75, 79, 2);
  c.plat(9, 13, 5).plat(14, 18, 8).plat(19, 23, 11);
  [[24, 30], [33, 39], [42, 48], [51, 57], [60, 66], [69, 75], [78, 84], [87, 93]].forEach(([x0, x1]) => c.plat(x0!, x1!, 12));
  c.mark('a', 5, 2).mark('b', 98, 2).mark('x', 36, 2).mark('y', 62, 2).mark('t', 84, 2).mark('p', 35, 12).mark('q', 53, 12).mark('w', 66, 20);
  return mapRoom(
    { id: 'og_canopy', regionId: REGION, name: 'Canopy', nameKey: 'room.og_canopy.name', art: { backdrop: 'grove', seed: 87 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('crawler_1', 'cinder_crawler', 'x', { facing: 1 }), m.spawn('crawler_2', 'cinder_crawler', 'y'), m.spawn('toad_1', 'magma_toad', 't'), m.spawn('spitter_1', 'slag_spitter', 'p', { facing: 1 }), m.spawn('spitter_2', 'slag_spitter', 'q'), m.spawn('wisp_1', 'ember_wisp', 'w')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'og_spring', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'og_approach', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Approach
/**
 * «Antesala de la Madre»: 64 × 24 m. The last stretch before the Gardener: a toller, a piston over the way, a toad and a Cinder Weaver with its crawlers, a pool of lava to cross by its stones, and at the east end the shrine — the last place to rest. On a gallery in the west, a lever: it opens the stone
 * door in the Edge of the Grove.
 */
export function approach(): RoomDefinition {
  const c = new RoomCanvas('og_approach', 64, 24).walls().ground(1, 63, 2);
  c.plat(1, 12, 7).plat(13, 16, 4);
  c.pool(26, 36).islet(28, 31, 2).islet(32, 35, 3);
  c.rock(42, 2, 44, 4);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('l', 9, 7).mark('k', 22, 2).mark('p', 38, 11).mark('t', 38, 2).mark('w', 40, 2).mark('q', 54, 2).mark('r', 56, 2);
  return mapRoom(
    { id: 'og_approach', regionId: REGION, name: 'Gardener Approach', nameKey: 'room.og_approach.name', art: { backdrop: 'grove', seed: 88 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 'k', { facing: 1 }), m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('toad_1', 'magma_toad', 't'), m.spawn('weaver_1', 'cinder_weaver', 'w')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'og_canopy', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'og_arena', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'og_edge', entry: 'shortcut' }, { requires: 'lever:og_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:og_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Garden
/**
 * «Jardín de Esferas»: 76 × 26 m. The arena of the GROVE GARDENER: 53 m of ash between two doors that shut when the fight begins and open when it ends. It leaps onto where the hero stands, throws a ring of spheres, and runs a line of roots along the floor; at two thirds of its life it calls two ember
 * wisps and at a third three, and its bloom shows after a leap and after a ring. When it falls a vessel of magic lies where it stood, and the way on — to the Ember Crater — works.
 */
export function arena(): RoomDefinition {
  const c = new RoomCanvas('og_arena', 76, 26).walls().ground(1, 75, 2);
  c.region('A', 8, 2, 9, 25).region('B', 65, 2, 66, 25);
  c.mark('a', 4, 2).mark('b', 71, 2).mark('l', 11, 2).mark('r', 64, 2).mark('k', 56, 2).mark('v', 60, 2);
  return mapRoom(
    { id: 'og_arena', regionId: REGION, name: 'Spheres Garden', nameKey: 'room.og_arena.name', art: { backdrop: 'grove', seed: 89 }, rows: c.rows(), materials: MATERIALS, regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:og_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:og_boss' },
      ],
      bosses: [m.boss('gardener', 'boss_gardener', 'k', { from: 'l', to: 'r', top: 14 }, { defeatFlag: 'defeated:og_boss', fightFlag: '~fight:og_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 64.5, 16), bounds: rect(7, 0, 67, 24), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:og_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'og_approach', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ec_rim', entry: 'west' }, { requires: 'defeated:og_boss' })],
      interactables: [{ ...vessel(m, 'mana_5', 'v'), whenSet: 'defeated:og_boss' }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Root Vault
/**
 * «Cámara de Raíces»: 52 × 22 m, under the split stone of the Clearing. The hero falls onto a ledge at the top of a stair of five planks; at the foot of it, a moat of lava 14 m wide between the stair and the pedestal of a vessel of life, with two stones in it, and a Magma Toad and two Basalt Guards to
 * keep the pedestal.
 */
export function vault(): RoomDefinition {
  const c = new RoomCanvas('og_vault', 52, 22).walls().ground(1, 51, 2);
  c.pool(14, 28).islet(17, 20, 2).islet(22, 25, 3);
  c.rock(3, 2, 10, 4);
  c.plat(30, 36, 4).plat(34, 40, 7).plat(38, 44, 10).plat(42, 48, 13);
  c.rock(46, 15, 51, 16);
  c.mark('n', 48, 16).mark('v', 6, 4).mark('x', 40, 2).mark('g', 12, 2).mark('u', 45, 2);
  return mapRoom(
    { id: 'og_vault', regionId: REGION, name: 'Root Vault', nameKey: 'room.og_vault.name', art: { backdrop: 'grove', seed: 90 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('north', 'n', -1)],
      spawns: [m.spawn('toad_1', 'magma_toad', 'x'), m.spawn('guard_1', 'basalt_guard', 'g', { facing: 1 }), m.spawn('guard_2', 'basalt_guard', 'u')],
      exits: [m.exitShaft('north', 'north', 'n', { room: 'og_clearing', entry: 'vault' }, { width: 6, depth: 2 })],
      interactables: [vessel(m, 'life_7', 'v')],
    }),
  );
}

export const GROVE_ROOMS: readonly RoomDefinition[] = [edge(), roots(), trunk(), shrine(), clearing(), rift(), spring(), canopy(), approach(), arena(), vault()];
