import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { abilityFlag } from '@/world/worldGraph';
import { lever, teach, vessel } from './kit';

/**
 * THE GLOWMIRE (docs/PROMPT21-LOG.md): a swamp lit by lanterns that are not lanterns. Wood walkways over black water — a pit, to the hero: fall in and the hero is out of the world — and the creatures that live on them: the Mire Toad, which leaps where
 * the hero IS and shakes the floor where it lands, and the Lantern Wisp, which floats to the hero and goes off. It teaches the WALL JUMP (in the Sinkhole, which asks for it at once) and ends with the MIRE MATRIARCH.
 *
 *   rt_arena → mr_edge → mr_stilts → mr_lanterns → mr_toadpit → mr_shrine → mr_sink → mr_climb → mr_approach → mr_lair → (the Crystal Mines)
 *                ↑  ╲ a door that the lever in the approach opens: the way home       ┆ the Slam                              ┆ shrine, lever, shortcut
 *                │    └ mr_den (a vessel of life, under the cracked floor of the stilts) ┘
 */
const REGION = 'glowmire';
/** What the squares of the canvas are made of here (the earth of the mire is mud (the stone and the timber are the ruins')): a material is a piece of art (docs/PROMPT23-LOG.md §5). */
const MATERIALS = { G: 'mud' } as const;

// ---------------------------------------------------------------------------------------------------------------- the Edge
/**
 * «Orilla»: 64 × 18 m. Four islands of earth in black water, 5 and 6 m apart — a running jump — with a toad on each of the middle two. Over them, a road of walkways for whoever climbs the stairs at the west end: it goes over the toads and puts the hero on the
 * last island. Also up the stairs, a gallery with a stone door in it: the way home, which the lever in the approach opens.
 */
