import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { abilityFlag } from '@/world/worldGraph';
import { lever, vessel } from './kit';

/**
 * THE DUSK VERGE (docs/PROMPT23-LOG.md §7): where the world goes red. The hero walks out of the last room of the Heart of the Ink into the open — a sky that goes from violet to crimson, thin crooked trees that stand on their own roots and hold spheres of red light — and the
 * ground begins to burn: the first pools of LAVA, a metre of it between a floor and the next, crossed on stones that stand in it. Lava burns once and lets go (a point of life and a short walk back to the last stone), so the Verge is where it is learned: first a pool with a stone in
 * it, then terraces with pools between them, then a river of eight stones with a toller in the middle of it and pistons over it, then a lake of lava with a ladder of planks over it that only the Double Jump climbs. The creatures are the ones that burn (`content/creaturesEmber.ts`). It ends with the DUSK SHEPHERD.
 *
 *   ih_end → dv_gate → dv_orchard → dv_ford → dv_shrine → dv_lake → dv_ruins → dv_ridge → dv_approach → dv_arena → (the Orb Grove)
 *              ↑ ╲ a door that the lever in the approach opens   ┆ shrine ┆ a climb that wants the Double Jump ┆ cracked floor ┆ shrine, lever
 *              │   └──────────────────────────────────────────────────────────────────────────────────────┘          dv_cellar (a vessel of magic, under the cracked floor of the ruins)
 */
const REGION = 'dusk_verge';
/** What the squares of the canvas are made of here (the ruins' own stone gone the red-violet of a long dusk, its ash and the charred timber): a material is a piece of art (docs/PROMPT23-LOG.md §7). */
const MATERIALS = { '#': 'cinder', G: 'ash', '-': 'charwood' } as const;

// ---------------------------------------------------------------------------------------------------------------- the Gate of Dusk
/**
 * «Portal del Ocaso»: 72 × 20 m. The first room past the Heart: open ground under a red sky, and across it the FIRST POOL OF LAVA — 12 m of it with two stones standing in it. A crawler on the west bank and one on a low wall beyond, an ember wisp over the east part. At the west
 * end, up the stairs, a gallery with a stone door in it: the way home, which the lever in the approach opens.
 */
