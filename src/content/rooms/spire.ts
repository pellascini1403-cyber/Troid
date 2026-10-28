import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { abilityFlag } from '@/world/worldGraph';
import { lever, teach } from './kit';

/**
 * THE BELL SPIRE (docs/PROMPT21-LOG.md): a tower of bronze and stone that rises out of the mines, where the bells ring by themselves. Here the hero has everything they will have — the dash and the air dash, the two jumps in the air, the wall, the slam — and
 * the tower asks for it: shafts that only the Wall Jump climbs, a ledge that only the Double Jump reaches, a bridge over nothing. Its creatures are the Bell Toller, which tolls waves along the floor to a rhythm, the bats and the wisps. It ends with the BELL WARDEN.
 *
 *   mn_arena → sp_foot → sp_gallery → sp_stair → sp_shrine → sp_chimney → sp_belfry → sp_roofs → sp_bridge → sp_approach → sp_arena → (the Ink Foundry)
 *                ↑ ╲ a door that the lever in the antechamber opens                            ┆ cracked island ┆ shrine, lever
 *                │   └─ sp_loft (Piercing Ink, under the cracked island of the bridge) ────────┘
 */
const REGION = 'bell_spire';
/** What the squares of the canvas are made of here (the dressed stone of the spire, its flagstones and its beams): a material is a piece of art (docs/PROMPT23-LOG.md §5). */
const MATERIALS = { '#': 'masonry', G: 'flagstone', '-': 'beam' } as const;

// ---------------------------------------------------------------------------------------------------------------- the Foot
/**
 * «Pie de la Aguja»: 40 × 34 m. A courtyard at the foot of the tower with a Bell Toller in it, and the tower itself: a chimney 4 m wide and 28 m tall between a wall and a block of stone, with the door on at the top of the block. A hero without the Wall Jump
 * can only look up. At the west end, up the stairs, a gallery with a stone door in it: the way home.
 */
