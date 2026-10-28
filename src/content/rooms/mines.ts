import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { abilityFlag } from '@/world/worldGraph';
import { lever, teach, vessel } from './kit';

/**
 * THE CRYSTAL MINES (docs/PROMPT21-LOG.md): tunnels cut into a vein of crystal that went on growing after the miners left. Stone creatures live in them: the Shardling, a stone when it is curled and shards when it breaks, and the Stoneback, which keeps a shield to
 * its front; and the bats of any cave. It teaches the GROUND SLAM (in the Old Forge, whose way on is a cracked floor that only the slam breaks) and ends with the CRYSTAL COLOSSUS.
 *
 *   mr_lair → mn_gate → mn_seam → mn_hall → mn_camp → mn_forge → mn_descent → mn_rails → mn_approach → mn_arena → (the Bell Spire)
 *               ↑ ╲ a door that the lever in the approach opens        ┆ cracked floor ┆ shrine ┆ the Slam ┆ two cracked floors ┆ shrine, lever
 *               │   └─ mn_vault (a vessel of life, under the cracked floor of the hall)
 */
const REGION = 'crystal_mines';
/** What the squares of the canvas are made of here (the rock of the mine, the gravel of its floors and the timber that props it): a material is a piece of art (docs/PROMPT23-LOG.md §5). */
const MATERIALS = { '#': 'rock', G: 'gravel', '-': 'timber' } as const;

// ---------------------------------------------------------------------------------------------------------------- the Mine Mouth
/**
 * «Bocamina»: 64 × 18 m. The way in: a floor of rails and rubble between clusters of crystal, two timber beams to jump onto, two Shardlings that roll along the floor and a bat on the roof. At the west end, up the stairs, a gallery with a stone door in it:
 * the way home, which the lever in the approach opens.
 */