export function gate(): RoomDefinition {
  const c = new RoomCanvas('dv_gate', 72, 20).walls().ground(1, 71, 2);
  c.plat(1, 12, 7).plat(13, 16, 4).region('D', 8, 7, 9, 11);
  c.pool(26, 38).islet(28, 31, 2).islet(33, 36, 2);
  c.rock(46, 2, 51, 4).rock(53, 2, 56, 3);
  c.mark('a', 5, 2).mark('b', 66, 2).mark('s', 6, 7).mark('x', 20, 2).mark('y', 48, 4).mark('w', 54, 7);
  return mapRoom(
    { id: 'dv_gate', regionId: REGION, name: 'Gate of Dusk', nameKey: 'room.dv_gate.name', art: { backdrop: 'dusk', seed: 70 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('crawler_1', 'cinder_crawler', 'x', { facing: 1 }), m.spawn('crawler_2', 'cinder_crawler', 'y'), m.spawn('wisp_1', 'ember_wisp', 'w')],
      gates: [m.gate('home_gate', 'home_door', 'lever:dv_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'ih_end', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'dv_orchard', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'dv_approach', entry: 'shortcut' }, { requires: 'lever:dv_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Ash Orchard
/**
 * «Huerto de Cenizas»: 88 × 26 m. The ground climbs in terraces, each one with a pool before the next step: 8 m with a stone in it on the floor, 10 m with a stone in it on the second terrace — and a spitter on each side of that one to throw across it —, and two steps up to the high
 * terrace and the way on. A crawler on the floor and an ember wisp over the terraces.
 */
export function orchard(): RoomDefinition {
  const c = new RoomCanvas('dv_orchard', 88, 26).walls().ground(1, 34, 2);
  c.pool(22, 30).islet(25, 27, 2);
  c.rock(34, 2, 40, 4).rock(40, 2, 66, 6);
  c.pool(48, 58, 6).islet(51, 55, 2, 6);
  c.rock(66, 2, 72, 8).rock(72, 2, 87, 10);
  c.mark('a', 5, 2).mark('b', 82, 10).mark('x', 19, 2).mark('p', 44, 6).mark('q', 62, 6).mark('w', 56, 12);
  return mapRoom(
    { id: 'dv_orchard', regionId: REGION, name: 'Ash Orchard', nameKey: 'room.dv_orchard.name', art: { backdrop: 'dusk', seed: 71 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('crawler_1', 'cinder_crawler', 'x', { facing: 1 }), m.spawn('spitter_1', 'slag_spitter', 'p', { facing: 1 }), m.spawn('spitter_2', 'slag_spitter', 'q'), m.spawn('wisp_1', 'ember_wisp', 'w')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'dv_gate', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'dv_ford', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Ford
/**
 * «Vado»: 100 × 18 m. A river of lava 68 m wide and eight stones to cross it, their tops from 2 to 4 m up and 3 to 10 m wide, 2 to 5 m of lava between each. On the broad stone in the middle, an Ash Toller: its rhythm along the stone is the one thing to cross at the right time. Magma pistons hang over the
 * third and the seventh stone and drop on whoever stands under them: they are a reason to keep moving, and an ember wisp floats over the water between.
 */
export function ford(): RoomDefinition {
  const c = new RoomCanvas('dv_ford', 100, 18).walls().ground(1, 15, 2).ground(83, 99, 2);
  c.lava(15, 83, 1, 1);
  c.islet(17, 20, 2).islet(24, 27, 2).islet(31, 34, 3).islet(38, 42, 3).islet(47, 57, 2).islet(62, 65, 3).islet(69, 72, 4).islet(76, 79, 3);
  c.mark('a', 5, 2).mark('b', 94, 2).mark('k', 52, 3).mark('p', 32, 11).mark('q', 70, 12).mark('w', 44, 8);
  return mapRoom(
    { id: 'dv_ford', regionId: REGION, name: 'The Ford', nameKey: 'room.dv_ford.name', art: { backdrop: 'dusk', seed: 72 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 'k'), m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'q'), m.spawn('wisp_1', 'ember_wisp', 'w')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'dv_orchard', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'dv_shrine', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Lookout
/**
 * «Mirador»: 44 × 22 m. A hill in the middle of the way with the shrine on top of it — the first place to rest in the Verge — and the whole red sky over it. An ember wisp keeps the far side.
 */
export function shrine(): RoomDefinition {
  const c = new RoomCanvas('dv_shrine', 44, 22).walls().ground(1, 43, 2);
  c.rock(8, 2, 12, 3).rock(12, 2, 32, 5).rock(32, 2, 36, 3);
  c.mark('a', 5, 2).mark('b', 38, 2).mark('q', 20, 5).mark('r', 22, 5).mark('w', 33, 10);
  return mapRoom(
    { id: 'dv_shrine', regionId: REGION, name: 'Lookout', nameKey: 'room.dv_shrine.name', art: { backdrop: 'dusk', seed: 73 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      spawns: [m.spawn('wisp_1', 'ember_wisp', 'w')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'dv_ford', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'dv_lake', entry: 'west' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Burning Lake
/**
 * «Lago Ardiente»: 72 × 48 m. A lake of lava 62 m wide under a ladder of ten planks, 4 m above one another and 2 m of air between each: every step up is a Double Jump — a plank, a plank, a stone ledge to stand on, and again — and a fall is a burn and a walk back to the last stone. At the foot, to
 * start with, two stones to cross to the first plank. Ember wisps drift over the lake, a spitter keeps a ledge and a bat hangs under the roof.
 */
export function lake(): RoomDefinition {
  const c = new RoomCanvas('dv_lake', 72, 48).walls().ground(1, 9, 2);
  c.lava(9, 71, 1, 1).islet(10, 13, 2).islet(14, 17, 3);
  for (let i = 0; i < 10; i++) {
    const x0 = 17 + 5 * i;
    const y = 6 + 4 * i;
    if (i % 3 === 2) c.rock(x0, y - 1, x0 + 3, y);
    else c.plat(x0, x0 + 3, y);
  }
  c.rock(65, 41, 71, 42);
  c.mark('a', 5, 2).mark('e', 66, 42).mark('x', 34, 22).mark('y', 59, 38).mark('p', 44, 29).mark('z', 30, 46).mark('w', 53, 14);
  return mapRoom(
    { id: 'dv_lake', regionId: REGION, name: 'Burning Lake', nameKey: 'room.dv_lake.name', art: { backdrop: 'dusk', seed: 74 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('wisp_1', 'ember_wisp', 'x'), m.spawn('spitter_1', 'slag_spitter', 'y', { facing: 1 }), m.spawn('wisp_2', 'ember_wisp', 'p'), m.spawn('bat_1', 'ash_bat', 'z'), m.spawn('wisp_3', 'ember_wisp', 'w')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'dv_shrine', entry: 'east' }), m.exitSide('east', 'east', 'e', { room: 'dv_ruins', entry: 'west' })],
      needs: [{ target: 'exit:east', abilities: ['double_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Ruins of Dusk
/**
 * «Ruinas del Ocaso»: 84 × 24 m. What the world was before the forest: a hall with its columns down, a dais in the middle of it with a split stretch of stone on top — the Ground Slam breaks it, and under it, 4 m down, is the Burnt Cellar —, two Basalt Guards on the floor
 * and two Slag Spitters on balconies of charred beams to throw over them.
 */
export function ruins(): RoomDefinition {
  const c = new RoomCanvas('dv_ruins', 84, 24).walls().ground(1, 83, 2).air(40, 0, 43, 2);
  c.rock(34, 2, 50, 4).region('F', 40, 2, 43, 4);
  c.rock(26, 2, 30, 3).rock(54, 2, 58, 3).rock(10, 2, 12, 5).rock(72, 2, 74, 4);
  c.plat(18, 26, 9).plat(58, 66, 9);
  c.mark('a', 5, 2).mark('b', 78, 2).mark('k', 41, 4).mark('v', 37, 4).mark('x', 20, 2).mark('y', 62, 2).mark('p', 22, 9).mark('q', 62, 9);
  return mapRoom(
    { id: 'dv_ruins', regionId: REGION, name: 'Ruins of Dusk', nameKey: 'room.dv_ruins.name', art: { backdrop: 'dusk', seed: 75 }, rows: c.rows(), materials: MATERIALS, regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('cellar', 'v', 1)],
      spawns: [m.spawn('guard_1', 'basalt_guard', 'x', { facing: 1 }), m.spawn('guard_2', 'basalt_guard', 'y'), m.spawn('spitter_1', 'slag_spitter', 'p', { facing: 1 }), m.spawn('spitter_2', 'slag_spitter', 'q')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:dv_ruins_crack')],
      seals: [m.seal('crack', 'k', { area: rect(39.9, 3.4, 43.1, 4.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:dv_ruins_crack', needs: abilityFlag('ground_slam') })],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'dv_lake', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'dv_ridge', entry: 'west' }),
        m.exitShaft('cellar', 'south', 'k', { room: 'dv_cellar', entry: 'north' }, { width: 3, depth: 1, requires: 'broken:dv_ruins_crack' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Ridge
/**
 * «Cresta»: 96 × 36 m. A ridge that climbs east in nine terraces, each 2 m above the one before and each with a pool of lava before the step: 4 m of lava to jump, and a step to land on. Crawlers at the foot of the steps, a spitter on the high ground, an ember wisp over the middle
 * and a toller on the eighth terrace to ring over the last of the pools.
 */
export function ridge(): RoomDefinition {
  const c = new RoomCanvas('dv_ridge', 96, 36).walls().ground(1, 9, 2);
  for (let k = 0; k < 9; k++) {
    const x0 = 9 + k * 9;
    const top = 2 + 2 * (k + 1);
    c.rock(x0, 1, k === 8 ? 95 : x0 + 9, top);
    c.pool(x0 + 1, x0 + 5, top);
  }
  c.mark('a', 5, 2).mark('b', 90, 20).mark('x', 16, 4).mark('y', 43, 10).mark('z', 62, 14).mark('w', 38, 16).mark('k', 72, 18);
  return mapRoom(
    { id: 'dv_ridge', regionId: REGION, name: 'Ridge', nameKey: 'room.dv_ridge.name', art: { backdrop: 'dusk', seed: 76 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('crawler_1', 'cinder_crawler', 'x', { facing: 1 }), m.spawn('crawler_2', 'cinder_crawler', 'y'), m.spawn('spitter_1', 'slag_spitter', 'z'), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('toller_1', 'ash_toller', 'k')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'dv_ruins', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'dv_approach', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Approach
/**
 * «Antesala del Pastor»: 64 × 20 m. The last stretch before the Shepherd: two crawlers and a Magma Piston hanging over the way, with a pool of lava between two banks, and at the east end the shrine — the last place to rest. On a gallery in the west, a lever: it opens the stone
 * door in the Gate of Dusk.
 */
export function approach(): RoomDefinition {
  const c = new RoomCanvas('dv_approach', 64, 20).walls().ground(1, 63, 2);
  c.plat(1, 12, 7).plat(13, 16, 4);
  c.pool(30, 38).islet(32, 36, 2);
  c.rock(20, 2, 22, 4).rock(44, 2, 46, 3);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('l', 9, 7).mark('x', 24, 2).mark('y', 39, 2).mark('p', 36, 11).mark('q', 53, 2).mark('r', 55, 2);
  return mapRoom(
    { id: 'dv_approach', regionId: REGION, name: 'Shepherd Approach', nameKey: 'room.dv_approach.name', art: { backdrop: 'dusk', seed: 77 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('crawler_1', 'cinder_crawler', 'x', { facing: 1 }), m.spawn('crawler_2', 'cinder_crawler', 'y'), m.spawn('piston_1', 'magma_piston', 'p')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'dv_ridge', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'dv_arena', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'dv_gate', entry: 'shortcut' }, { requires: 'lever:dv_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:dv_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Corral
/**
 * «Corral del Pastor»: 76 × 24 m. The arena of the DUSK SHEPHERD: 53 m of ash between two doors that shut when the fight begins and open when it ends. It keeps the sphere of its heart in its chest and takes it out only to throw it: for as long as a volley lasts the sphere can be hit, and for nothing
 * else. When it falls a vessel of life lies where it stood, and the way on — to the Orb Grove — works.
 */
export function arena(): RoomDefinition {
  const c = new RoomCanvas('dv_arena', 76, 24).walls().ground(1, 75, 2);
  c.region('A', 8, 2, 9, 23).region('B', 65, 2, 66, 23);
  c.mark('a', 4, 2).mark('b', 71, 2).mark('l', 11, 2).mark('r', 64, 2).mark('k', 56, 2).mark('v', 60, 2);
  return mapRoom(
    { id: 'dv_arena', regionId: REGION, name: 'Shepherd Corral', nameKey: 'room.dv_arena.name', art: { backdrop: 'dusk', seed: 78 }, rows: c.rows(), materials: MATERIALS, regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:dv_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:dv_boss' },
      ],
      bosses: [m.boss('shepherd', 'boss_shepherd', 'k', { from: 'l', to: 'r', top: 14 }, { defeatFlag: 'defeated:dv_boss', fightFlag: '~fight:dv_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 64.5, 16), bounds: rect(7, 0, 67, 24), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:dv_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'dv_approach', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'og_edge', entry: 'west' }, { requires: 'defeated:dv_boss' })],
      interactables: [{ ...vessel(m, 'life_6', 'v'), whenSet: 'defeated:dv_boss' }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Burnt Cellar
/**
 * «Bodega Quemada»: 52 × 22 m, under the split dais of the Ruins. The hero falls onto a ledge at the top of a stair of four planks; at the foot of it a Basalt Guard and a Magma Toad, and past them a pool of lava with three stones in it between the east bank and the pedestal of the vessel of magic of the
 * Verge, with a second toad on the pedestal's bank to leap at whoever goes for it.
 */
export function cellar(): RoomDefinition {
  const c = new RoomCanvas('dv_cellar', 52, 22).walls().ground(1, 51, 2);
  c.pool(12, 30).islet(26, 28, 2).islet(20, 24, 3).islet(14, 17, 2);
  c.rock(3, 2, 8, 4); // the pedestal
  c.plat(30, 36, 4).plat(34, 40, 7).plat(38, 44, 10).plat(42, 48, 13);
  c.rock(46, 15, 51, 16); // the ledge the hero falls onto
  c.mark('n', 48, 16).mark('v', 5, 4).mark('x', 40, 2).mark('g', 10, 2).mark('u', 47, 2);
  return mapRoom(
    { id: 'dv_cellar', regionId: REGION, name: 'Burnt Cellar', nameKey: 'room.dv_cellar.name', art: { backdrop: 'dusk', seed: 79 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('north', 'n', -1)],
      spawns: [m.spawn('toad_1', 'magma_toad', 'x'), m.spawn('toad_2', 'magma_toad', 'g', { facing: 1 }), m.spawn('guard_1', 'basalt_guard', 'u')],
      exits: [m.exitShaft('north', 'north', 'n', { room: 'dv_ruins', entry: 'cellar' }, { width: 6, depth: 2 })],
      interactables: [vessel(m, 'mana_4', 'v')],
    }),
  );
}

export const DUSK_ROOMS: readonly RoomDefinition[] = [gate(), orchard(), ford(), shrine(), lake(), ruins(), ridge(), approach(), arena(), cellar()];