export function foot(): RoomDefinition {
  const c = new RoomCanvas('sp_foot', 40, 34).walls().ground(1, 39, 2);
  c.plat(1, 12, 7).plat(13, 16, 4).region('D', 8, 7, 9, 11);
  c.rock(18, 2, 20, 4);
  c.rock(23, 5, 24, 30).rock(28, 2, 39, 30);
  c.mark('a', 5, 2).mark('s', 6, 7).mark('e', 34, 30).mark('x', 21, 2).mark('p', 6, 32).mark('q', 26, 32);
  return mapRoom(
    { id: 'sp_foot', regionId: REGION, name: 'Foot of the Spire', nameKey: 'room.sp_foot.name', art: { backdrop: 'spire', seed: 38 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('toller_1', 'bell_toller', 'x', { facing: 1 }), m.spawn('bat_1', 'cave_bat', 'p', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'q')],
      gates: [m.gate('home_gate', 'home_door', 'lever:sp_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'mn_arena', entry: 'east' }),
        m.exitSide('east', 'east', 'e', { room: 'sp_gallery', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'sp_approach', entry: 'shortcut' }, { requires: 'lever:sp_lift' }),
      ],
      needs: [{ target: 'exit:east', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Gallery of Bells
/**
 * «Galería de Campanas»: 76 × 20 m. A hall 74 m long with four balconies and four Bell Tollers — two on the floor, two on the balconies — whose waves cross at their own rhythms: the floor is a rhythm to hop, the balconies are another, and a hero who
 * takes one is looked at by the other.
 */
export function gallery(): RoomDefinition {
  const c = new RoomCanvas('sp_gallery', 76, 20).walls().ground(1, 75, 2);
  c.rock(8, 2, 10, 4).rock(24, 2, 26, 4).rock(40, 2, 42, 4).rock(50, 2, 52, 4);
  c.plat(10, 18, 6).plat(26, 34, 6).plat(42, 50, 6).plat(52, 60, 6);
  c.mark('a', 5, 2).mark('b', 70, 2).mark('x', 21, 2).mark('y', 30, 6).mark('z', 47, 2).mark('w', 53, 6).mark('p', 20, 18).mark('q', 48, 18);
  return mapRoom(
    { id: 'sp_gallery', regionId: REGION, name: 'Gallery of Bells', nameKey: 'room.sp_gallery.name', art: { backdrop: 'spire', seed: 39 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'bell_toller', 'x', { facing: 1 }), m.spawn('toller_2', 'bell_toller', 'y', { facing: 1 }), m.spawn('toller_3', 'bell_toller', 'z'), m.spawn('toller_4', 'bell_toller', 'w'), m.spawn('bat_1', 'cave_bat', 'p', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'q')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'sp_foot', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'sp_stair', entry: 'bottom' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Spiral Stair
/**
 * «Escalera de Caracol»: 30 × 52 m. Seven floors of stone, 6 m apart, each with a stairwell at one end — the east, the west, the east — and the stairs in it: three planks, each 2 m above the last, that bring the hero up to the edge of the floor: the hero walks under them to the foot, at the wall, turns round and climbs back. The
 * hero crosses a floor to the stairs at its other end and climbs them; a toller at the bottom and another on the fifth floor, a bat or a wisp on the floors between.
 */
export function stair(): RoomDefinition {
  const c = new RoomCanvas('sp_stair', 30, 52).walls().ground(1, 29, 2);
  const floors = [8, 14, 20, 26, 32, 38, 44];
  floors.forEach((y, i) => {
    const east = i % 2 === 0; // which end the stairwell is at
    const below = y - 6;
    c.rock(1, y - 1, 29, y);
    // the stairs are planks, not blocks: the hero walks under them to the foot (at the wall), turns round and climbs back toward the edge of the floor above
    if (east) {
      c.air(23, y - 1, 29, y);
      c.plat(27, 29, below + 2).plat(25, 27, below + 4).plat(23, 25, below + 6);
    } else {
      c.air(1, y - 1, 7, y);
      c.plat(1, 3, below + 2).plat(3, 5, below + 4).plat(5, 7, below + 6);
    }
  });
  c.mark('a', 4, 2).mark('e', 5, 44).mark('x', 20, 2).mark('p', 14, 12).mark('q', 8, 24).mark('r', 14, 30).mark('t', 15, 38);
  return mapRoom(
    { id: 'sp_stair', regionId: REGION, name: 'Spiral Stair', nameKey: 'room.sp_stair.name', art: { backdrop: 'spire', seed: 40 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('bottom', 'a', 1), m.entry('top', 'e', 1)],
      spawns: [m.spawn('toller_1', 'bell_toller', 'x', { facing: 1 }), m.spawn('wisp_1', 'lantern_wisp', 'p'), m.spawn('bat_1', 'cave_bat', 'q'), m.spawn('wisp_2', 'lantern_wisp', 'r'), m.spawn('toller_2', 'bell_toller', 't', { facing: 1 })],
      exits: [m.exitSide('bottom', 'west', 'a', { room: 'sp_gallery', entry: 'east' }), m.exitSide('top', 'west', 'e', { room: 'sp_shrine', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Sacristy
/**
 * «Sacristía»: 36 × 16 m. A low room of stone between two climbs, with the shrine on a step at the end — the first place to rest in the Spire. No enemy; a bell somewhere above that nobody rings, and a strip of the rusted nails of the pews on the floor before the step.
 */
export function sacristy(): RoomDefinition {
  const c = new RoomCanvas('sp_shrine', 36, 16).walls().ground(1, 35, 2);
  c.rock(14, 2, 18, 3).rock(18, 2, 24, 4);
  c.spikes(9, 12, 2); // the nails of the pews
  c.mark('a', 5, 2).mark('b', 30, 2).mark('q', 19, 4).mark('r', 21, 4);
  return mapRoom(
    { id: 'sp_shrine', regionId: REGION, name: 'Sacristy', nameKey: 'room.sp_shrine.name', art: { backdrop: 'spire', seed: 41 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      exits: [m.exitSide('west', 'west', 'a', { room: 'sp_stair', entry: 'top' }), m.exitSide('east', 'east', 'b', { room: 'sp_chimney', entry: 'west' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Bronze Chimney
/**
 * «Chimenea de Bronce»: 14 × 40 m. A chimney 5 m wide and 32 m tall between a wall and a block of bronze, with ledges coming out of the block at three heights — each with a strip of spikes on it that takes the 2 m of the shaft nearest the block — and a wisp
 * hanging in the air between the second and the third. The door on is at the top of the block. The Wall Jump, and a good eye for the ledges.
 */
export function chimney(): RoomDefinition {
  const c = new RoomCanvas('sp_chimney', 14, 40).walls().ground(1, 13, 2);
  c.rock(6, 2, 13, 34); // the block
  c.rock(4, 12, 6, 13).spikes(4, 6, 13).rock(4, 20, 6, 21).spikes(4, 6, 21).rock(4, 28, 6, 29).spikes(4, 6, 29);
  c.mark('a', 4, 2).mark('e', 9, 34).mark('p', 3, 24);
  return mapRoom(
    { id: 'sp_chimney', regionId: REGION, name: 'Bronze Chimney', nameKey: 'room.sp_chimney.name', art: { backdrop: 'spire', seed: 42 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('wisp_1', 'lantern_wisp', 'p')],
      // (the door at the foot is a slit at the level of the floor, 1 m tall, and not the 4 m of the others: the one hop that climbs the chimney takes off from the foot of the block, crosses to the left wall in half a second and touches it still
      // falling, 4 m up — a door that reached 4 m took the hero who climbed back to the Sacristy, 15 cm into the first kick)
      exits: [{ ...m.exitSide('west', 'west', 'a', { room: 'sp_shrine', entry: 'east' }), rect: rect(1, 2, 3.4, 3) }, m.exitSide('east', 'east', 'e', { room: 'sp_belfry', entry: 'west' })],
      needs: [{ target: 'exit:east', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Belfry
/**
 * «Campanario»: 56 × 30 m. Two chambers under a bell the size of a house, with a stone door between them and another before the way on, and a lever for each: the first on a plank 4 m up in the air (the Double Jump), the second on a block at the top of a chimney 15 m tall
 * (the Wall Jump), and it works only once the first has been used. A toller in the first chamber, a wisp and bats in the second.
 */
export function belfry(): RoomDefinition {
  const c = new RoomCanvas('sp_belfry', 56, 30).walls().ground(1, 55, 2);
  c.plat(16, 22, 6); // the plank of the first lever, in the air: a hero walks under it, and the Double Jump gets onto it
  c.rock(24, 22, 32, 26).rock(27, 26, 29, 29); // the bell, hanging
  c.region('D', 28, 2, 29, 29).region('E', 48, 2, 49, 29); // doors to the roof: there is no climbing over a door with the Wall Jump
  c.rock(36, 5, 37, 20).rock(40, 5, 47, 20); // the chimney of the second lever: a wall, a block hanging over the floor, and a passage under it
  c.mark('a', 5, 2).mark('b', 51, 2).mark('l', 19, 6).mark('m', 43, 20).mark('x', 24, 2).mark('y', 33, 14).mark('p', 33, 28).mark('q', 44, 28);
  return mapRoom(
    { id: 'sp_belfry', regionId: REGION, name: 'Belfry', nameKey: 'room.sp_belfry.name', art: { backdrop: 'spire', seed: 43 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'bell_door_1', material: 'gate' }, E: { id: 'bell_door_2', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'bell_toller', 'x', { facing: 1 }), m.spawn('wisp_1', 'lantern_wisp', 'y'), m.spawn('bat_1', 'cave_bat', 'p', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'q')],
      gates: [m.gate('door_1', 'bell_door_1', 'lever:sp_bell_1'), m.gate('door_2', 'bell_door_2', 'lever:sp_bell_2')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'sp_chimney', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'sp_roofs', entry: 'west' }, { requires: 'lever:sp_bell_2' })],
      interactables: [lever(m, 'lever_1', 'l', 'lever:sp_bell_1'), { ...lever(m, 'lever_2', 'm', 'lever:sp_bell_2'), whenSet: 'lever:sp_bell_1' }],
      needs: [{ target: 'item:lever_1', abilities: ['double_jump'] }, { target: 'item:lever_2', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Roofs
/**
 * «Tejados»: 96 × 30 m. Out of the Belfry the way on is over the roofs of the tower: three gables of stone, stepped like stairs — 2 m a step up and 2 m a step down, and the third 3 m a step to a ledge 8 m up, where the Windy Bridge begins — with a gutter of floor between
 * them, a strip of the rusted nails of the roof in the first and a toller ringing it, and a toller on the ridge of the second. The wisp over the second gutter and the bats under the eaves make the steps a choice: up and over, or down and wait for the bell.
 */
export function roofs(): RoomDefinition {
  const c = new RoomCanvas('sp_roofs', 96, 30).walls().ground(1, 95, 2);
  // the first gable: 2 m a step to a ridge 6 m up
  c.rock(14, 2, 18, 4).rock(18, 2, 22, 6).rock(22, 2, 26, 8).rock(26, 2, 30, 6).rock(30, 2, 34, 4);
  c.spikes(37, 40, 2); // the nails of the roof, in the gutter
  // the second gable: a ridge 9 m up, in 3 m steps
  c.rock(42, 2, 46, 5).rock(46, 2, 50, 8).rock(50, 2, 54, 11).rock(54, 2, 58, 8).rock(58, 2, 62, 5);
  // the third: 2 m a step to the ledge the bridge begins on
  c.rock(70, 2, 74, 4).rock(74, 2, 78, 6).rock(78, 2, 82, 8).rock(82, 2, 95, 10);
  c.mark('a', 5, 2).mark('b', 90, 10).mark('x', 35, 2).mark('y', 52, 11).mark('w', 66, 8).mark('p', 28, 28).mark('q', 60, 28);
  return mapRoom(
    { id: 'sp_roofs', regionId: REGION, name: 'Roofs', nameKey: 'room.sp_roofs.name', art: { backdrop: 'spire', seed: 66 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'bell_toller', 'x', { facing: 1 }), m.spawn('toller_2', 'bell_toller', 'y'), m.spawn('wisp_1', 'lantern_wisp', 'w'), m.spawn('bat_1', 'cave_bat', 'p', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'q')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'sp_belfry', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'sp_bridge', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Windy Bridge
/**
 * «Pasarela del Viento»: 80 × 26 m. Eight stone platforms in the open air with nothing under them, 4 to 8 m apart, and a toller, two wisps and two bats to make every jump a choice. In the middle, 4 m under one of the platforms, a small island whose stone is
 * split: the Ground Slam breaks it and the hero falls into the Loft.
 */
export function bridge(): RoomDefinition {
  const c = new RoomCanvas('sp_bridge', 80, 26).walls().ground(1, 13, 10).ground(67, 79, 10).pit(13, 67);
  c.rock(17, 9, 23, 10).rock(28, 11, 34, 12).rock(38, 8, 42, 9).rock(46, 10, 52, 11).rock(56, 12, 62, 13); // the platforms
  c.rock(36, 4, 41, 5).region('F', 37, 4, 40, 5); // the island, 4 m below the platform at x 38…42, and the split stone in it
  c.plat(32, 36, 7); // a step from the island back up to the road
  c.mark('a', 5, 10).mark('b', 73, 10).mark('u', 40, 9).mark('k', 38, 5).mark('x', 22, 10).mark('y', 22, 16).mark('z', 48, 17).mark('p', 14, 24).mark('q', 58, 24);
  return mapRoom(
    { id: 'sp_bridge', regionId: REGION, name: 'Windy Bridge', nameKey: 'room.sp_bridge.name', art: { backdrop: 'spire', seed: 44 }, rows: c.rows(), materials: MATERIALS, regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('loft', 'u', 1)],
      spawns: [m.spawn('toller_1', 'bell_toller', 'x'), m.spawn('wisp_1', 'lantern_wisp', 'y'), m.spawn('wisp_2', 'lantern_wisp', 'z'), m.spawn('bat_1', 'cave_bat', 'p', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'q')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:sp_bridge_crack')],
      seals: [m.seal('crack', 'k', { area: rect(36.9, 4.4, 40.1, 5.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:sp_bridge_crack', needs: abilityFlag('ground_slam') })],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'sp_roofs', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'sp_approach', entry: 'west' }),
        m.exitShaft('loft', 'south', 'k', { room: 'sp_loft', entry: 'north' }, { width: 3, depth: 1, requires: 'broken:sp_bridge_crack' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Antechamber
/**
 * «Antecámara»: 52 × 22 m. The last stretch before the Warden: two tollers and bats, and at the east end the shrine — the last place to rest. On a gallery in the west, a lever: it opens the stone door in the Foot of the Spire, and from here a way leads straight
 * back to it.
 */
export function approach(): RoomDefinition {
  const c = new RoomCanvas('sp_approach', 52, 22).walls().ground(1, 51, 2);
  c.plat(1, 12, 7).plat(13, 16, 4);
  c.rock(30, 2, 32, 4).rock(34, 2, 36, 3);
  c.mark('a', 5, 2).mark('b', 46, 2).mark('s', 6, 7).mark('l', 9, 7).mark('x', 22, 2).mark('y', 25, 2).mark('p', 28, 20).mark('q', 41, 2).mark('r', 43, 2);
  return mapRoom(
    { id: 'sp_approach', regionId: REGION, name: 'Antechamber', nameKey: 'room.sp_approach.name', art: { backdrop: 'spire', seed: 45 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('toller_1', 'bell_toller', 'x', { facing: 1 }), m.spawn('toller_2', 'bell_toller', 'y'), m.spawn('bat_1', 'cave_bat', 'p')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'sp_bridge', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'sp_arena', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'sp_foot', entry: 'shortcut' }, { requires: 'lever:sp_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:sp_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Summit
/**
 * «Cima de la Aguja»: 72 × 36 m. The arena of the BELL WARDEN: 53 m of floor under a roof 34 m up — it hangs 3.6 m above the floor and falls on the hero, and is within reach only where it falls — between two doors that shut when the fight begins and open when it
 * ends. When it falls the Swift Sash lies where it hung (the dash ready again sooner), and the way on, to the Ink Foundry, works.
 */
export function summit(): RoomDefinition {
  const c = new RoomCanvas('sp_arena', 72, 36).walls().ground(1, 71, 2);
  c.region('A', 8, 2, 9, 35).region('B', 65, 2, 66, 35); // doors to the roof
  c.mark('a', 4, 2).mark('b', 67, 2).mark('l', 11, 2).mark('r', 64, 2).mark('k', 56, 2).mark('v', 60, 2);
  return mapRoom(
    { id: 'sp_arena', regionId: REGION, name: 'Summit of the Spire', nameKey: 'room.sp_arena.name', art: { backdrop: 'spire', seed: 46 }, rows: c.rows(), materials: MATERIALS, regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:sp_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:sp_boss' },
      ],
      bosses: [m.boss('bell_warden', 'boss_bell_warden', 'k', { from: 'l', to: 'r', top: 20 }, { defeatFlag: 'defeated:sp_boss', fightFlag: '~fight:sp_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 64.5, 22), bounds: rect(7, 0, 67, 34), viewHeight: 17, smoothTime: 0.8, whenClear: 'defeated:sp_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'sp_approach', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'fd_gate', entry: 'west' }, { requires: 'defeated:sp_boss' })],
      interactables: [{ ...teach(m, 'relic_swift', 'v'), whenSet: 'defeated:sp_boss' }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Loft
/**
 * «Desván»: 36 × 18 m, under the cracked island of the bridge. The hero falls onto a ledge at the top of a staircase of three platforms; at the foot of it two tollers keep the pedestal of Piercing Ink — the Spirit Bolt goes through two enemies.
 */
export function loft(): RoomDefinition {
  const c = new RoomCanvas('sp_loft', 36, 18).walls().ground(1, 35, 2);
  const tops = [4, 7, 10];
  const from = [18, 21, 24];
  tops.forEach((y, i) => c.plat(from[i]!, from[i]! + 6, y));
  c.rock(28, 12, 35, 13); // the ledge
  c.rock(3, 2, 7, 4); // the pedestal
  c.mark('n', 31, 13).mark('v', 5, 4).mark('x', 12, 2).mark('y', 17, 2);
  return mapRoom(
    { id: 'sp_loft', regionId: REGION, name: 'Loft', nameKey: 'room.sp_loft.name', art: { backdrop: 'spire', seed: 47 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('north', 'n', -1)],
      spawns: [m.spawn('toller_1', 'bell_toller', 'x', { facing: 1 }), m.spawn('toller_2', 'bell_toller', 'y')],
      exits: [m.exitShaft('north', 'north', 'n', { room: 'sp_bridge', entry: 'loft' }, { width: 6, depth: 2 })],
      interactables: [teach(m, 'relic_pierce', 'v')],
    }),
  );
}

export const SPIRE_ROOMS: readonly RoomDefinition[] = [foot(), gallery(), stair(), sacristy(), chimney(), belfry(), roofs(), bridge(), approach(), summit(), loft()];
