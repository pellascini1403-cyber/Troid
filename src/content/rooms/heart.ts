import { rect } from '@/world/builders';
import { mapRoom, RoomCanvas } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { lever } from './kit';

/**
 * THE HEART OF THE INK (docs/PROMPT21-LOG.md): where the ink comes from. Black, quiet, and it beats. The last zone asks of the hero everything the others did — a ladder of Double Jumps over spikes, a chimney that only the Wall Jump climbs — and puts
 * the creatures of all of them against them, with a new one among them: the Veil Shade, which vanishes when the hero comes close and comes back behind them. It ends with the INKHEART SOVEREIGN, and after the Sovereign, the end.
 *
 *   fd_arena → ih_threshold → ih_veins → ih_shrine → ih_ascent → ih_approach → ih_arena → ih_end → (the end of the adventure)
 *                ↑ ╲ a door that the lever in the antechamber opens                  ┆ shrine ┆ shrine, lever ┆ the last rest
 *                │   └──────────────────────────────────────────────────────────────┘
 */
const REGION = 'ink_heart';

// ---------------------------------------------------------------------------------------------------------------- the Threshold
/**
 * «Umbral»: 56 × 20 m. The first room of the Heart: a floor of black stone between pillars, two Veil Shades walking it — each vanishes when the hero comes within 6 m and returns 2 m behind them: keep moving, or turn round — and, up the stairs at the west end, a
 * gallery with a stone door in it: the way home, which the lever in the antechamber opens.
 */
