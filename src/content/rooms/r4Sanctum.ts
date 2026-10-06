import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * R4 «Santuario» (docs/PROMPT6-LOG.md S22, S26, S29): the last room of the slice and the home of its boss. Three stretches in a line — a
 * vestibule with a shrine, a wide arena, a chamber for the reward — and the way out of the world at the end. A BLOCKOUT: flat shapes and numbers.
 *
 *   x:   0 ───────── 24 │ 25 ▌ 26.5 ──────────── 65.5 ▌ 67 │ 68 ───────────── 99
 *        A  VESTIBULE        B  THE ARENA                      C  THE REWARD
 *        flat, the shrine    39 m of flat floor; doors at      a pedestal that waits for the
 *        (the last place     both ends that close when the     Warden to fall, and the way
 *        to rest) ← R3       fight begins and open when it     out of the world
 *                            ends; the Ink Warden waits here
 *
 * The fight (S29): the hero's feet crossing x = 27.5 wake the Ink Warden, which closes both doors (the volatile flag `~fight:r4_boss`) and
 * fights until it falls or the hero does. A defeat brings the hero back to the shrine of the vestibule with the doors open and the Warden
 * whole; its fall sets `defeated:r4_boss` for good — the doors open, the camera is free again, the reward appears and the way out works.
 * The arena is 39 m wide (about three screens at the game's zoom): room for the charge to run and for the hero to dodge it.
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
    // (S29) it holds until the Warden falls: then the camera is free again
    zones: [{ id: 'arena', rect: rect(26.5, -1, 65.5, 12), bounds: rect(25, -6, 67, 10), viewHeight: 15, smoothTime: 0.8, whenClear: 'defeated:r4_boss' }],
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

    // the doors of the arena: stone, 1.5 m thick and taller than any jump. They are open until the fight begins and open again when it ends
    block('door_w', 25, 0, 26.5, 9, 'gate'),
    block('door_e', 65.5, 0, 67, 9, 'gate'),
  ],
  gates: [
    { id: 'arena_door_w', solid: 'door_w', closeWhen: '~fight:r4_boss' },
    { id: 'arena_door_e', solid: 'door_e', closeWhen: '~fight:r4_boss' },
  ],
  // THE BOSS: dormant in the east half of the arena, facing the way the hero comes from. The fight begins when the hero's feet are inside the arena
  // (a metre beyond the west door, so the door never closes on them); a boss that fell stays fallen (its flag); the fight flag is volatile
  bosses: [{ id: 'warden', guardian: 'ink_warden', x: 58, y: 0, facing: -1, arena: rect(27.5, -1, 64.5, 12), defeatFlag: 'defeated:r4_boss', fightFlag: '~fight:r4_boss' }],
  exits: [
    { id: 'west', rect: rect(0, 0, 2.4, 4), to: { room: 'r3_chamber', entry: 'east' } },
    // the end of the slice: it leads out of the world as it stands, and only once the Warden has fallen
    { id: 'east', rect: rect(95, 0, 98, 4), end: true, requires: 'defeated:r4_boss' },
  ],
  interactables: [
    // the checkpoint before the arena: a defeat in the fight brings the hero back here, with the Warden whole and the doors open
    { id: 'shrine', kind: 'rest', verbKey: 'interact.rest', x: 14, y: 0, actions: [{ type: 'checkpoint', entry: 'rest' }] },
    // THE REWARD: the Air Dash, one more dash in the air. It is not there until the Warden has fallen, and it is taken once (a flag), through a
    // death, a transition and a saved game alike
    {
      id: 'reward_air_dash',
      kind: 'pickup',
      verbKey: 'interact.pickUp',
      x: 84,
      y: 0,
      whenSet: 'defeated:r4_boss',
      whenClear: 'taken:air_dash',
      actions: [
        { type: 'unlockAbility', abilityId: 'air_dash' },
        { type: 'setFlag', flag: 'taken:air_dash' },
      ],
    },
  ],
  art: { backdrop: 'ruins', seed: 4 },
};
