import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * R3 «Cámara del Sello» (docs/PROMPT6-LOG.md S22): the room where the hero is given something new. A hall with a ledge up above
 * (reached by a short climb) and a long flat lane to the east, which is where a way shut to the sanctum will be. A BLOCKOUT: flat
 * shapes and numbers.
 *
 *   x:   0 ───────── 22 ━━ 27 ░ 29 ━━━━━━━━━━ 40 ─────────────────────────── 79
 *        A  ENTER       B  THE CLIMB                   C  THE LANE
 *        flat           a step up (2.4 m), then the     flat, 40 m of clear floor:
 *        ← R2           ledge (4.8 m): the pedestal     the way on → R4
 *                       stands on it
 *
 * The climb is two one-way platforms with a 2 m jump between them and 2.4 m of rise each (a full jump is 3.1 m): a short piece of
 * platforming, the price of the reward. docs/PROMPT6-LOG.md S28 puts the Spirit Bolt card on the ledge and the seal in the lane.
 */
export const R3_CHAMBER_ROOM: RoomDefinition = {
  id: 'r3_chamber',
  regionId: 'ancient_forest_ruins',
  name: 'R3 Seal Chamber',
  nameKey: 'room.r3.name',
  bounds: rect(-1, -12, 80, 18),
  killY: -20,
  // taller than the others: the ledge is 4.8 m up and a jump onto it goes higher still
  camera: { bounds: rect(-1, -6, 80, 12) },
  entries: [
    // from R2
    { id: 'west', x: 4, y: 0, facing: 1 },
    // from R4: in the lane, facing the room
    { id: 'east', x: 72.5, y: 0, facing: -1 },
  ],
  solids: [
    // boundary walls
    block('wall_left', -2, -12, 0, 18, 'stone'),
    block('wall_right', 79, -12, 81, 18, 'stone'),

    ground('g', 0, 79),

    // B — the climb to the ledge
    oneWay('climb_1', 22, 27, 2.4),
    oneWay('ledge', 29, 40, 4.8),
  ],
  exits: [
    { id: 'west', rect: rect(0, 0, 2.4, 4), to: { room: 'r2_hall', entry: 'east' } },
    { id: 'east', rect: rect(76, 0, 79, 4), to: { room: 'r4_sanctum', entry: 'west' } },
  ],
  art: { backdrop: 'ruins', seed: 3 },
};
