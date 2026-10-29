import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { lever } from './kit';

/**
 * THE CINDER THRONE (docs/PROMPT23-LOG.md §7): the last place. The red has gone out of the sky and into the stone: black crimson, broken arches and towers against it, cages of thorn around dim spheres, chains. What the hero has learned of lava is asked of them in its hardest form — a causeway of three
 * stones with a guardian on each and lava between them, a hall of shades and weavers with no lava in it at all to rest the eyes, a gallery with two ways through it, a stair of floors that each has a pool in the middle, a pit of chains with a ridge of peaks over it, and a gauntlet 130 m long
 * of stones three metres wide and six metres apart. It ends with the CINDER SOVEREIGN, and after the Sovereign, the end.
 *
 *   ec_arena → ct_gate → ct_hall → ct_gallery → ct_shrine → ct_stair → ct_chains → ct_gauntlet → ct_approach → ct_arena → ct_end → (the end of the adventure)
 *                ↑ ╲ a door that the lever in the approach opens   ┆ shrine ┆ the last stair ┆ …            ┆ shrine, lever ┆ the last rest
 *                │   └────────────────────────────────────────────────────────────────────────────────────┘
 */
const REGION = 'cinder_throne';
const MATERIALS = { '#': 'basalt', G: 'scorch', '-': 'obsidian' } as const;

// ---------------------------------------------------------------------------------------------------------------- the Gate of Ash
/**
 * «Puerta de Ceniza»: 76 × 22 m. A moat of lava 38 m wide and a causeway across it of three broad stones — 9, 10 and 9 m, with 3 m of lava between each — and a creature on each: a Basalt Guard on the first and the second, a Magma Toad on the third. They are fought with lava at both ends of the stone, and
 * a blow of a Guard throws a hero 7 m. At the west end, up the stairs, a gallery with a stone door in it: the way home, which the lever in the approach opens.
 */
