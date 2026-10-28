import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { ANY_BLOW, lever, teach, vessel } from './kit';

/**
 * THE INK FOUNDRY (docs/PROMPT21-LOG.md): where the ink of the ruins was cast into everything that was ever written with it, and still is. Iron, heat and long drops. Its creatures are the machines' own: the Piston Drone, which follows the hero from above and falls on
 * them; the Ink Weaver, which makes creatures and is never alone for long; the Stoneback and the Leech that came with the stone and the damp; the Ink Spitter. It asks for the Double Jump (the furnace), the Wall Jump (the press) and the dash, and ends with the FOUNDRY ENGINE.
 *
 *   sp_arena → fd_gate → fd_line → fd_press → fd_furnace → fd_vats → fd_workshop → fd_catwalks → fd_control → fd_arena → (the Ink Heart)
 *                ↑ ╲ a door that the lever in the control room opens       ┆ cracked wall                  ┆ shrine ┆ shrine, lever
 *                │   └─────────────────────── fd_scrap (a vessel of magic, behind the cracked wall of the line)
 */
const REGION = 'ink_foundry';
/** What the squares of the canvas are made of here (the plates of the foundry, its slag and the grating of its catwalks): a material is a piece of art (docs/PROMPT23-LOG.md §5). */
const MATERIALS = { '#': 'iron', G: 'slag', '-': 'grate' } as const;

// ---------------------------------------------------------------------------------------------------------------- the Gate
/**
 * «Compuerta»: 64 × 20 m. The iron gate of the foundry, open: a hall of girders with a Stoneback in the middle and two Piston Drones in the air over it, which follow whoever crosses and drop on them. At the west end, up the stairs, a gallery with a stone door
 * in it: the way home, which the lever in the control room opens.
 */
