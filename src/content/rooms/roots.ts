import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { ANY_BLOW, lever, teach, vessel } from './kit';

/**
 * THE SUNKEN ROOTS (docs/PROMPT21-LOG.md): the first zone below the ruins, reached by the hole in the floor of the Nave. Damp earth, hanging roots and long drops; its creatures are the ones that live in them — the Bramble Crawler, the Cave Bat, the Floor
 * Leech, the Glow Spore. It teaches the DOUBLE JUMP (in the Echo Chamber, which then asks for it at once) and ends with the ROOT TYRANT.
 *
 *   ru_nave ↓ rt_mouth → rt_tangle → rt_hollow ↑ rt_cellar → rt_bridge → rt_echo → rt_gallery → rt_arena → (the Glowmire)
 *             ↑                                      ┆ shrine                          ┆ shrine     ┆ hideout (Wall Jump)
 *             └─ a door that the lever in the cellar opens: the way home
 */
const REGION = 'sunken_roots';

// ---------------------------------------------------------------------------------------------------------------- the Mouth
/**
 * «Boca de las Raíces»: 30 × 36 m. The hero falls out of the Nave onto a ledge and goes down a spiral of platforms — eleven of them, each 2 or 3 m above the last, overlapping so that a jump goes straight up through the next one — to a floor with a crawler on
 * it. Two bats hang from the roof, over the ledge's two ends, and the climb back is the same spiral. On the ledge, to the east, a stone door: a way home that something on the other side of the zone opens.
 */