export function gate(): RoomDefinition {
  const c = new RoomCanvas('ct_gate', 76, 22).walls().ground(1, 75, 2);
  c.plat(1, 12, 7).plat(13, 16, 4).region('D', 8, 7, 9, 11);
  c.pool(20, 58).islet(22, 31, 2).islet(34, 44, 2).islet(47, 56, 2);
  c.mark('a', 5, 2).mark('b', 70, 2).mark('s', 6, 7).mark('x', 26, 3).mark('y', 39, 3).mark('z', 51, 3).mark('w', 56, 10);
  return mapRoom(
    { id: 'ct_gate', regionId: REGION, name: 'Gate of Ash', nameKey: 'room.ct_gate.name', art: { backdrop: 'throne', seed: 110 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('guard_1', 'basalt_guard', 'x', { facing: 1 }), m.spawn('guard_2', 'basalt_guard', 'y'), m.spawn('toad_1', 'magma_toad', 'z'), m.spawn('wisp_1', 'ember_wisp', 'w')],
      gates: [m.gate('home_gate', 'home_door', 'lever:ct_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'ec_arena', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'ct_hall', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'ct_approach', entry: 'shortcut' }, { requires: 'lever:ct_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Great Hall
/**
 * «Gran Salón»: 112 × 30 m. A hall of a hundred metres with its columns down — four stubs of stone, 2 to 3 m high, and two planks to dodge from — and no lava in it: it is the room of the creatures. Three Dusk Shades that come back behind whoever comes close, a Cinder Weaver at the far end, a Basalt Guard in the middle and
 * a spitter on each plank. Everything in the hall is awake.
 */
export function hall(): RoomDefinition {
  const c = new RoomCanvas('ct_hall', 112, 30).walls().ground(1, 111, 2);
  c.rock(18, 2, 20, 4).rock(40, 2, 42, 5).rock(62, 2, 64, 4).rock(84, 2, 86, 5);
  c.plat(28, 38, 9).plat(70, 80, 9);
  c.mark('a', 5, 2).mark('b', 106, 2).mark('x', 32, 2).mark('y', 56, 2).mark('z', 78, 2).mark('w', 92, 2).mark('g', 48, 2).mark('p', 33, 9).mark('q', 75, 9);
  return mapRoom(
    { id: 'ct_hall', regionId: REGION, name: 'Great Hall', nameKey: 'room.ct_hall.name', art: { backdrop: 'throne', seed: 111 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('shade_1', 'dusk_shade', 'x', { facing: 1 }), m.spawn('shade_2', 'dusk_shade', 'y'), m.spawn('shade_3', 'dusk_shade', 'z'), m.spawn('weaver_1', 'cinder_weaver', 'w'), m.spawn('guard_1', 'basalt_guard', 'g'), m.spawn('spitter_1', 'slag_spitter', 'p', { facing: 1 }), m.spawn('spitter_2', 'slag_spitter', 'q')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ct_gate', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ct_gallery', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Gallery of Chains
/**
 * «Galería de las Cadenas»: 88 × 40 m. Two ways along one hall. Along the floor, three pools — 8, 14 and 8 m, the middle one with a stone in it — and two Basalt Guards between them; or up a stair of five planks at the west end to a gallery of planks 18 m up, 10 m long and 4 m of air between them, with a toller at each
 * end of it and two Magma Pistons hanging over the middle, and a drop at the east end back to the floor.
 */
export function gallery(): RoomDefinition {
  const c = new RoomCanvas('ct_gallery', 88, 40).walls().ground(1, 87, 2);
  c.pool(16, 24).pool(38, 52).islet(42, 48, 2).pool(64, 72);
  c.plat(3, 7, 5).plat(7, 11, 8).plat(11, 15, 11).plat(15, 19, 14).plat(19, 23, 17);
  [[24, 34], [38, 48], [52, 62], [66, 76]].forEach(([x0, x1]) => c.plat(x0!, x1!, 20));
  c.mark('a', 5, 2).mark('b', 82, 2).mark('k', 28, 20).mark('l', 72, 20).mark('p', 43, 29).mark('q', 57, 29).mark('g', 31, 2).mark('h', 58, 2).mark('w', 46, 12);
  return mapRoom(
    { id: 'ct_gallery', regionId: REGION, name: 'Gallery of Chains', nameKey: 'room.ct_gallery.name', art: { backdrop: 'throne', seed: 112 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 'k', { facing: 1 }), m.spawn('toller_2', 'ash_toller', 'l'), m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'q'), m.spawn('guard_1', 'basalt_guard', 'g', { facing: 1 }), m.spawn('guard_2', 'basalt_guard', 'h'), m.spawn('wisp_1', 'ember_wisp', 'w')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ct_hall', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ct_shrine', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Chapel
/**
 * «Capilla»: 40 × 24 m. What is left of the chapel of the throne: a floor, a dais with the shrine on it — the first place to rest in the Throne — and a cage of thorn with a dim sphere in it that nobody has opened. No creature.
 */
export function shrine(): RoomDefinition {
  const c = new RoomCanvas('ct_shrine', 40, 24).walls().ground(1, 39, 2);
  c.rock(12, 2, 28, 3).rock(15, 3, 25, 4);
  c.mark('a', 5, 2).mark('b', 34, 2).mark('q', 17, 4).mark('r', 20, 4);
  return mapRoom(
    { id: 'ct_shrine', regionId: REGION, name: 'Chapel', nameKey: 'room.ct_shrine.name', art: { backdrop: 'throne', seed: 113 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ct_gallery', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ct_stair', entry: 'bottom' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Throne Stair
/**
 * «Escalera del Trono»: 36 × 52 m. Seven floors of black stone, 6 m apart, each with a stairwell at one end and a POOL OF LAVA in the middle of it — 8 m wide with a stone in it — so that every floor is a crossing before it is a stair. The hero climbs by the west end, crosses to the east, climbs there, and comes out of
 * the top floor by the east wall, toward the Pit of Chains. A toller on the first floor and another on the fourth, a piston over the third, wisps on the floors between.
 */
export function stair(): RoomDefinition {
  const c = new RoomCanvas('ct_stair', 36, 52).walls().ground(1, 35, 2);
  const floors = [8, 14, 20, 26, 32, 38, 44];
  floors.forEach((y, i) => {
    const east = i % 2 === 1; // (the first stairwell is at the west end, where the hero comes in, and the last, at the west end too, leaves the top floor to be crossed toward the east wall)
    const below = y - 6;
    c.rock(1, y - 2, 35, y);
    if (east) {
      c.air(29, y - 2, 35, y);
      c.plat(33, 35, below + 2).plat(31, 33, below + 4).plat(29, 31, below + 6);
    } else if (i === 0) {
      c.air(5, y - 2, 11, y); // (the first stairwell stands clear of the door the hero came in by)
      c.plat(5, 7, below + 2).plat(7, 9, below + 4).plat(9, 11, below + 6);
    } else {
      c.air(1, y - 2, 7, y);
      c.plat(1, 3, below + 2).plat(3, 5, below + 4).plat(5, 7, below + 6);
    }
    c.pool(14, 22, y).islet(17, 19, 2, y);
  });
  c.mark('a', 4, 2).mark('e', 28, 44).mark('x', 27, 8).mark('p', 12, 9).mark('q', 18, 22).mark('t', 10, 26).mark('u', 24, 33).mark('v', 16, 40);
  return mapRoom(
    { id: 'ct_stair', regionId: REGION, name: 'Throne Stair', nameKey: 'room.ct_stair.name', art: { backdrop: 'throne', seed: 114 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('bottom', 'a', 1), m.entry('top', 'e', -1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 'x'), m.spawn('wisp_1', 'ember_wisp', 'p'), m.spawn('piston_1', 'magma_piston', 'q'), m.spawn('toller_2', 'ash_toller', 't', { facing: 1 }), m.spawn('wisp_2', 'ember_wisp', 'u'), m.spawn('wisp_3', 'ember_wisp', 'v')],
      exits: [m.exitSide('bottom', 'west', 'a', { room: 'ct_shrine', entry: 'east' }), m.exitSide('top', 'east', 'e', { room: 'ct_chains', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Pit of Chains
/**
 * «Foso de Cadenas»: 96 × 30 m. A pit of lava 76 m wide with a mountain range over it: two peaks of stone 13 m high, a stair of stones and planks 3 m a step up to each and down from each, a toller on each peak, a piston over each end of the range, an ember wisp that floats over the planks between them and a bat that hangs from the roof over the middle.
 */
export function chains(): RoomDefinition {
  const c = new RoomCanvas('ct_chains', 96, 30).walls().ground(1, 10, 2).ground(86, 95, 2);
  c.lava(10, 86, 1, 1);
  c.rock(12, 1, 16, 4).plat(20, 24, 7).plat(28, 32, 10).rock(34, 1, 40, 13);
  c.plat(43, 47, 10).plat(49, 53, 10);
  c.rock(56, 1, 62, 13).plat(64, 68, 10).plat(72, 76, 7).rock(80, 1, 84, 4);
  c.mark('a', 5, 2).mark('b', 90, 2).mark('k', 37, 13).mark('l', 59, 13).mark('p', 26, 18).mark('r', 70, 18).mark('w', 51, 16).mark('y', 48, 28);
  return mapRoom(
    { id: 'ct_chains', regionId: REGION, name: 'Pit of Chains', nameKey: 'room.ct_chains.name', art: { backdrop: 'throne', seed: 115 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 'k', { facing: 1 }), m.spawn('toller_2', 'ash_toller', 'l'), m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'r'), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('bat_1', 'ash_bat', 'y', { facing: 1 })],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ct_stair', entry: 'top' }), m.exitSide('east', 'east', 'b', { room: 'ct_gauntlet', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Gauntlet
/**
 * «Pasillo de Fuego»: 130 × 22 m. The hardest road of the world and the last of its lava: 106 m of it under a low roof, eleven stones six metres apart — nine of three metres and two broad ones of six —, a running jump and a dash at every one, two tollers on the two broad stones, four pistons hanging over the narrow ones and two ember wisps
 * in the air. A fall is a burn and a walk back to the last stone — never more than a few seconds — and the shrine of the approach is a short way beyond the far bank.
 */
export function gauntlet(): RoomDefinition {
  const c = new RoomCanvas('ct_gauntlet', 130, 22).walls().ground(1, 12, 2).ground(118, 129, 2);
  c.lava(12, 118, 1, 1);
  c.islet(16, 19, 2).islet(25, 28, 3).islet(34, 37, 2).islet(43, 49, 2).islet(55, 58, 3).islet(64, 67, 2).islet(73, 76, 3).islet(82, 88, 2).islet(94, 97, 3).islet(103, 106, 2).islet(112, 115, 3);
  c.mark('a', 5, 2).mark('b', 124, 2).mark('k', 46, 3).mark('l', 85, 3).mark('p', 30, 13).mark('q', 60, 13).mark('r', 78, 13).mark('s', 108, 13).mark('w', 40, 10).mark('x', 100, 10);
  return mapRoom(
    { id: 'ct_gauntlet', regionId: REGION, name: 'Gauntlet of Fire', nameKey: 'room.ct_gauntlet.name', art: { backdrop: 'throne', seed: 116 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toller_1', 'ash_toller', 'k'), m.spawn('toller_2', 'ash_toller', 'l'), m.spawn('piston_1', 'magma_piston', 'p'), m.spawn('piston_2', 'magma_piston', 'q'), m.spawn('piston_3', 'magma_piston', 'r'), m.spawn('piston_4', 'magma_piston', 's'), m.spawn('wisp_1', 'ember_wisp', 'w'), m.spawn('wisp_2', 'ember_wisp', 'x')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ct_chains', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ct_approach', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Antechamber
/**
 * «Antecámara del Trono»: 64 × 22 m. The last stretch before the Sovereign: two Dusk Shades, a Cinder Weaver and a Basalt Guard, no lava — the hero has had enough of it — and at the east end the shrine, the last place to rest. On a gallery in the west, a lever: it opens the stone door in the Gate of Ash.
 */
export function approach(): RoomDefinition {
  const c = new RoomCanvas('ct_approach', 64, 22).walls().ground(1, 63, 2);
  c.plat(1, 12, 7).plat(13, 16, 4);
  c.rock(30, 2, 32, 4).rock(42, 2, 44, 3);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('l', 9, 7).mark('x', 22, 2).mark('y', 28, 2).mark('w', 36, 2).mark('g', 40, 2).mark('q', 54, 2).mark('r', 56, 2);
  return mapRoom(
    { id: 'ct_approach', regionId: REGION, name: 'Throne Approach', nameKey: 'room.ct_approach.name', art: { backdrop: 'throne', seed: 117 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('shade_1', 'dusk_shade', 'x', { facing: 1 }), m.spawn('shade_2', 'dusk_shade', 'y', { facing: 1 }), m.spawn('weaver_1', 'cinder_weaver', 'w', { facing: 1 }), m.spawn('guard_1', 'basalt_guard', 'g')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'ct_gauntlet', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'ct_arena', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'ct_gate', entry: 'shortcut' }, { requires: 'lever:ct_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:ct_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Throne
/**
 * «Trono de Ceniza»: 84 × 28 m. The arena of the CINDER SOVEREIGN: 61 m of black floor between two doors that shut when the fight begins and open when it ends. It cuts from behind, rains fire out of the floor under the hero and where they will have to be, throws spheres and a ring, and charges the length of the floor;
 * it calls a shade at seven tenths of its life and a weaver at two fifths, and its heart shows after a cut, a throw and a ring. When it falls the way on — to the last room — works.
 */
export function arena(): RoomDefinition {
  const c = new RoomCanvas('ct_arena', 84, 28).walls().ground(1, 83, 2);
  c.region('A', 8, 2, 9, 27).region('B', 73, 2, 74, 27);
  c.mark('a', 4, 2).mark('b', 79, 2).mark('l', 11, 2).mark('r', 72, 2).mark('k', 62, 2);
  return mapRoom(
    { id: 'ct_arena', regionId: REGION, name: 'Throne', nameKey: 'room.ct_arena.name', art: { backdrop: 'throne', seed: 118 }, rows: c.rows(), materials: MATERIALS, regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:ct_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:ct_boss' },
      ],
      bosses: [m.boss('sovereign', 'boss_cinder_sovereign', 'k', { from: 'l', to: 'r', top: 16 }, { defeatFlag: 'defeated:ct_boss', fightFlag: '~fight:ct_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 71.5, 18), bounds: rect(7, 0, 75, 26), viewHeight: 16, smoothTime: 0.8, whenClear: 'defeated:ct_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'ct_approach', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ct_end', entry: 'west' }, { requires: 'defeated:ct_boss' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Sky of Ash
/**
 * «Cielo de Ceniza»: 44 × 22 m. A last quiet room after the Sovereign: a floor, a shrine, and at the east wall the way out of the world — the end of the adventure.
 */
export function end(): RoomDefinition {
  const c = new RoomCanvas('ct_end', 44, 22).walls().ground(1, 43, 2);
  c.rock(14, 2, 18, 3);
  c.mark('a', 5, 2).mark('b', 38, 2).mark('q', 22, 2).mark('r', 25, 2);
  return mapRoom(
    { id: 'ct_end', regionId: REGION, name: 'Sky of Ash', nameKey: 'room.ct_end.name', art: { backdrop: 'throne', seed: 119 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('rest', 'q', 1)],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ct_arena', entry: 'east' }), m.endSide('end', 'east', 'b', { requires: 'defeated:ct_boss' })],
      interactables: [m.shrine('r')],
    }),
  );
}

export const THRONE_ROOMS: readonly RoomDefinition[] = [gate(), hall(), gallery(), shrine(), stair(), chains(), gauntlet(), approach(), arena(), end()];
