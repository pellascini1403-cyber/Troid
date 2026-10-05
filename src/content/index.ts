import type { RoomDefinition } from '@/world/RoomDefinition';
import { ABILITIES } from './abilities';
import { MODELS } from './models';
import { PLAYER } from './player';
import { MOVEMENT_TEST_ROOM } from './rooms/movementTest';
import { PROCEDURAL_ATLASES, SPRITE_SETS } from './sprites';

/** The game's concrete data. Only `app/` (and tests / tools) import this; the simulation receives it injected. */
export const ROOMS: Readonly<Record<string, RoomDefinition>> = {
  [MOVEMENT_TEST_ROOM.id]: MOVEMENT_TEST_ROOM,
};

export { ABILITIES, MODELS, PLAYER, PROCEDURAL_ATLASES, SPRITE_SETS };
