import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * R1 «Puerta de las Ruinas» (docs/GAME-SPEC-2D.md §14.4): the room of the first vertical slice. It teaches the whole kit in
 * the order a player meets it — move, jump, platforms, crouch, fight, leave — and the way out is shut until the Ink Slime that
 * guards it is defeated. A BLOCKOUT: flat shapes and numbers, the art comes later.
 *
 *   x:   0 ─────── 32 ░░░░ 37 ─────────── 62 ━━━━━━━━━━━ 76 ─────────── 104 ▌105.5 ── 113
 *        A  MOVE         B  PLATFORMS        C  CROUCH        D  THE SLIME        E  GATE → EXIT → R2
 *        hurdle, steps   5 m pit,            1.2 m × 12 m     arena, one-way      the door opens with
 *                        one-way stairs      crawl tunnel     platform, slime     defeated:r1_slime
 *
 * Every size comes from the MEASURED reach of the controller (tests/integration/movement.test.ts): a running jump clears
 * ≈ 6.75 m of gap and 3.1 m of height, the crouched body is 1.0 m tall, and the slime's lunge covers ≈ 1.5 m. The room is
 * proven completable by physics in tests/integration/r1.test.ts: a scripted player walks it from the entrance to the exit.
 *
 * Nothing in this room can be picked up: the first thing the hero can INTERACT with is R2's shrine, and the Spirit Bolt card is in R3
 * (docs/PROMPT6-LOG.md S28: it lay at the end of the crawl tunnel here while the slice was one room).
 */
export const R1_GATE_ROOM: RoomDefinition = {
  id: 'r1_gate',
  regionId: 'ancient_forest_ruins',
  name: 'R1 Ruins Gate',
  nameKey: 'room.r1.name',
  bounds: rect(-1, -12, 114, 18),
  killY: -20,
  // what the camera may show: the room's width, from the floor's foot (the ground is 6 m deep) up to well above the highest platform
  camera: { bounds: rect(-1, -6, 114, 11) },
  entries: [
    { id: 'start', x: 4, y: 0, facing: 1 },
    // where R2 brings the player back: past the door (open by then), facing the room
    { id: 'east', x: 106.6, y: 0, facing: -1 },
  ],
  solids: [
    // boundary walls
    block('wall_left', -2, -12, 0, 18, 'stone'),
    block('wall_right', 113, -12, 115, 18, 'stone'),

    // A — move: flat ground, a hurdle to jump and two steps up and down
    ground('g_a', 0, 32),
    block('hurdle', 16, 0, 17.4, 1.1, 'stone'),
    block('step_1', 23, 0, 25.5, 1.2, 'stone'),
    block('step_2', 25.5, 0, 28, 2.3, 'stone'),

    // B — platforms: a 5 m pit (a running jump clears 6.75 m) and one-way stairs for the high route
    ground('g_b', 37, 113),
    oneWay('stair_1', 40, 46, 3.0),
    oneWay('stair_2', 48, 54, 5.2),

    // C — crouch: 1.2 m of clearance for 12 m. The roof runs up to the ceiling, so there is no way over it
    block('tunnel_roof', 64, 1.2, 76, 18, 'stone'),

    // D — the slime's arena: a one-way platform to jump onto, to dodge from, to strike down from
    oneWay('arena_plat', 86, 92, 3.0),

    // E — the gate: stone door, 1.5 m thick and taller than any jump. It is switched off while `defeated:r1_slime` is set
    block('gate_door', 104, 0, 105.5, 9, 'gate'),
  ],
  spawns: [{ id: 'slime_1', enemy: 'ink_slime', x: 96, y: 0, facing: -1, defeatFlag: 'defeated:r1_slime' }],
  gates: [{ id: 'exit_door', solid: 'gate_door', openWhen: 'defeated:r1_slime' }],
  // the way on: R2 (west entry). It is beyond the door, so it can only be reached once the slime is beaten; `requires` says the same to the world validator
  exits: [{ id: 'east', rect: rect(109, 0, 112.5, 4), to: { room: 'r2_hall', entry: 'west' }, requires: 'defeated:r1_slime' }],
  art: { backdrop: 'ruins', seed: 1 },
};