export function edge(): RoomDefinition {
  const c = new RoomCanvas('mr_edge', 64, 18).walls().ground(1, 16, 2).ground(21, 34, 2).ground(39, 52, 2).ground(57, 63, 2).pit(16, 21).pit(34, 39).pit(52, 57);
  c.plat(1, 12, 7).plat(13, 16, 4).region('D', 8, 7, 9, 11); // the gallery, the stairs to it, the door
  c.plat(17, 21, 6).plat(25, 30, 6).plat(34, 39, 6).plat(43, 48, 6).plat(52, 57, 6); // the high road
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('t', 28, 2).mark('u', 41, 2).mark('v', 44, 2);
  return mapRoom(
    { id: 'mr_edge', regionId: REGION, name: 'Mire Edge', nameKey: 'room.mr_edge.name', art: { backdrop: 'mire', seed: 18 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('toad_1', 'mire_toad', 't'), m.spawn('toad_2', 'mire_toad', 'u'), m.spawn('toad_3', 'mire_toad', 'v')],
      gates: [m.gate('home_gate', 'home_door', 'lever:mr_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'rt_arena', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'mr_stilts', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'mr_approach', entry: 'shortcut' }, { requires: 'lever:mr_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Stilts
/**
 * «Pasarelas»: 76 × 22 m. A boardwalk of seven walkways on stilts, each 2 m above or below the last, with wisps floating over them and a spitter on the highest; under it, a floor of earth with strips of thorns, a leech between them and a toad. Either road
 * gets across. In the floor, a stretch that is split: the Ground Slam breaks it and the hero falls into the Den.
 */
export function stilts(): RoomDefinition {
  const c = new RoomCanvas('mr_stilts', 76, 22).walls().ground(1, 75, 2).air(56, 0, 59, 1).region('F', 56, 1, 59, 2);
  c.spikes(20, 24, 2).spikes(38, 43, 2).spikes(62, 66, 2);
  c.plat(9, 15, 4).plat(18, 24, 6).plat(27, 33, 8).plat(36, 42, 10).plat(45, 51, 8).plat(54, 60, 6).plat(63, 69, 4);
  c.mark('a', 5, 2).mark('b', 70, 2).mark('d', 60, 2).mark('k', 57, 2).mark('l', 30, 2).mark('t', 44, 2).mark('s', 48, 8).mark('x', 21, 13).mark('y', 39, 15).mark('z', 57, 12);
  return mapRoom(
    { id: 'mr_stilts', regionId: REGION, name: 'Stilt Walkways', nameKey: 'room.mr_stilts.name', art: { backdrop: 'mire', seed: 19 }, rows: c.rows(), materials: MATERIALS, regions: { F: { id: 'crack_floor', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('den', 'd', 1)],
      spawns: [m.spawn('leech_1', 'floor_leech', 'l'), m.spawn('toad_1', 'mire_toad', 't'), m.spawn('spitter_1', 'ink_spitter', 's'), m.spawn('wisp_1', 'lantern_wisp', 'x'), m.spawn('wisp_2', 'lantern_wisp', 'y'), m.spawn('wisp_3', 'lantern_wisp', 'z')],
      gates: [m.gate('crack_gate', 'crack_floor', 'broken:mr_stilts_crack')],
      seals: [m.seal('crack', 'k', { area: rect(55.9, 1.4, 59.1, 2.4), style: 'crack', accepts: ['slam', 'slam_dive'], flag: 'broken:mr_stilts_crack', needs: abilityFlag('ground_slam') })],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'mr_edge', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'mr_lanterns', entry: 'west' }),
        m.exitShaft('den', 'south', 'k', { room: 'mr_den', entry: 'north' }, { width: 3, depth: 1, requires: 'broken:mr_stilts_crack' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Lanterns
/**
 * «Farolillos»: 60 × 20 m. A dark hall of low stones and mushroom caps where four Lantern Wisps drift at four heights. Each goes to the hero when they come close and goes off: put it out first (a bolt, a blow) or put a pillar between. At the east end a stone door, and in front
 * of it the toad that keeps it: it opens when the toad falls.
 */
export function lanterns(): RoomDefinition {
  const c = new RoomCanvas('mr_lanterns', 60, 20).walls().ground(1, 59, 2);
  c.rock(18, 2, 20, 4).rock(30, 2, 32, 4).rock(38, 2, 40, 4); // low stones to jump
  c.plat(21, 27, 6).plat(33, 37, 7).plat(42, 47, 5); // the caps of three mushrooms
  c.region('D', 52, 2, 53, 10);
  c.mark('a', 5, 2).mark('b', 55, 2).mark('t', 47, 2).mark('w', 16, 6).mark('x', 24, 9).mark('y', 34, 5).mark('z', 43, 10);
  return mapRoom(
    { id: 'mr_lanterns', regionId: REGION, name: 'Lanterns', nameKey: 'room.mr_lanterns.name', art: { backdrop: 'mire', seed: 20 }, rows: c.rows(), materials: MATERIALS, regions: { D: { id: 'mire_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toad_key', 'mire_toad', 't', { defeatFlag: 'defeated:mr_lanterns_toad' }), m.spawn('wisp_1', 'lantern_wisp', 'w'), m.spawn('wisp_2', 'lantern_wisp', 'x'), m.spawn('wisp_3', 'lantern_wisp', 'y'), m.spawn('wisp_4', 'lantern_wisp', 'z')],
      gates: [m.gate('mire_gate', 'mire_door', 'defeated:mr_lanterns_toad')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mr_stilts', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'mr_toadpit', entry: 'west' }, { requires: 'defeated:mr_lanterns_toad' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Toad Pit
/**
 * «Foso de los Sapos»: 44 × 30 m. A pit of thorns with a staircase of six platforms down it — each 3 m below the last, overlapping —and a toad on the second and on the fourth, 5 m or more above the way out. The hero comes in at the top, on a ledge, and the way on is on the bottom, on the only earth
 * that is not thorns. A fall costs a point of life; the toads' shocks cost more.
 */
export function toadpit(): RoomDefinition {
  const c = new RoomCanvas('mr_toadpit', 44, 30).walls().ground(1, 43, 2).spikes(1, 36, 2);
  const tops = [4, 7, 10, 13, 16, 19];
  const from = [27, 23, 19, 15, 11, 7];
  tops.forEach((y, i) => c.plat(from[i]!, from[i]! + 9, y));
  c.rock(1, 21, 9, 22); // the ledge
  c.mark('a', 5, 22).mark('b', 38, 2).mark('t', 27, 7).mark('v', 19, 13);
  return mapRoom(
    { id: 'mr_toadpit', regionId: REGION, name: 'Toad Pit', nameKey: 'room.mr_toadpit.name', art: { backdrop: 'mire', seed: 21 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toad_1', 'mire_toad', 't'), m.spawn('toad_2', 'mire_toad', 'v')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mr_lanterns', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'mr_shrine', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Landing
/**
 * «Embarcadero»: 40 × 16 m. A plank bridge over black water, and a pier with the shrine on it: the first place to rest in the Glowmire. The east door is on the pier. A lantern wisp hangs over the water, and the bridge is the way under it: the toll of the rest.
 */
export function landing(): RoomDefinition {
  const c = new RoomCanvas('mr_shrine', 40, 16).walls().ground(1, 39, 2).pit(12, 18).plat(12, 18, 2);
  c.rock(26, 2, 39, 4); // the pier
  c.mark('a', 5, 2).mark('b', 34, 4).mark('q', 29, 4).mark('r', 31, 4).mark('w', 16, 8);
  return mapRoom(
    { id: 'mr_shrine', regionId: REGION, name: 'Landing', nameKey: 'room.mr_shrine.name', art: { backdrop: 'mire', seed: 22 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      spawns: [m.spawn('wisp_1', 'lantern_wisp', 'w')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mr_toadpit', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'mr_sink', entry: 'west' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Sinkhole
/**
 * «Sumidero»: 24 × 32 m. A chamber where the WALL JUMP lies on a pedestal, with two leeches in the dust, and beside it a chimney 4 m wide and 22 m tall between two bare faces of stone: the way on is at the top. The hero who has the ability kicks up it, one face
 * and the other, and comes out on a ledge with the door on it; a hero without it can only look up. The way back is a drop.
 */
export function sink(): RoomDefinition {
  const c = new RoomCanvas('mr_sink', 24, 32).walls().ground(1, 23, 2);
  c.rock(11, 5, 12, 27); // the west face of the chimney, with a doorway 3 m high at its foot
  c.rock(16, 2, 23, 27); // the east face, which is a block with the ledge on top of it
  c.rock(5, 2, 8, 4); // the pedestal
  c.mark('a', 4, 2).mark('e', 19, 27).mark('r', 6, 4).mark('l', 9, 2).mark('m', 14, 2);
  return mapRoom(
    { id: 'mr_sink', regionId: REGION, name: 'Sinkhole', nameKey: 'room.mr_sink.name', art: { backdrop: 'mire', seed: 23 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('leech_1', 'floor_leech', 'l'), m.spawn('leech_2', 'floor_leech', 'm')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mr_shrine', entry: 'east' }), m.exitSide('east', 'east', 'e', { room: 'mr_climb', entry: 'west' })],
      interactables: [teach(m, 'wall_jump', 'r')],
      needs: [{ target: 'exit:east', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Mushroom Walls
/**
 * «Muros de Hongos»: 60 × 20 m. A floor crossed by three walls of stone 8 m tall and 2 m thick, with a creature in each stretch between them: a toad, a glow spore, a wisp, a toad. A wall is no jump; it is a face to kick off, over and over, until the top, and
 * then the drop on the other side.
 */
export function walls(): RoomDefinition {
  const c = new RoomCanvas('mr_climb', 60, 20).walls().ground(1, 59, 2);
  c.rock(14, 2, 16, 10).rock(28, 2, 30, 10).rock(42, 2, 44, 10);
  c.mark('a', 5, 2).mark('b', 54, 2).mark('t', 20, 2).mark('p', 24, 2).mark('w', 38, 8).mark('u', 34, 2);
  return mapRoom(
    { id: 'mr_climb', regionId: REGION, name: 'Mushroom Walls', nameKey: 'room.mr_climb.name', art: { backdrop: 'mire', seed: 24 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('toad_1', 'mire_toad', 't'), m.spawn('spore_1', 'glow_spore', 'p'), m.spawn('wisp_1', 'lantern_wisp', 'w'), m.spawn('toad_2', 'mire_toad', 'u')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'mr_sink', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'mr_approach', entry: 'west' })],
      needs: [{ target: 'exit:east', abilities: ['wall_jump'] }, { target: 'exit:west', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Approach
/**
 * «Pantano Hondo»: 64 × 20 m. The last stretch before the Matriarch: two toads, a spore, a spitter on a perch and a wisp over the middle, and at the east end the shrine — the last place to rest. On a gallery in the west, a lever: it opens the stone door in the Edge,
 * and from here a way leads straight back to it.
 */
export function approach(): RoomDefinition {
  const c = new RoomCanvas('mr_approach', 64, 20).walls().ground(1, 63, 2);
  c.plat(1, 12, 7).plat(13, 16, 4).plat(37, 42, 8);
  c.rock(22, 2, 24, 4).rock(46, 2, 48, 3);
  c.mark('a', 5, 2).mark('b', 58, 2).mark('s', 6, 7).mark('l', 9, 7).mark('t', 27, 2).mark('u', 31, 2).mark('p', 35, 2).mark('x', 39, 8).mark('w', 32, 12).mark('q', 53, 2).mark('r', 55, 2);
  return mapRoom(
    { id: 'mr_approach', regionId: REGION, name: 'Deep Mire', nameKey: 'room.mr_approach.name', art: { backdrop: 'mire', seed: 25 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('toad_1', 'mire_toad', 't'), m.spawn('toad_2', 'mire_toad', 'u'), m.spawn('spore_1', 'glow_spore', 'p'), m.spawn('spitter_1', 'ink_spitter', 'x'), m.spawn('wisp_1', 'lantern_wisp', 'w')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'mr_climb', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'mr_lair', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'mr_edge', entry: 'shortcut' }, { requires: 'lever:mr_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:mr_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Lair
/**
 * «Charca de la Matriarca»: 72 × 26 m. The arena of the MIRE MATRIARCH: 53 m of floor between two doors that shut when the fight begins and open when it ends, with an island of mud 20 m wide in the middle of it and a pool of black water beyond the east door. When she
 * falls a vessel of magic appears where she stood, and the way on, to the Crystal Mines, works.
 */
export function lair(): RoomDefinition {
  const c = new RoomCanvas('mr_lair', 72, 26).walls().ground(1, 71, 2);
  c.region('A', 8, 2, 9, 25).region('B', 65, 2, 66, 25); // doors to the roof: there is no climbing over a door with the Wall Jump
  c.plat(26, 46, 4); // an island of mud in the middle of the pool, 2 m up: out of the way of her tongue
  c.mark('a', 4, 2).mark('b', 67, 2).mark('l', 11, 2).mark('r', 64, 2).mark('k', 56, 2).mark('v', 60, 2);
  return mapRoom(
    { id: 'mr_lair', regionId: REGION, name: 'Matriarch Pool', nameKey: 'room.mr_lair.name', art: { backdrop: 'mire', seed: 26 }, rows: c.rows(), materials: MATERIALS, regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:mr_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:mr_boss' },
      ],
      bosses: [m.boss('matriarch', 'boss_mire_matriarch', 'k', { from: 'l', to: 'r', top: 14 }, { defeatFlag: 'defeated:mr_boss', fightFlag: '~fight:mr_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 64.5, 16), bounds: rect(7, 0, 67, 24), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:mr_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'mr_approach', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'mn_gate', entry: 'west' }, { requires: 'defeated:mr_boss' })],
      interactables: [{ ...vessel(m, 'mana_2', 'v'), whenSet: 'defeated:mr_boss' }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Den
/**
 * «Madriguera»: 48 × 22 m, under the cracked floor of the Stilts. The hero falls onto a ledge at the top of a staircase; the vessel of life is on a pedestal at the far end of a floor where three toads sleep. The staircase is the way back up.
 */
export function den(): RoomDefinition {
  const c = new RoomCanvas('mr_den', 48, 22).walls().ground(1, 47, 2);
  const tops = [4, 7, 10, 13];
  const from = [16, 13, 10, 7];
  tops.forEach((y, i) => c.plat(from[i]!, from[i]! + 6, y));
  c.rock(1, 15, 10, 16); // the ledge
  c.rock(40, 2, 44, 4); // the pedestal
  c.mark('n', 5, 16).mark('v', 42, 4).mark('t', 26, 2).mark('u', 31, 2).mark('w', 36, 2);
  return mapRoom(
    { id: 'mr_den', regionId: REGION, name: 'Toad Den', nameKey: 'room.mr_den.name', art: { backdrop: 'mire', seed: 27 }, rows: c.rows(), materials: MATERIALS },
    (m) => ({
      entries: [m.entry('north', 'n', 1)],
      spawns: [m.spawn('toad_1', 'mire_toad', 't'), m.spawn('toad_2', 'mire_toad', 'u'), m.spawn('toad_3', 'mire_toad', 'w')],
      exits: [m.exitShaft('north', 'north', 'n', { room: 'mr_stilts', entry: 'den' }, { width: 6, depth: 2 })],
      interactables: [vessel(m, 'life_4', 'v')],
    }),
  );
}

export const MIRE_ROOMS: readonly RoomDefinition[] = [edge(), stilts(), lanterns(), toadpit(), landing(), sink(), walls(), approach(), lair(), den()];
