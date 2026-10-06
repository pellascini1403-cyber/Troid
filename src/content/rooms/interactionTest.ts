import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * Interaction playground (`?room=interaction_test`): one of each simple case of docs/GAME-SPEC-2D.md §12 on a flat floor — a
 * PICKUP (the Spirit Bolt card), a second pickup close to the first to see the nearest one win, a LEVER that opens a door of the
 * room, and a DOOR that opens when you interact with it. A sandbox like `movement_test`, not part of the game: R1 keeps its own
 * door (it opens with the slime's defeat).
 *
 *   x:   0 ── 12 ─ 14 ─────── 30 ─────── 40▓▓41.5 ──── 45 ─ 46▓▓47.5 ──── 58
 *        start  card  bottle   lever     door (lever)    "open"  door (itself)  way out
 */
export const INTERACTION_TEST_ROOM: RoomDefinition = {
  id: 'interaction_test',
  regionId: 'test',
  name: 'Interaction Playground',
  bounds: rect(-1, -12, 60, 18),
  killY: -20,
  entries: [{ id: 'start', x: 4, y: 0, facing: 1 }],
  solids: [
    block('wall_left', -2, -12, 0, 18, 'stone'),
    block('wall_right', 59, -12, 61, 18, 'stone'),
    ground('g', 0, 59),
    block('door', 40, 0, 41.5, 8, 'gate'),
    block('door_b', 46, 0, 47.5, 8, 'gate'),
  ],
  gates: [
    { id: 'door', solid: 'door', openWhen: 'lever:interaction_test' },
    { id: 'door_b', solid: 'door_b', openWhen: 'opened:door_b' },
  ],
  exits: [{ id: 'east', rect: rect(50, 0, 56, 4) }],
  interactables: [
    {
      id: 'card_spirit_bolt',
      kind: 'pickup',
      verbKey: 'interact.pickUp',
      x: 12,
      y: 0,
      whenClear: 'taken:card_spirit_bolt',
      actions: [
        { type: 'acquireCard', cardId: 'card_spirit_bolt' },
        { type: 'setFlag', flag: 'taken:card_spirit_bolt' },
      ],
    },
    // a fourth bottle slot, 2 m to the right of the card: standing between them the NEAREST one has the icon
    {
      id: 'bottle_slot',
      kind: 'pickup',
      verbKey: 'interact.pickUp',
      x: 14,
      y: 0,
      whenClear: 'taken:bottle_slot',
      actions: [
        { type: 'addBottleSlot', bottleId: 'energy_bottle' },
        { type: 'setFlag', flag: 'taken:bottle_slot' },
      ],
    },
    // a door you open by interacting with IT (kind `open`): the icon floats above the leaf, 2 m up
    {
      id: 'door_b',
      kind: 'open',
      verbKey: 'interact.open',
      x: 45,
      y: 0,
      iconHeight: 2,
      whenClear: 'opened:door_b',
      actions: [{ type: 'setFlag', flag: 'opened:door_b' }],
    },
    {
      id: 'lever',
      kind: 'activate',
      verbKey: 'interact.activate',
      x: 30,
      y: 0,
      whenClear: 'lever:interaction_test',
      actions: [{ type: 'setFlag', flag: 'lever:interaction_test' }],
    },
  ],
};