export function gate(): RoomDefinition {
  const c = new RoomCanvas('mn_gate', 64, 18).walls().ground(1, 63, 2);
  c.plat(1, 12, 7).plat(13, 16, 4).region('D', 8, 7, 9, 11);
  c.rock(20, 2, 22, 4).rock(30, 2, 33, 3).rock(40, 2, 42, 4);
  c.plat(22, 28, 6).plat(42, 48, 6);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('x', 26, 2).mark('y', 36, 2).mark('z', 52, 16);
  return mapRoom(
    { id: 'mn_gate', regionId: REGION, name: 'Mine Mouth', nameKey: 'room.mn_gate.name', art: { backdrop: 'mines', seed: 28 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('shardling_1', 'shardling', 'x'), m.spawn('shardling_2', 'shardling', 'y'), m.spawn('bat_1', 'cave_bat', 'z')],
      gates: [m.gate('home_gate', 'home_door', 'lever:mn_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'mr_lair', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'mn_seam', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'mn_approach', entry: 'shortcut' }, { requires: 'lever:mn_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Seam
/**
 * «Veta»: 26 × 40 m. A shaft up the vein, climbed on fifteen ledges of stone — alternately on the right and on the left, 2 m above one another, 3 m of air between — with strips of crystal spikes on the outer ends of some of them, two Stonebacks on ledges
 * (a shield to the front: get behind it or go around) and two bats under the roof.
 */
export function seam(): RoomDefinition {
  const c = new RoomCanvas('mn_seam', 26, 40).walls().ground(1, 25, 2);
  for (let i = 0; i < 15; i++) {
    const y = 4 + i * 2;
    if (i % 2 === 0) c.rock(15, y - 1, 25, y);
    else c.rock(1, y - 1, 12, y);
  }
  c.spikes(22, 25, 12).spikes(22, 25, 20).spikes(1, 4, 14).spikes(1, 4, 22);
  c.mark('a', 4, 2).mark('e', 20, 32).mark('x', 19, 16).mark('y', 7, 22).mark('p', 3, 38).mark('q', 10, 38);
  return mapRoom(
    { id: 'mn_seam', regionId: REGION, name: 'Crystal Seam', nameKey: 'room.mn_seam.name', art: { backdrop: 'mines', seed: 29 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('stoneback_1', 'stoneback', 'x'), m.spawn('stoneback_2', 'stoneback', 'y', { facing: 1 }), m.spawn('bat_1', 'cave_bat', 'p', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'q')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mn_gate', entry: 'east' }), m.exitSide('east', 'east', 'e', { room: 'mn_hall', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Crystal Hall
/**
 * «Salón de Cristal»: 72 × 24 m. A cavern with a plateau in the middle and a Stoneback on the floor at each side of it, and bats on the roof. In the top of the plateau, a stretch of stone that is split: the Ground Slam breaks it, and under it, 4 m down, is the
 * Armoured Vault.
 */
export function hall(): RoomDefinition {
  const c = new RoomCanvas('mn_hall', 72, 24).walls().ground(1, 71, 2).air(37, 0, 40, 2);
  c.rock(30, 2, 46, 4).region('F', 37, 2, 40, 4); // the plateau, with the split stretch in it
  c.rock(26, 2, 30, 3).rock(46, 2, 50, 3).rock(8, 2, 10, 4).rock(60, 2, 63, 3);
  c.mark('a', 5, 2).mark('b', 66, 2).mark('k', 38, 4).mark('v', 35, 4).mark('x', 17, 2).mark('y', 54, 2).mark('p', 12, 22).mark('q', 58, 22);
  return mapRoom(
    { id: 'mn_hall', regionId: REGION, name: 'Crystal Hall', nameKey: 'room.mn_hall.name', art: { backdrop: 'mines', seed: 30 }, rows: c.rows(), materials: MATERIALS, regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('vault', 'v', 1)],
      spawns: [m.spawn('stoneback_1', 'stoneback', 'x', { facing: 1 }), m.spawn('stoneback_2', 'stoneback', 'y'), m.spawn('bat_1', 'cave_bat', 'p', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'q')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:mn_hall_crack')],
      seals: [m.seal('crack', 'k', { area: rect(36.9, 3.4, 40.1, 4.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:mn_hall_crack', needs: abilityFlag('ground_slam') })],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'mn_seam', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'mn_camp', entry: 'west' }),
        m.exitShaft('vault', 'south', 'k', { room: 'mn_vault', entry: 'north' }, { width: 3, depth: 1, requires: 'broken:mn_hall_crack' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Camp
/**
 * «Campamento»: 40 × 16 m. What the miners left: crates, a loft of planks and, on the loft, the shrine — the first place to rest in the Mines. A shardling lives on the crates and rolls at whoever climbs them.
 */
export function camp(): RoomDefinition {
  const c = new RoomCanvas('mn_camp', 40, 16).walls().ground(1, 39, 2);
  c.rock(8, 2, 11, 3).rock(13, 2, 15, 4);
  c.rock(17, 2, 20, 3).rock(20, 2, 22, 4).plat(22, 35, 6);
  c.mark('a', 5, 2).mark('b', 34, 2).mark('q', 27, 6).mark('r', 29, 6).mark('g', 18, 3);
  return mapRoom(
    { id: 'mn_camp', regionId: REGION, name: 'Miners Camp', nameKey: 'room.mn_camp.name', art: { backdrop: 'mines', seed: 31 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      spawns: [m.spawn('shardling_1', 'shardling', 'g', { facing: 1 })],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mn_hall', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'mn_forge', entry: 'west' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Old Forge
/**
 * «Fragua Vieja»: 48 × 22 m. The GROUND SLAM lies on an anvil at the west end, with two Stonebacks standing guard between it and the rest of the room. And the room asks for it at once: its way on is a stretch of floor, 3 m wide and split along its length, at
 * the east end — the Slam breaks it and the hero falls into the Coal Well.
 */
export function forge(): RoomDefinition {
  const c = new RoomCanvas('mn_forge', 48, 22).walls().ground(1, 47, 2).air(36, 0, 39, 1).region('F', 36, 1, 39, 2);
  c.rock(8, 2, 13, 4); // the anvil
  c.mark('a', 5, 2).mark('d', 42, 2).mark('r', 10, 4).mark('x', 20, 2).mark('y', 27, 2).mark('k', 37, 2);
  return mapRoom(
    { id: 'mn_forge', regionId: REGION, name: 'Old Forge', nameKey: 'room.mn_forge.name', art: { backdrop: 'mines', seed: 32 }, rows: c.rows(), materials: MATERIALS, regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('down', 'd', 1)],
      spawns: [m.spawn('stoneback_1', 'stoneback', 'x', { facing: 1 }), m.spawn('stoneback_2', 'stoneback', 'y')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:mn_forge_crack')],
      seals: [m.seal('crack', 'k', { area: rect(35.9, 1.4, 39.1, 2.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:mn_forge_crack', needs: abilityFlag('ground_slam') })],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mn_camp', entry: 'east' }), m.exitShaft('down', 'south', 'k', { room: 'mn_descent', entry: 'north' }, { width: 3, depth: 1, requires: 'broken:mn_forge_crack' })],
      interactables: [teach(m, 'ground_slam', 'r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Coal Well
/**
 * «Pozo de Carbón»: 40 × 24 m. Two chambers one over the other. The hero comes in at the top of a staircase of four platforms under the hole of the Forge, goes down it into the upper chamber — a shardling and bats — and breaks the second split stretch of floor
 * with the Slam to fall into the lower one, where a Stoneback waits and the door on is. The way back up is a staircase of three platforms to the hole in the floor.
 */
export function well(): RoomDefinition {
  const c = new RoomCanvas('mn_descent', 40, 24).walls().ground(1, 39, 2);
  c.rock(1, 9, 39, 10).region('F', 17, 9, 20, 10); // the floor of the upper chamber, split in the middle
  c.plat(30, 36, 12).plat(26, 32, 14).plat(22, 28, 16).plat(18, 24, 18); // down from the hole of the Forge
  c.plat(26, 32, 4).plat(21, 27, 6).plat(16, 22, 7); // up to the hole in the floor
  c.mark('n', 21, 18).mark('b', 34, 2).mark('k', 18, 10).mark('x', 8, 10).mark('p', 33, 22).mark('y', 10, 2);
  return mapRoom(
    { id: 'mn_descent', regionId: REGION, name: 'Coal Well', nameKey: 'room.mn_descent.name', art: { backdrop: 'mines', seed: 33 }, rows: c.rows(), materials: MATERIALS, regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('north', 'n', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('shardling_1', 'shardling', 'x'), m.spawn('bat_1', 'cave_bat', 'p'), m.spawn('stoneback_1', 'stoneback', 'y')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:mn_well_crack')],
      seals: [m.seal('crack', 'k', { area: rect(16.9, 9.4, 20.1, 10.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:mn_well_crack', needs: abilityFlag('ground_slam') })],
      exits: [
        m.exitShaft('north', 'north', 'n', { room: 'mn_forge', entry: 'down' }, { width: 6, depth: 2 }),
        m.exitSide('east', 'east', 'b', { room: 'mn_rails', entry: 'west' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Dead Line
/**
 * «Vía Muerta»: 84 × 16 m. A long gallery of old rails, 82 m end to end, cut by three pits of black depth — 6, 7 and 6 m, each a running jump — with three Shardlings rolling along the stretches between them and a Stoneback in the middle.
 */
export function rails(): RoomDefinition {
  const c = new RoomCanvas('mn_rails', 84, 16).walls().ground(1, 22, 2).ground(28, 44, 2).ground(51, 66, 2).ground(72, 83, 2).pit(22, 28).pit(44, 51).pit(66, 72);
  c.rock(14, 2, 16, 3).rock(40, 2, 42, 3).rock(60, 2, 62, 4);
  c.mark('a', 5, 2).mark('b', 78, 2).mark('x', 17, 2).mark('y', 32, 2).mark('g', 37, 2).mark('z', 56, 2);
  return mapRoom(
    { id: 'mn_rails', regionId: REGION, name: 'Dead Line', nameKey: 'room.mn_rails.name', art: { backdrop: 'mines', seed: 34 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('shardling_1', 'shardling', 'x'), m.spawn('shardling_2', 'shardling', 'y'), m.spawn('stoneback_1', 'stoneback', 'g', { facing: 1 }), m.spawn('shardling_3', 'shardling', 'z')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mn_descent', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'mn_approach', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Coal Gallery
/**
 * «Galería de Carbón»: 64 × 20 m. The last stretch before the Colossus: two Stonebacks, a Shardling, bats on the roof, and at the east end the shrine — the last place to rest. On a gallery in the west, a lever: it opens the stone door in the Mine Mouth.
 */
export function approach(): RoomDefinition {
  const c = new RoomCanvas('mn_approach', 64, 20).walls().ground(1, 63, 2);
  c.plat(1, 12, 7).plat(13, 16, 4);
  c.rock(34, 2, 36, 4).rock(46, 2, 48, 3);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('l', 9, 7).mark('x', 23, 2).mark('y', 29, 2).mark('g', 40, 2).mark('w', 44, 18).mark('q', 53, 2).mark('r', 55, 2);
  return mapRoom(
    { id: 'mn_approach', regionId: REGION, name: 'Coal Gallery', nameKey: 'room.mn_approach.name', art: { backdrop: 'mines', seed: 35 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('shardling_1', 'shardling', 'x'), m.spawn('stoneback_1', 'stoneback', 'y', { facing: 1 }), m.spawn('stoneback_2', 'stoneback', 'g'), m.spawn('bat_1', 'cave_bat', 'w')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'mn_rails', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'mn_arena', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'mn_gate', entry: 'shortcut' }, { requires: 'lever:mn_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:mn_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Colossus
/**
 * «Cámara del Coloso»: 72 × 28 m. The arena of the CRYSTAL COLOSSUS: 53 m of floor under a roof 26 m up — the rocks it brings down have far to fall — between two doors that shut when the fight begins and open when it ends. When it falls, Strong Brew lies where it
 * stood (a bottle heals one point more), and the way on, up the Bell Spire, works.
 */
export function arena(): RoomDefinition {
  const c = new RoomCanvas('mn_arena', 72, 28).walls().ground(1, 71, 2);
  c.region('A', 8, 2, 9, 27).region('B', 65, 2, 66, 27); // doors to the roof: there is no climbing over a door with the Wall Jump
  c.mark('a', 4, 2).mark('b', 67, 2).mark('l', 11, 2).mark('r', 64, 2).mark('k', 56, 2).mark('v', 60, 2);
  return mapRoom(
    { id: 'mn_arena', regionId: REGION, name: 'Colossus Chamber', nameKey: 'room.mn_arena.name', art: { backdrop: 'mines', seed: 36 }, rows: c.rows(), materials: MATERIALS, regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:mn_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:mn_boss' },
      ],
      bosses: [m.boss('colossus', 'boss_colossus', 'k', { from: 'l', to: 'r', top: 14 }, { defeatFlag: 'defeated:mn_boss', fightFlag: '~fight:mn_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 64.5, 16), bounds: rect(7, 0, 67, 26), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:mn_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'mn_approach', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'sp_foot', entry: 'west' }, { requires: 'defeated:mn_boss' })],
      interactables: [{ ...teach(m, 'relic_brew', 'v'), whenSet: 'defeated:mn_boss' }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Armoured Vault
/**
 * «Cámara Acorazada»: 44 × 22 m, under the split plateau of the Hall. The hero falls onto a ledge at the top of a staircase; at the foot of it, a Stoneback and two Shardlings keep the pedestal of the last vessel of life.
 */
export function vault(): RoomDefinition {
  const c = new RoomCanvas('mn_vault', 44, 22).walls().ground(1, 43, 2);
  const tops = [4, 7, 10, 13];
  const from = [24, 27, 30, 33];
  tops.forEach((y, i) => c.plat(from[i]!, from[i]! + 6, y));
  c.rock(36, 15, 43, 16); // the ledge
  c.rock(3, 2, 7, 4); // the pedestal
  c.mark('n', 39, 16).mark('v', 5, 4).mark('x', 12, 2).mark('y', 16, 2).mark('g', 20, 2);
  return mapRoom(
    { id: 'mn_vault', regionId: REGION, name: 'Armoured Vault', nameKey: 'room.mn_vault.name', art: { backdrop: 'mines', seed: 37 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('north', 'n', -1)],
      spawns: [m.spawn('shardling_1', 'shardling', 'x'), m.spawn('shardling_2', 'shardling', 'y'), m.spawn('stoneback_1', 'stoneback', 'g', { facing: 1 })],
      exits: [m.exitShaft('north', 'north', 'n', { room: 'mn_hall', entry: 'vault' }, { width: 6, depth: 2 })],
      interactables: [vessel(m, 'life_5', 'v')],
    }),
  );
}

export const MINES_ROOMS: readonly RoomDefinition[] = [gate(), seam(), hall(), camp(), forge(), well(), rails(), approach(), arena(), vault()];
