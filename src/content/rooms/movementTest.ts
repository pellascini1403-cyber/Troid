import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * Movement playground (`?room=test`). Not part of the game: it exists to feel and test the controller.
 *
 *   x:   0 ───── 40 ░░ 45.5 ───── 80 ░░░░ 88.5 ─────────── 140
 *        ground    gap A (5.5 m)   ground   gap B (8.5 m)    ground
 *                  jumpable        steps/   needs DASH       tunnel, wall,
 *                                  platforms                  one-ways
 *
 * The numbers for the two gaps come from MEASURED reach (tests/integration/movement.test.ts): a running jump clears
 * at most ≈ 6.75 m (including coyote time); jump + air dash clears up to ≈ 11 m. Gap A (5.5 m) is comfortably inside the
 * first, gap B (8.5 m) is impossible without dash yet forgiving with it.
 */
export const MOVEMENT_TEST_ROOM: RoomDefinition = {
  id: 'movement_test',
  regionId: 'test',
  name: 'Movement Playground',
  bounds: rect(-1, -14, 141, 30),
  killY: -22,
  entries: [{ id: 'start', x: 4, y: 0, facing: 1 }],
  solids: [
    // boundary walls
    block('wall_left', -2, -14, 0, 30, 'stone'),
    block('wall_right', 140, -14, 142, 30, 'stone'),

    ground('g1', 0, 40),
    ground('g2', 45.5, 80),
    ground('g3', 88.5, 140),

    // steps and a tall wall near the start
    block('step_1', 14, 0, 16.5, 1.2, 'stone'),
    block('step_2', 16.5, 0, 19, 2.4, 'stone'),
    block('tall_wall', 30, 0, 31.5, 7, 'stone'),

    // platforms between the gaps
    block('plat_a', 52, 2.2, 58, 2.9, 'moss'),
    oneWay('one_way_a', 60, 68, 2.7),
    oneWay('one_way_b', 70, 76, 5.2),

    // low-ceiling tunnel after the dash gap
    block('tunnel_roof', 100, 2.1, 112, 6, 'stone'),
    block('pillar', 121, 0, 123, 4.5, 'stone'),
    // paper-thin wall: used to prove that a dash can never tunnel through geometry
    block('thin_wall', 130, 0, 130.5, 5, 'stone'),
  ],
};
