import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * R2 «Galería de Raíces» (docs/PROMPT6-LOG.md S22): the first room AFTER the slice's first guardian, the one that connects R1 and
 * R3. It is for walking and choosing, not for a lesson: a short flat way in, a FORK over a ditch, and a flat way out where an Ink
 * Slime waits. A BLOCKOUT, like R1: flat shapes and numbers.
 *
 *   x:   0 ─────── 26 ▒▒ 30 ───────────── 56 ▒▒ 60 ──────────────────── 91
 *        A  ENTER      B  THE FORK                 C  THE WAY ON
 *        flat          HIGH ROUTE: five one-way    flat, one Ink Slime,
 *        ← R1          platforms over the ditch    the way out → R3
 *                      (the top one holds a ledge)
 *                      LOW ROUTE: down the steps into the ditch (3.2 m
 *                      deep), along its floor, up the steps on the far side
 *
 * Both routes end at the same ground, so neither is a dead end, and falling from the high one lands on the low one: nothing in
 * the fork can trap the player. Every size comes from the MEASURED reach of the controller: rises are at most 2.4 m (a full jump is
 * 3.1 m), gaps between platforms 3 m (a running jump clears 6.75 m). docs/PROMPT6-LOG.md S25 puts the danger on the low route,
 * S27 the reward on the high one.
 */
export const R2_HALL_ROOM: RoomDefinition = {
  id: 'r2_hall',
  regionId: 'ancient_forest_ruins',
  name: 'R2 Root Gallery',
  nameKey: 'room.r2.name',
  bounds: rect(-1, -12, 92, 18),
  killY: -20,
  entries: [
    // from R1 (and the first place in this room)
    { id: 'west', x: 4, y: 0, facing: 1 },
    // from R3
    { id: 'east', x: 84.5, y: 0, facing: -1 },
    // where the shrine brings the hero back (S24)
    { id: 'rest', x: 12.8, y: 0, facing: 1 },
  ],
  solids: [
    // boundary walls
    block('wall_left', -2, -12, 0, 18, 'stone'),
    block('wall_right', 91, -12, 93, 18, 'stone'),

    // A — the way in
    ground('g_a', 0, 26),

    // B — the ditch: two steps down, a floor 3.2 m below the way in, two steps up (no rise above 1.6 m)
    block('ditch_l', 26, -6, 30, -1.6, 'earth'),
    block('g_low', 30, -9.2, 56, -3.2, 'earth'),
    block('ditch_r', 56, -6, 60, -1.6, 'earth'),

    // B — the high route: platforms 2.4 m up with 3 m between them; the last one reaches the ground on the far side
    oneWay('p1', 28, 33, 2.4),
    oneWay('p2', 36, 41, 2.4),
    oneWay('p3', 44, 51, 2.4),
    oneWay('p4', 54, 59, 2.4),
    // a ledge 2.4 m above the right end of the third platform. It stays clear of where a running jump from the second one lands
    // (≈ 46), so the road never puts the player on it by accident: reaching it is a choice
    oneWay('p5', 48, 51, 4.8),

    // C — the way on
    ground('g_b', 60, 91),
  ],
  // an Ink Slime that stays beaten once it has fallen: the way on is never a grind
  spawns: [{ id: 'slime_1', enemy: 'ink_slime', x: 74, y: 0, facing: -1, defeatFlag: 'defeated:r2_slime' }],
  exits: [
    { id: 'west', rect: rect(0, 0, 2.4, 4), to: { room: 'r1_gate', entry: 'east' } },
    { id: 'east', rect: rect(88, 0, 91, 4), to: { room: 'r3_chamber', entry: 'west' } },
  ],
  // the danger of the low road (S25): a strip of spikes on the floor of the ditch, 2.5 m wide and 0.6 m high. A running jump clears it with
  // room to spare (it is above 0.6 m for ≈ 5.4 m of a 6 m flight, the strip and the body need 3.2: the take-off window is ≈ 0.25 s);
  // walking into it costs a point of life, and the knockback throws the hero up and out of it
  hazards: [{ id: 'spikes_ditch', kind: 'spikes', rect: rect(39.5, -3.2, 42, -2.6) }],
  // the first place to rest after R1: a defeat in this room (or the next) brings the hero back here, not to the Ruins Gate
  interactables: [{ id: 'shrine', kind: 'rest', verbKey: 'interact.rest', x: 12, y: 0, actions: [{ type: 'checkpoint', entry: 'rest' }] }],
  art: { backdrop: 'ruins', seed: 2 },
};