export function threshold(): RoomDefinition {
  const c = new RoomCanvas('ih_threshold', 56, 20).walls().ground(1, 55, 2);
  c.plat(1, 12, 7).plat(13, 16, 4).region('D', 8, 7, 9, 11);
  c.rock(20, 2, 22, 4).rock(34, 2, 36, 4);
  c.mark('a', 5, 2).mark('b', 50, 2).mark('s', 6, 7).mark('x', 27, 2).mark('y', 38, 2);
  return mapRoom(
    { id: 'ih_threshold', regionId: REGION, name: 'Threshold', nameKey: 'room.ih_threshold.name', art: { backdrop: 'ruins', seed: 58 }, rows: c.rows(), regions: { D: { id: 'home_door', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('shade_1', 'veil_shade', 'x', { facing: 1 }), m.spawn('shade_2', 'veil_shade', 'y')],
      gates: [m.gate('home_gate', 'home_door', 'lever:ih_lift')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'fd_arena', entry: 'east' }),
        m.exitSide('east', 'east', 'b', { room: 'ih_veins', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'ih_approach', entry: 'shortcut' }, { requires: 'lever:ih_lift' }),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Veins
/**
 * «Venas»: 84 × 24 m. A floor of spikes 62 m wide and seven planks over it — three that climb, 4 m apart each, a level stretch of two with a gap of 4 m between them and three that go down — with two Veil Shades on the level stretch, an Ink Weaver on the top of the
 * climb and a toller on the way down. Every step up is a Double Jump; the way down is a drop.
 */
export function veins(): RoomDefinition {
  const c = new RoomCanvas('ih_veins', 84, 24).walls().ground(1, 83, 2).spikes(11, 73, 2);
  c.plat(12, 18, 6).plat(20, 26, 10).plat(28, 34, 14).plat(38, 44, 14).plat(48, 54, 14).plat(58, 64, 10).plat(66, 72, 6);
  c.mark('a', 5, 2).mark('b', 78, 2).mark('w', 31, 14).mark('x', 41, 14).mark('y', 51, 14).mark('t', 61, 10);
  return mapRoom(
    { id: 'ih_veins', regionId: REGION, name: 'Veins', nameKey: 'room.ih_veins.name', art: { backdrop: 'ruins', seed: 59 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      spawns: [m.spawn('weaver_1', 'ink_weaver', 'w', { facing: 1 }), m.spawn('shade_1', 'veil_shade', 'x', { facing: 1 }), m.spawn('shade_2', 'veil_shade', 'y'), m.spawn('toller_1', 'bell_toller', 't')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ih_threshold', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ih_shrine', entry: 'west' })],
      needs: [{ target: 'exit:east', abilities: ['double_jump'] }, { target: 'exit:west', abilities: ['double_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Pulse
/**
 * «Latido»: 36 × 16 m. A small round room where the floor beats, very slowly. The shrine is in the middle of it — the first place to rest in the Heart. The veins of the floor are black and sharp at the east end, and a leech lies in the west one.
 */
export function pulse(): RoomDefinition {
  const c = new RoomCanvas('ih_shrine', 36, 16).walls().ground(1, 35, 2);
  c.rock(12, 2, 15, 3).rock(22, 2, 25, 3);
  c.spikes(27, 29, 2); // the veins at the east end
  c.mark('a', 5, 2).mark('b', 30, 2).mark('q', 17, 2).mark('r', 19, 2).mark('l', 9, 2);
  return mapRoom(
    { id: 'ih_shrine', regionId: REGION, name: 'Pulse', nameKey: 'room.ih_shrine.name', art: { backdrop: 'ruins', seed: 60 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1)],
      spawns: [m.spawn('leech_1', 'floor_leech', 'l')],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ih_veins', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ih_ascent', entry: 'bottom' })],
      interactables: [m.shrine('r')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Ascent
/**
 * «Ascenso»: 30 × 50 m. Two chimneys, one above the other and on opposite sides, with a gallery between them: the first, 5 m wide and 20 m tall, between the wall and a block of black stone that fills the room; on top of the block, a corridor 22 m long with a
 * Veil Shade in it that ends in a tunnel under a second block; and on the other side of the tunnel the second chimney, 5 m wide and 22 m tall, between that block and the east wall. The door on is at the top, over the first chimney, on a slab that the second one
 * comes out on. The Wall Jump twice, and a shade between the two.
 */
export function ascent(): RoomDefinition {
  const c = new RoomCanvas('ih_ascent', 30, 50).walls().ground(1, 29, 2);
  c.rock(6, 2, 29, 22); // the block, with the gallery on top of it
  c.rock(17, 25, 24, 44); // the second block, with a tunnel at its foot
  c.rock(1, 43, 17, 44); // the slab the second chimney comes out on
  c.mark('a', 4, 2).mark('e', 5, 44).mark('x', 11, 22).mark('p', 3, 12).mark('q', 26, 34);
  return mapRoom(
    { id: 'ih_ascent', regionId: REGION, name: 'Ascent', nameKey: 'room.ih_ascent.name', art: { backdrop: 'ruins', seed: 61 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('bottom', 'a', 1), m.entry('top', 'e', 1)],
      spawns: [m.spawn('shade_1', 'veil_shade', 'x', { facing: 1 }), m.spawn('wisp_1', 'lantern_wisp', 'p'), m.spawn('wisp_2', 'lantern_wisp', 'q')],
      exits: [m.exitSide('bottom', 'west', 'a', { room: 'ih_shrine', entry: 'east' }), m.exitSide('top', 'west', 'e', { room: 'ih_approach', entry: 'west' })],
      needs: [{ target: 'exit:top', abilities: ['wall_jump'] }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Antechamber
/**
 * «Antesala»: 60 × 24 m. The last stretch before the Sovereign: two Veil Shades, an Ink Weaver and a Bell Toller, and at the east end the shrine — the last place to rest. On a gallery in the west, a lever: it opens the stone door in the Threshold, and from here a way leads
 * straight back to it.
 */
export function antechamber(): RoomDefinition {
  const c = new RoomCanvas('ih_approach', 60, 24).walls().ground(1, 59, 2);
  c.plat(1, 12, 7).plat(13, 16, 4);
  c.rock(24, 2, 26, 4).rock(38, 2, 40, 3);
  c.mark('a', 5, 2).mark('b', 54, 2).mark('s', 6, 7).mark('l', 9, 7).mark('x', 20, 2).mark('y', 26, 2).mark('w', 30, 2).mark('t', 33, 2).mark('q', 49, 2).mark('r', 51, 2);
  return mapRoom(
    { id: 'ih_approach', regionId: REGION, name: 'Antechamber', nameKey: 'room.ih_approach.name', art: { backdrop: 'ruins', seed: 62 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1), m.entry('rest', 'q', 1), m.entry('shortcut', 's', 1)],
      spawns: [m.spawn('shade_1', 'veil_shade', 'x', { facing: 1 }), m.spawn('shade_2', 'veil_shade', 'y', { facing: 1 }), m.spawn('weaver_1', 'ink_weaver', 'w', { facing: 1 }), m.spawn('toller_1', 'bell_toller', 't')],
      exits: [
        m.exitSide('west', 'west', 'a', { room: 'ih_ascent', entry: 'top' }),
        m.exitSide('east', 'east', 'b', { room: 'ih_arena', entry: 'west' }),
        m.exitSide('shortcut', 'west', 's', { room: 'ih_threshold', entry: 'shortcut' }, { requires: 'lever:ih_lift' }),
      ],
      interactables: [m.shrine('r'), lever(m, 'lift_lever', 'l', 'lever:ih_lift')],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Heart
/**
 * «Corazón»: 72 × 30 m. The arena of the INKHEART SOVEREIGN: 53 m of black floor between two doors that shut when the fight begins and open when it ends. It cuts across the room, rains ink, throws orbs, sends a nova out from itself and walks a column of ink across the
 * floor; it calls a Veil Shade at two thirds of its life and an Ink Weaver at one third. When it falls the way on — to the last room — works.
 */
export function heart(): RoomDefinition {
  const c = new RoomCanvas('ih_arena', 72, 30).walls().ground(1, 71, 2);
  c.region('A', 8, 2, 9, 29).region('B', 65, 2, 66, 29); // doors to the roof
  c.mark('a', 4, 2).mark('b', 67, 2).mark('l', 11, 2).mark('r', 64, 2).mark('k', 56, 2);
  return mapRoom(
    { id: 'ih_arena', regionId: REGION, name: 'The Heart', nameKey: 'room.ih_arena.name', art: { backdrop: 'ruins', seed: 63 }, rows: c.rows(), regions: { A: { id: 'door_w', material: 'gate' }, B: { id: 'door_e', material: 'gate' } } },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('east', 'b', -1)],
      gates: [
        { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:ih_boss' },
        { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:ih_boss' },
      ],
      bosses: [m.boss('sovereign', 'boss_sovereign', 'k', { from: 'l', to: 'r', top: 16 }, { defeatFlag: 'defeated:ih_boss', fightFlag: '~fight:ih_boss' })],
      camera: { bounds: m.grid, zones: [{ id: 'arena', rect: rect(11.5, 1, 64.5, 18), bounds: rect(7, 0, 67, 28), viewHeight: 16, smoothTime: 0.8, whenClear: 'defeated:ih_boss' }] },
      exits: [m.exitSide('west', 'west', 'a', { room: 'ih_approach', entry: 'east' }), m.exitSide('east', 'east', 'b', { room: 'ih_end', entry: 'west' }, { requires: 'defeated:ih_boss' })],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------- the Rest
/**
 * «Reposo»: 40 × 16 m. A last quiet room after the Sovereign: a floor, a shrine, and at the east wall the way out of the world — the end of the adventure.
 */
export function rest(): RoomDefinition {
  const c = new RoomCanvas('ih_end', 40, 16).walls().ground(1, 39, 2);
  c.rock(14, 2, 18, 3);
  c.mark('a', 5, 2).mark('b', 34, 2).mark('q', 20, 2).mark('r', 22, 2);
  return mapRoom(
    { id: 'ih_end', regionId: REGION, name: 'Rest', nameKey: 'room.ih_end.name', art: { backdrop: 'ruins', seed: 64 }, rows: c.rows() },
    (m) => ({
      entries: [m.entry('west', 'a', 1), m.entry('rest', 'q', 1)],
      exits: [m.exitSide('west', 'west', 'a', { room: 'ih_arena', entry: 'east' }), m.endSide('end', 'east', 'b', { requires: 'defeated:ih_boss' })],
      interactables: [m.shrine('r')],
    }),
  );
}

export const HEART_ROOMS: readonly RoomDefinition[] = [threshold(), veins(), pulse(), ascent(), antechamber(), heart(), rest()];
