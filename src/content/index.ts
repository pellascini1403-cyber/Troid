import type { RoomDefinition } from '@/world/RoomDefinition';
import { ABILITIES } from './abilities';
import { PLAYER } from './player';
import { CROUCH_TEST_ROOM } from './rooms/crouchTest';
import { MOVEMENT_TEST_ROOM } from './rooms/movementTest';
import { PROCEDURAL_ATLASES, SPRITE_SETS } from './sprites';

/** The game's concrete data. Only `app/` (and tests / tools) import this; the simulation receives it injected. */
export const ROOMS: Readonly<Record<string, RoomDefinition>> = {
  [MOVEMENT_TEST_ROOM.id]: MOVEMENT_TEST_ROOM,
  [CROUCH_TEST_ROOM.id]: CROUCH_TEST_ROOM,
};

export { ABILITIES, PLAYER, PROCEDURAL_ATLASES, SPRITE_SETS };