export function mouth(): RoomDefinition {
  const c = new RoomCanvas('rt_mouth', 30, 36).walls().ground(1, 29, 2);
  const tops = [4, 7, 9, 12, 14, 17, 19, 22, 24, 27];
  const from = [3, 8, 13, 18, 13, 8, 3, 8, 13, 18];
  tops.forEach((y, i) => c.plat(from[i]!, from[i]! + 8, y));
  c.plat(10, 29, 29); // the ledge the hero lands on
  c.region('D', 21, 29, 22, 33); // the door of the way home
  c.mark('n', 16, 29).mark('s', 24, 29).mark('e', 24, 2).mark('c', 20, 2).mark('x', 4, 34).mark('y', 26, 34);
  return mapRoom(
    { id: 'rt_mouth', regionId: REGION, name: 'Mouth of the Roots', nameKey: 'room.rt_mouth.name', art: { backdrop: 'ruins', seed: 9 }, rows: c.rows(), regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('north', 'n', 1), m.entry('shortcut', 's', -1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('crawler_1', 'bramble_crawler', 'c'), m.spawn('bat_1', 'cave_bat', 'x', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'y')],
      gates: [m.gate('home_gate', 'home_door', 'lever:rt_lift')],
      exits: [
        m.exitShaft('north', 'north', 'n', { room: 'ru_nave', entry: 'roots' }, { width: 6, depth: 3 }),
        m.exitSide('east', 'east', 'e', { room: 'rt_tangle', entry: 'west' }),
        m.exitSide('shortcut', 'east', 's', { room: 'rt_cellar', entry: 'shortcut' }, { requires: 'lever:rt_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Tangle
/**
 * «Maraña»: 66 × 18 m. A floor with two strips of thorns on it, 4 m each, and between them 5 m of safe earth where a Floor Leech lies in wait — the first jump lands next to it. Past them a crawler; over them a bat on the roof. The high road is three platforms
 * that climb to a block of stone with a split wall in it: behind the crack, a vessel of life.
 */
export function tangle(): RoomDefinition {
  const c = new RoomCanvas('rt_tangle', 66, 18).walls().ground(1, 65, 2);
  c.spikes(22, 26, 2).spikes(31, 35, 2);
  c.plat(40, 44, 4).plat(45, 49, 7).plat(50, 55, 10);
  c.rock(55, 9, 63, 15).air(56, 10, 62, 14).region('W', 55, 10, 56, 14); // the block and its hollow, shut by the split wall
  c.mark('a', 5, 2).mark('b', 59, 2).mark('c', 10, 2).mark('d', 48, 2).mark('l', 28, 2).mark('x', 37, 16).mark('w', 54, 10).mark('v', 59, 10);
  return mapRoom(
    { id: 'rt_tangle', regionId: REGION, name: 'Tangle', nameKey: 'room.rt_tangle.name', art: { backdrop: 'ruins', seed: 10 }, rows: c.rows(), regions: { W: { id: 'nook_wall', material: 'stone', tag: 'crack' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('crawler_1', 'bramble_crawler', 'c'), m.spawn('leech_1', 'floor_leech', 'l'), m.spawn('crawler_2', 'bramble_crawler', 'd'), m.spawn('bat_1', 'cave_bat', 'x')],
      gates: [m.gate('nook_gate', 'nook_wall', 'broken:rt_tangle_wall')],
      seals: [m.seal('crack', 'w', { area: rect(54.6, 10, 56.4, 14), style: 'crack', accepts: ANY_BLOW, flag: 'broken:rt_tangle_wall' })],
      exits: [m.exitSide('west', 'west', 'a', { room: 'rt_mouth', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'rt_hollow', entry: 'west' })],
      interactables: [vessel(m, 'life_2', 'v')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Hollow
/**
 * «Tronco Hueco»: 28 × 44 m. The inside of a trunk, climbed on eighteen shelves — nine on each wall, 2 m above one another, 3 m of open air between a left one and a right one — with a floor of thorns under the whole of it (only the first few metres by the door are
 * safe): a fall costs a point of life and a long way up again. Three glow spores sit on the shelves, and two bats under the roof wait for whoever is almost there.
 */
export function hollow(): RoomDefinition {
  const c = new RoomCanvas('rt_hollow', 28, 44).walls().ground(1, 27, 2);
  c.spikes(10, 27, 2);
  for (let i = 0; i < 18; i++) {
    const y = 4 + i * 2;
    if (i % 2 === 0) c.rock(i === 0 ? 6 : 1, y - 1, 14, y);
    else c.rock(17, y - 1, 27, y);
  }
  c.mark('a', 5, 2).mark('e', 22, 38).mark('p', 22, 10).mark('q', 7, 20).mark('r', 22, 30).mark('x', 6, 42).mark('y', 15, 42);
  return mapRoom(
    { id: 'rt_hollow', regionId: REGION, name: 'Hollow Trunk', nameKey: 'room.rt_hollow.name', art: { backdrop: 'ruins', seed: 11 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'e', -1)],
      spawns: [m.spawn('spore_1', 'glow_spore', 'p'), m.spawn('spore_2', 'glow_spore', 'q'), m.spawn('spore_3', 'glow_spore', 'r'), m.spawn('bat_1', 'cave_bat', 'x', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'y')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'rt_tangle', entry: 'east' }), m.exitSide('east', 'east', 'e', { room: 'rt_cellar', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Cellar
/**
 * «Bodega de Semillas»: 48 × 16 m. A quiet cellar of barrels and sacks, with the shrine in the middle — the first place to rest in the Roots. On a gallery to the west, a lever: it opens the stone door in the Mouth, and from here a way leads straight back to it,
 * past the Tangle and the Hollow. No enemy lives here.
 */
export function cellar(): RoomDefinition {
  const c = new RoomCanvas('rt_cellar', 48, 16).walls().ground(1, 47, 2);
  c.rock(14, 2, 16, 3).rock(31, 2, 33, 4).rock(35, 2, 36, 3);
  c.plat(1, 14, 7).plat(16, 20, 4);
  c.mark('a', 5, 2).mark('b', 43, 2).mark('q', 22, 2).mark('r', 24, 2).mark('s', 5, 7).mark('l', 9, 7);
  return mapRoom(
    { id: 'rt_cellar', regionId: REGION, name: 'Seed Cellar', nameKey: 'room.rt_cellar.name', art: { backdrop: 'ruins', seed: 12 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'rt_hollow', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'rt_bridge', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'rt_mouth', entry: 'shortcut' }, { requires: 'lever:rt_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:rt_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Bridge
/**
 * «Puente de Raíz»: 72 × 18 m. A chasm 46 m wide and no floor under it — fall and the hero is out of the world — crossed on five platforms of roots, 4 m of air between each. A crawler on the near bank, an Ink Spitter on the far one, and three bats on the roof over the
 * crossing: the only room of the zone where the danger is above the hero and the way is a series of jumps.
 */
export function bridge(): RoomDefinition {
  const c = new RoomCanvas('rt_bridge', 72, 18).walls().ground(1, 13, 8).ground(59, 71, 8).pit(13, 59);
  c.plat(15, 20, 8).plat(24, 29, 9).plat(33, 38, 10).plat(42, 47, 9).plat(51, 56, 8);
  c.mark('a', 5, 8).mark('b', 66, 8).mark('c', 8, 8).mark('s', 64, 8).mark('x', 22, 16).mark('y', 36, 16).mark('z', 49, 16);
  return mapRoom(
    { id: 'rt_bridge', regionId: REGION, name: 'Root Bridge', nameKey: 'room.rt_bridge.name', art: { backdrop: 'ruins', seed: 13 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('crawler_1', 'bramble_crawler', 'c'), m.spawn('spitter_1', 'ink_spitter', 's'), m.spawn('bat_1', 'cave_bat', 'x', { facing: 1 }), m.spawn('bat_2', 'cave_bat', 'y'), m.spawn('bat_3', 'cave_bat', 'z')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'rt_cellar', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'rt_echo', entry: 'west' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Echo Chamber
/**
 * «Cámara del Eco»: 52 × 22 m. The hall where the DOUBLE JUMP lies, on a pedestal in the middle, under the fire of three Ink Spitters on perches around it. And the room asks for it at once: the door on is on a plateau 4 m above the floor, a wall to a hero
 * with the dash and the air dash (3 m is the most they clear, however they time it) and a step to one with the second jump (5 m). The way back is a drop.
 */
export function echo(): RoomDefinition {
  const c = new RoomCanvas('rt_echo', 52, 22).walls().ground(1, 51, 2);
  c.rock(12, 2, 17, 4); // the pedestal
  c.rock(33, 2, 51, 6); // the plateau with the door on it
  c.plat(5, 10, 8).plat(19, 24, 8);
  c.mark('a', 5, 2).mark('b', 44, 6).mark('r', 14, 4).mark('x', 7, 8).mark('y', 21, 8).mark('z', 35, 6);
  return mapRoom(
    { id: 'rt_echo', regionId: REGION, name: 'Echo Chamber', nameKey: 'room.rt_echo.name', art: { backdrop: 'ruins', seed: 14 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('spitter_1', 'ink_spitter', 'x', { facing: 1 }), m.spawn('spitter_2', 'ink_spitter', 'y'), m.spawn('spitter_3', 'ink_spitter', 'z')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'rt_bridge', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'rt_gallery', entry: 'west' })],
      interactables: [teach(m, 'double_jump', 'r')],
      needs: [{ target: 'exit:east', abilities: ['double_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Gallery
/**
 * «Galería del Tirano»: 64 × 22 m. The long hall before the arena. Leeches in the damp, a crawler and a glow spore in the middle, a shrine at the east end — the last place to rest — and in the middle of the hall, a chimney 3 m wide that goes up 15 m between two bare walls
 * (the hall passes through its foot by a doorway on each side): the hero who has the WALL JUMP kicks up it and comes out on a ledge under a hole in the roof, which leads to the Hideout.
 */
export function gallery(): RoomDefinition {
  const c = new RoomCanvas('rt_gallery', 64, 22).walls().ground(1, 63, 2);
  c.rock(14, 2, 16, 4).rock(24, 2, 26, 4);
  c.rock(29, 5, 30, 17).rock(33, 5, 34, 20); // the shaft: two walls with a doorway 3 m high at the bottom of each — the hall goes through it — and the chimney between them
  c.rock(21, 16, 29, 17); // the ledge it comes out on, to the west
  c.air(22, 21, 27, 22); // the hole in the roof over it
  c.mark('a', 5, 2).mark('b', 59, 2).mark('l', 9, 2).mark('m', 20, 2).mark('c', 36, 2).mark('p', 43, 2).mark('q', 50, 2).mark('r', 52, 2).mark('k', 24, 17);
  return mapRoom(
    { id: 'rt_gallery', regionId: REGION, name: 'Tyrant Gallery', nameKey: 'room.rt_gallery.name', art: { backdrop: 'ruins', seed: 15 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('hideout', 'k', 1)],
      spawns: [m.spawn('leech_1', 'floor_leech', 'l'), m.spawn('leech_2', 'floor_leech', 'm'), m.spawn('crawler_1', 'bramble_crawler', 'c'), m.spawn('spore_1', 'glow_spore', 'p')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'rt_echo', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'rt_arena', entry: 'west' }),
        m.exitShaft('hideout', 'north', 'k', { room: 'rt_hideout', entry: 'south' }, { width: 4, depth: 2 }),
      ],
      interactables: [m.shrine('r')],
      needs: [{ target: 'exit:hideout', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Hideout
/**
 * «Guarida Oculta»: 34 × 18 m, above the Gallery. A hole in the floor takes the hero back; past it, a pedestal with the Siphon Bead — a blow that lands gives magic back — and two Floor Leeches lying in the dust between.
 */
export function hideout(): RoomDefinition {
  const c = new RoomCanvas('rt_hideout', 34, 18).walls().ground(1, 33, 2).pit(7, 11);
  c.rock(28, 2, 32, 4);
  c.mark('s', 4, 2).mark('h', 9, 2).mark('l', 16, 2).mark('m', 22, 2).mark('r', 30, 4);
  return mapRoom(
    { id: 'rt_hideout', regionId: REGION, name: 'Hideout', nameKey: 'room.rt_hideout.name', art: { backdrop: 'ruins', seed: 16 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('south', 's', 1)],
      spawns: [m.spawn('leech_1', 'floor_leech', 'l'), m.spawn('leech_2', 'floor_leech', 'm')],
      exits: [m.exitShaft('south', 'south', 'h', { room: 'rt_gallery', entry: 'hideout' }, { width: 4, depth: 1 })],
      interactables: [teach(m, 'relic_siphon', 'r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Arena
/**
 * «Trono de Raíces»: 72 × 26 m. The arena of the ROOT TYRANT: 53 m of flat floor between two stone doors that shut when the fight begins (the hero's feet crossing x = 11.5) and open when it ends. The Tyrant waits at the east end. When it falls, a vessel of life appears
 * where it stood, and the door to the east — the way on, to the Glowmire — works.
 */
export function arena(): RoomDefinition {
  const c = new RoomCanvas('rt_arena', 72, 26).walls().ground(1, 71, 2);
  c.region('A', 8, 2, 9, 25).region('B', 65, 2, 66, 25); // doors to the roof: there is no climbing over a door with the Wall Jump
  c.mark('a', 4, 2).mark('b', 67, 2).mark('l', 11, 2).mark('r', 64, 2).mark('k', 56, 2).mark('v', 60, 2);
  return mapRoom(
    { id: 'rt_arena', regionId: REGION, name: 'Root Throne', nameKey: 'room.rt_arena.name', art: { backdrop: 'ruins', seed: 17 }, rows: c.rows(), regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:rt_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:rt_boss' },
      ],
      bosses: [m.boss('tyrant', 'boss_root_tyrant', 'k', { from: 'l', to: 'r', top: 14 }, { defeatFlag: 'defeated:rt_boss', fightFlag: '~fight:rt_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 64.5, 16), bounds: rect(7, 0, 67, 24), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:rt_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'rt_gallery', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'mr_edge', entry: 'west' }, { requires: 'defeated:rt_boss' })],
      interactables: [{ ...vessel(m, 'life_3', 'v'), whenSet: 'defeated:rt_boss' }],
    }),
  );
}

export const ROOTS_ROOMS: readonly RoomDefinition[] = [mouth(), tangle(), hollow(), cellar(), bridge(), echo(), gallery(), hideout(), arena()];
