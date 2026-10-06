import type { RoomDefinition } from '@/world/RoomDefinition';
import { ABILITIES } from './abilities';
import { ENEMIES } from './enemies';
import { PLAYER } from './player';
import { PROCEDURAL_LOOKS } from './proceduralActors';
import { CROUCH_TEST_ROOM } from './rooms/crouchTest';
import { INTERACTION_TEST_ROOM } from './rooms/interactionTest';
import { MOVEMENT_TEST_ROOM } from './rooms/movementTest';
import { R1_GATE_ROOM } from './rooms/r1Gate';
import { PROCEDURAL_ATLASES, SPRITE_SETS } from './sprites';

/** The game's concrete data. Only `app/` (and tests / tools) import this; the simulation receives it injected. */
export const ROOMS: Readonly<Record<string, RoomDefinition>> = {
  [R1_GATE_ROOM.id]: R1_GATE_ROOM,
  [MOVEMENT_TEST_ROOM.id]: MOVEMENT_TEST_ROOM,
  [CROUCH_TEST_ROOM.id]: CROUCH_TEST_ROOM,
  [INTERACTION_TEST_ROOM.id]: INTERACTION_TEST_ROOM,
};

/**
 * Where a new game begins (docs/GAME-SPEC-2D.md §14.4): the first room of the vertical slice, with the abilities the hero
 * starts with. R1 teaches the dash, so it is owned from the first step. The playgrounds (`?room=movement_test`) and
 * `?unlock=` do not use this: they start with exactly what the URL says.
 */
export const START = { room: R1_GATE_ROOM.id, unlocked: ['dash'] as readonly string[] } as const;

export { ABILITIES, ENEMIES, PLAYER, PROCEDURAL_ATLASES, PROCEDURAL_LOOKS, SPRITE_SETS };
