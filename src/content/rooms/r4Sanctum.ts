import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * R4 «Santuario» (docs/PROMPT6-LOG.md S22): the last room of the slice and the home of its boss. Three stretches in a line — a
 * vestibule, a wide arena, a chamber for the reward — and the way out of the world at the end. A BLOCKOUT: flat shapes and numbers.
 *
 *   x:   0 ───────── 24 │ 26 ─────────────────── 66 │ 68 ───────────── 99
 *        A  VESTIBULE        B  THE ARENA                C  THE REWARD
 *        flat, a place to    40 m of flat floor,         a pedestal, and the way
 *        rest before the     doors at both ends          out of the world
 *        fight ← R3
 *
 * docs/PROMPT6-LOG.md S29 adds what makes it a boss room: the doors that close when the fight starts and open when it ends, the
 * boss, the checkpoint in the vestibule, the camera lock on the arena and the reward. The geometry is flat on purpose: the arena is
 * 40 m wide (about three screens at the game's zoom), so the boss has room to charge and the player room to dodge.
 */
export const R4_SANCTUM_ROOM: RoomDefinition = {
  id: 'r4_sanctum',
  regionId: 'ancient_forest_sanctum',
  name: 'R4 Sanctum',
  nameKey: 'room.r4.name',
  bounds: rect(-1, -12, 100, 18),
  killY: -20,
  camera: {
    bounds: rect(-1, -6, 100, 11),
    // the arena (S26): while the hero is in it the view is held to the arena — the doors included, so they are seen — and pulled back a
    // little (15 m instead of 13.5) to see what comes at them; it eases in and out, and lets go the moment the hero is out of it
    zones: [{ id: 'arena', rect: rect(26.5, -1, 65.5, 12), bounds: rect(25, -6, 67, 10), viewHeight: 15, smoothTime: 0.8 }],
  },
  entries: [
    // from R3
    { id: 'west', x: 4, y: 0, facing: 1 },
    // where the shrine brings the hero back: the last place to rest before the arena
    { id: 'rest', x: 14.8, y: 0, facing: 1 },
  ],
  solids: [
    // boundary walls
    block('wall_left', -2, -12, 0, 18, 'stone'),
    block('wall_right', 99, -12, 101, 18, 'stone'),

    ground('g', 0, 99),
  ],
  exits: [
    { id: 'west', rect: rect(0, 0, 2.4, 4), to: { room: 'r3_chamber', entry: 'east' } },
    // the end of the slice: it leads out of the world as it stands
    { id: 'east', rect: rect(95, 0, 98, 4), end: true },
  ],
  // the checkpoint before the arena: a defeat in the fight brings the hero back here, with the boss as it was
  interactables: [{ id: 'shrine', kind: 'rest', verbKey: 'interact.rest', x: 14, y: 0, actions: [{ type: 'checkpoint', entry: 'rest' }] }],
  art: { backdrop: 'ruins', seed: 4 },
};
