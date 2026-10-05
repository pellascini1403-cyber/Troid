import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * Crouch playground (`?room=crouch_test`): low passages with the clearances of docs/GAME-SPEC-2D.md §6 (1.0–1.4 m).
 * A sandbox like `movement_test`, not part of the game: the first real "crouch-only" passage lives in room R1.
 *
 *   x:   0 ── 14 ▓▓▓▓▓▓▓▓▓▓▓▓ 26 ── 36 ▓▓▓▓▓▓ 44 ── 52 ═══════ 62 ── 80
 *        ground   passage A       ground  passage B   ground  one-way
 *                 1.2 m × 12 m            1.4 m × 8 m
 */
export const CROUCH_TEST_ROOM: RoomDefinition = {
  id: 'crouch_test',
  regionId: 'test',
  name: 'Crouch Playground',
  bounds: rect(-1, -14, 81, 30),
  killY: -22,
  entries: [{ id: 'start', x: 4, y: 0, facing: 1 }],
  solids: [
    block('wall_left', -2, -14, 0, 30, 'stone'),
    block('wall_right', 80, -14, 82, 30, 'stone'),
    ground('g', 0, 80),
    block('roof_a', 14, 1.2, 26, 6, 'stone'),
    block('roof_b', 36, 1.4, 44, 6, 'stone'),
    oneWay('one_way', 52, 62, 2.5),
  ],
};
