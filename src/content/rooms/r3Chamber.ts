import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * R3 «Cámara del Sello» (docs/PROMPT6-LOG.md S22, S28): the room where the hero is given something new, and where it is put to use. A hall
 * with a ledge up above (reached by a short climb), where the SPIRIT BOLT card lies, and a long flat lane to the east, where a ward of
 * violet ink holds the way to the sanctum shut: only the Spirit Bolt breaks it. A BLOCKOUT: flat shapes and numbers.
 *
 *   x:   0 ───────── 22 ━━ 27 ░ 29 ━━━━━━━━━━ 40 ───────── 61.6 ▒▒ 63 ▓ 64.2 ──────── 79
 *        A  ENTER       B  THE CLIMB                   C  THE LANE            D  THE SEAL
 *        flat           a step up (2.4 m), then the     flat, 40 m of floor:   the ward (its area
 *        ← R2           ledge (4.8 m): the Spirit       room to stand back     reaches 1.4 m each side
 *                       Bolt card lies on it            and shoot              of the door) → R4
 *
 * The climb is two one-way platforms with a 2 m jump between them and 2.4 m of rise each (a full jump is 3.1 m): a short piece of
 * platforming, the price of the reward. The door is a stone slab 9 m tall — more than a jump from the ledge (4.8 + 3.1 = 7.9 m) reaches — and the
 * ward stands in front of it, so the bolt (12 m of range) meets the ward before the wall: from anywhere in the lane beyond x ≈ 49. The card is
 * in the room BEFORE the seal, so the way on is always open to a hero who goes and gets it; the world validator proves it.
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

    // D — the door the seal holds: stone, 1.2 m thick and taller than any jump from the ledge. Switched off once the seal is broken
    block('seal_wall', 63, 0, 64.2, 9, 'seal'),
  ],
  gates: [{ id: 'seal_gate', solid: 'seal_wall', openWhen: 'broken:r3_seal' }],
  // the ward of violet ink: only the Spirit Bolt breaks it (the sword bounces off); it needs the card, which lies on the ledge of this very room
  seals: [{ id: 'seal', x: 63, y: 0, accepts: ['spirit_bolt'], flag: 'broken:r3_seal', needs: 'taken:card_spirit_bolt' }],
  exits: [
    { id: 'west', rect: rect(0, 0, 2.4, 4), to: { room: 'r2_hall', entry: 'east' } },
    // beyond the door: it is shut until the seal is broken (`requires` says so to the world validator; the door says it to the hero)
    { id: 'east', rect: rect(76, 0, 79, 4), to: { room: 'r4_sanctum', entry: 'west' }, requires: 'broken:r3_seal' },
  ],
  // THE SPIRIT BOLT (S28; it used to lie in R1, provisionally): the card of the ability the hero needs to go on. Taking it equips it, teaches
  // the ability (`magic_attack`) and writes the flag that hides it — once, through a death, a transition and a saved game
  interactables: [
    {
      id: 'card_spirit_bolt',
      kind: 'pickup',
      verbKey: 'interact.pickUp',
      x: 34.5,
      y: 4.8,
      whenClear: 'taken:card_spirit_bolt',
      actions: [
        { type: 'acquireCard', cardId: 'card_spirit_bolt' },
        { type: 'setFlag', flag: 'taken:card_spirit_bolt' },
      ],
    },
  ],
  art: { backdrop: 'ruins', seed: 3 },
};