export function gate(): RoomDefinition {
  const c = new RoomCanvas('fd_gate', 64, 20).walls().ground(1, 63, 2);
  c.plat(1, 12, 7).plat(13, 16, 4).region('D', 8, 7, 9, 11);
  c.rock(22, 2, 24, 4).rock(38, 2, 40, 4).rock(50, 2, 52, 3);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('g', 31, 2).mark('x', 26, 12).mark('y', 40, 12);
  return mapRoom(
    { id: 'fd_gate', regionId: REGION, name: 'Foundry Gate', nameKey: 'room.fd_gate.name', art: { backdrop: 'foundry', seed: 48 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('stoneback_1', 'stoneback', 'g', { facing: 1 }), m.spawn('piston_1', 'piston_drone', 'x'), m.spawn('piston_2', 'piston_drone', 'y')],
      gates: [m.gate('home_gate', 'home_door', 'lever:fd_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'sp_arena', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'fd_line', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'fd_control', entry: 'shortcut' }, { requires: 'lever:fd_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Assembly Line
/**
 * «Línea de Montaje»: 92 × 18 m. A floor 90 m long with low belts to step over, two Ink Weavers at their stations — each makes creatures, never more than two at a time — two Floor Leeches in the oil, and a spitter on a catwalk. At the east end, a stair of planks
 * to a ledge, and on it a wall of iron that is split along its length: behind it, a passage.
 */
export function line(): RoomDefinition {
  const c = new RoomCanvas('fd_line', 92, 18).walls().ground(1, 91, 2);
  c.rock(10, 2, 13, 3).rock(34, 2, 37, 3).rock(58, 2, 61, 3); // belts
  c.rock(42, 2, 44, 4).plat(44, 52, 6); // the catwalk
  c.rock(64, 2, 66, 4).plat(66, 71, 6).plat(72, 82, 7); // the stair to the ledge
  c.rock(82, 6, 90, 12).air(83, 7, 89, 11).region('W', 82, 7, 83, 11); // the block with the passage in it, shut by the split wall
  c.mark('a', 5, 2).mark('b', 78, 2).mark('x', 22, 2).mark('y', 54, 2).mark('l', 30, 2).mark('m', 62, 2).mark('s', 48, 6).mark('k', 81, 7).mark('r', 85, 7);
  return mapRoom(
    { id: 'fd_line', regionId: REGION, name: 'Assembly Line', nameKey: 'room.fd_line.name', art: { backdrop: 'foundry', seed: 49 }, rows: c.rows(), materials: MATERIALS, regions: { W: { id: 'scrap_wall', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('scrap', 'r', -1)],
      spawns: [m.spawn('weaver_1', 'ink_weaver', 'x', { facing: 1 }), m.spawn('weaver_2', 'ink_weaver', 'y'), m.spawn('leech_1', 'floor_leech', 'l'), m.spawn('leech_2', 'floor_leech', 'm'), m.spawn('spitter_1', 'ink_spitter', 's')],
      gates: [m.gate('scrap_gate', 'scrap_wall', 'broken:fd_line_wall')],
      seals: [m.seal('crack', 'k', { area: rect(81.6, 7, 83.4, 11), style: 'crack', accepts: ANY_BLOW, flag: 'broken:fd_line_wall' })],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'fd_gate', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'fd_press', entry: 'west' }),
        { id: 'scrap', rect: rect(87, 7, 89, 11), to: { room: 'fd_scrap', entry: 'west' }, requires: 'broken:fd_line_wall' },
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Press
/**
 * «Prensa»: 14 × 42 m. A chimney 5 m wide and 36 m tall between a wall and a block of iron; ledges come out of the WALL at five heights, each with a strip of spikes on it that takes the nearest 2 m of the shaft, and a Piston Drone hangs in the air in it,
 * which follows whoever climbs and drops on them. The door on is at the top of the block. The Wall Jump — off the clean face of the block, if the hero keeps to it — and a piston to mind.
 */
export function press(): RoomDefinition {
  const c = new RoomCanvas('fd_press', 14, 42).walls().ground(1, 13, 2);
  c.rock(6, 2, 13, 38); // the block
  c.rock(1, 10, 3, 11).spikes(1, 3, 11).rock(1, 16, 3, 17).spikes(1, 3, 17).rock(1, 22, 3, 23).spikes(1, 3, 23).rock(1, 28, 3, 29).spikes(1, 3, 29).rock(1, 34, 3, 35).spikes(1, 3, 35); // from the wall
  c.mark('a', 4, 2).mark('e', 9, 38).mark('p', 4, 20);
  return mapRoom(
    { id: 'fd_press', regionId: REGION, name: 'The Press', nameKey: 'room.fd_press.name', art: { backdrop: 'foundry', seed: 50 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('piston_1', 'piston_drone', 'p')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'fd_line', entry: 'east' }), m.exitSide('east', 'east', 'e', { room: 'fd_furnace', entry: 'west' })],
      needs: [{ target: 'exit:east', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Furnace
/**
 * «Horno»: 66 × 26 m. A floor of spikes 44 m wide with five planks over it — 4 m above the safe floor, 4 m above the first, 4 m above the second, and then down again — and an Ink Spitter on each of the two highest, a Floor Leech by the way out and a Piston Drone over
 * the whole. Every step of the way up is a Double Jump; the way down is a drop.
 */
export function furnace(): RoomDefinition {
  const c = new RoomCanvas('fd_furnace', 66, 26).walls().ground(1, 65, 2).spikes(11, 55, 2);
  c.plat(12, 18, 6).plat(20, 26, 10).plat(28, 34, 14).plat(36, 42, 10).plat(44, 50, 6);
  c.mark('a', 5, 2).mark('b', 60, 2).mark('x', 23, 10).mark('y', 31, 14).mark('z', 47, 6).mark('l', 57, 2).mark('d', 31, 21);
  return mapRoom(
    { id: 'fd_furnace', regionId: REGION, name: 'Furnace', nameKey: 'room.fd_furnace.name', art: { backdrop: 'foundry', seed: 51 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('spitter_1', 'ink_spitter', 'x', { facing: 1 }), m.spawn('spitter_2', 'ink_spitter', 'y'), m.spawn('spitter_3', 'ink_spitter', 'z'), m.spawn('leech_1', 'floor_leech', 'l'), m.spawn('piston_1', 'piston_drone', 'd')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'fd_press', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'fd_vats', entry: 'west' })],
      needs: [{ target: 'exit:east', abilities: ['double_jump'] }, { target: 'exit:west', abilities: ['double_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Vats
/**
 * «Cubas de Tinta»: 60 × 22 m. Two vats of ink with nothing in them but black — a pit, to the hero — crossed on planks laid over them; an Ink Weaver on the island between, a spitter on a walkway over it, and at the east end a stone door and the Stoneback that keeps it:
 * the door opens when the keeper falls.
 */
export function vats(): RoomDefinition {
  const c = new RoomCanvas('fd_vats', 60, 22).walls().ground(1, 14, 2).ground(20, 30, 2).ground(36, 59, 2).pit(14, 20).pit(30, 36).plat(14, 20, 2).plat(30, 36, 2);
  c.rock(20, 2, 22, 4).plat(22, 28, 6).region('D', 48, 2, 49, 21);
  c.mark('a', 5, 2).mark('b', 54, 2).mark('x', 25, 2).mark('s', 25, 6).mark('g', 43, 2);
  return mapRoom(
    { id: 'fd_vats', regionId: REGION, name: 'Ink Vats', nameKey: 'room.fd_vats.name', art: { backdrop: 'foundry', seed: 52 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'vat_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('weaver_1', 'ink_weaver', 'x', { facing: 1 }), m.spawn('spitter_1', 'ink_spitter', 's'), m.spawn('keeper', 'stoneback', 'g', { facing: 1, defeatFlag: 'defeated:fd_vats_keeper' })],
      gates: [m.gate('keeper_gate', 'vat_door', 'defeated:fd_vats_keeper')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'fd_furnace', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'fd_workshop', entry: 'west' }, { requires: 'defeated:fd_vats_keeper' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Workshop
/**
 * «Taller»: 40 × 16 m. A workbench, a vice and the shrine behind them — the first place to rest in the Foundry. A leech lies on the bench at the east end, in the way out.
 */
export function workshop(): RoomDefinition {
  const c = new RoomCanvas('fd_workshop', 40, 16).walls().ground(1, 39, 2);
  c.rock(10, 2, 15, 3).rock(26, 2, 29, 4);
  c.mark('a', 5, 2).mark('b', 34, 2).mark('q', 18, 2).mark('r', 20, 2).mark('l', 27, 4);
  return mapRoom(
    { id: 'fd_workshop', regionId: REGION, name: 'Workshop', nameKey: 'room.fd_workshop.name', art: { backdrop: 'foundry', seed: 53 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      spawns: [m.spawn('leech_1', 'floor_leech', 'l')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'fd_vats', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'fd_catwalks', entry: 'west' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Catwalks
/**
 * «Pasarelas de Hierro»: 88 × 28 m. Five catwalks of iron in the open air over a drop with no floor, 4 to 5 m apart, each at its own height; two Piston Drones over them, a spitter on the third and another on the last, and a Stoneback on the first.
 */
export function catwalks(): RoomDefinition {
  const c = new RoomCanvas('fd_catwalks', 88, 28).walls().ground(1, 14, 10).ground(74, 87, 10).pit(14, 74);
  c.rock(18, 11, 27, 12).rock(32, 10, 38, 11).rock(43, 12, 51, 13).rock(56, 10, 62, 11).rock(66, 11, 72, 12);
  c.mark('a', 5, 10).mark('b', 80, 10).mark('g', 22, 12).mark('s', 47, 13).mark('t', 58, 11).mark('x', 34, 20).mark('y', 58, 20);
  return mapRoom(
    { id: 'fd_catwalks', regionId: REGION, name: 'Iron Catwalks', nameKey: 'room.fd_catwalks.name', art: { backdrop: 'foundry', seed: 54 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('stoneback_1', 'stoneback', 'g', { facing: 1 }), m.spawn('spitter_1', 'ink_spitter', 's'), m.spawn('spitter_2', 'ink_spitter', 't'), m.spawn('piston_1', 'piston_drone', 'x'), m.spawn('piston_2', 'piston_drone', 'y')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'fd_workshop', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'fd_control', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Control Room
/**
 * «Cuadro de Mandos»: 56 × 22 m. The last stretch before the Engine: two Stonebacks and an Ink Weaver, a leech, and at the east end the shrine — the last place to rest. On a gallery in the west, a lever: it opens the stone door in the Gate, and from here a way leads
 * straight back to it.
 */
export function control(): RoomDefinition {
  const c = new RoomCanvas('fd_control', 56, 22).walls().ground(1, 55, 2);
  c.plat(1, 12, 7).plat(13, 16, 4);
  c.rock(18, 2, 20, 4).rock(36, 2, 38, 3);
  c.mark('a', 5, 2).mark('b', 50, 2).mark('s', 6, 7).mark('l', 9, 7).mark('x', 22, 2).mark('w', 28, 2).mark('y', 34, 2).mark('m', 39, 2).mark('q', 46, 2).mark('r', 48, 2);
  return mapRoom(
    { id: 'fd_control', regionId: REGION, name: 'Control Room', nameKey: 'room.fd_control.name', art: { backdrop: 'foundry', seed: 55 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('stoneback_1', 'stoneback', 'x', { facing: 1 }), m.spawn('weaver_1', 'ink_weaver', 'w', { facing: 1 }), m.spawn('stoneback_2', 'stoneback', 'y'), m.spawn('leech_1', 'floor_leech', 'm')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'fd_catwalks', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'fd_arena', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'fd_gate', entry: 'shortcut' }, { requires: 'lever:fd_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:fd_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Engine Room
/**
 * «Sala del Motor»: 72 × 26 m. The arena of the FOUNDRY ENGINE: 53 m of floor between two walls of iron that are doors — it charges into them and is stunned — with three gantries of iron 3 m up and nine columns' worth of pistons under the floor. When it falls the Warding Thread lies where it stood
 * (a hit leaves the hero untouchable for longer), and the way on, to the Heart of the Ink, works.
 */
export function engineRoom(): RoomDefinition {
  const c = new RoomCanvas('fd_arena', 72, 26).walls().ground(1, 71, 2);
  c.region('A', 8, 2, 9, 25).region('B', 65, 2, 66, 25); // doors to the roof
  c.plat(16, 21, 5).plat(31, 36, 5).plat(46, 51, 5); // three gantries of iron, 3 m up: out of the way of the charge, with the pistons under them
  c.mark('a', 4, 2).mark('b', 67, 2).mark('l', 11, 2).mark('r', 64, 2).mark('k', 56, 2).mark('v', 60, 2);
  return mapRoom(
    { id: 'fd_arena', regionId: REGION, name: 'Engine Room', nameKey: 'room.fd_arena.name', art: { backdrop: 'foundry', seed: 56 }, rows: c.rows(), materials: MATERIALS, regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:fd_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:fd_boss' },
      ],
      bosses: [m.boss('engine', 'boss_engine', 'k', { from: 'l', to: 'r', top: 14 }, { defeatFlag: 'defeated:fd_boss', fightFlag: '~fight:fd_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 64.5, 16), bounds: rect(7, 0, 67, 24), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:fd_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'fd_control', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ih_threshold', entry: 'west' }, { requires: 'defeated:fd_boss' })],
      interactables: [{ ...teach(m, 'relic_ward', 'v'), whenSet: 'defeated:fd_boss' }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Scrapyard
/**
 * «Chatarrería»: 40 × 20 m. Where the foundry throws what it cannot use: heaps of scrap, a Stoneback among them and two Piston Drones in the air over them, and the pedestal of the last vessel of magic at the far end.
 */
export function scrap(): RoomDefinition {
  const c = new RoomCanvas('fd_scrap', 40, 20).walls().ground(1, 39, 2);
  c.rock(10, 2, 13, 3).rock(20, 2, 24, 4).rock(28, 2, 30, 3);
  c.rock(34, 2, 38, 4); // the pedestal
  c.mark('a', 5, 2).mark('v', 36, 4).mark('g', 16, 2).mark('x', 24, 12).mark('y', 31, 14);
  return mapRoom(
    { id: 'fd_scrap', regionId: REGION, name: 'Scrapyard', nameKey: 'room.fd_scrap.name', art: { backdrop: 'foundry', seed: 57 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1)],
      spawns: [m.spawn('stoneback_1', 'stoneback', 'g', { facing: 1 }), m.spawn('piston_1', 'piston_drone', 'x'), m.spawn('piston_2', 'piston_drone', 'y')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'fd_line', entry: 'scrap' })],
      interactables: [vessel(m, 'mana_3', 'v')],
    }),
  );
}

export const FOUNDRY_ROOMS: readonly RoomDefinition[] = [gate(), line(), press(), furnace(), vats(), workshop(), catwalks(), control(), engineRoom(), scrap()];
