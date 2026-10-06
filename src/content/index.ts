import type { RoomDefinition } from '@/world/RoomDefinition';
import { ABILITIES } from './abilities';
import { ENEMIES } from './enemies';
import { PLAYER } from './player';
import { PROCEDURAL_LOOKS } from './proceduralActors';
import { CROUCH_TEST_ROOM } from './rooms/crouchTest';
import { INTERACTION_TEST_ROOM } from './rooms/interactionTest';
import { MOVEMENT_TEST_ROOM } from './rooms/movementTest';
import { R1_GATE_ROOM } from './rooms/r1Gate';
import { R2_HALL_ROOM } from './rooms/r2Hall';
import { R3_CHAMBER_ROOM } from './rooms/r3Chamber';
import { R4_SANCTUM_ROOM } from './rooms/r4Sanctum';
import { PROCEDURAL_ATLASES, SPRITE_SETS } from './sprites';
import { WORLD } from './world';

/** The game's concrete data. Only `app/` (and tests / tools) import this; the simulation receives it injected. */
export const ROOMS: Readonly<Record<string, RoomDefinition>> = {
  [R1_GATE_ROOM.id]: R1_GATE_ROOM,
  [R2_HALL_ROOM.id]: R2_HALL_ROOM,
  [R3_CHAMBER_ROOM.id]: R3_CHAMBER_ROOM,
  [R4_SANCTUM_ROOM.id]: R4_SANCTUM_ROOM,
  [MOVEMENT_TEST_ROOM.id]: MOVEMENT_TEST_ROOM,
  [CROUCH_TEST_ROOM.id]: CROUCH_TEST_ROOM,
  [INTERACTION_TEST_ROOM.id]: INTERACTION_TEST_ROOM,
};

/**
 * Where a new game begins (docs/GAME-SPEC-2D.md §14.4): the first room of the world (it says so itself, `WORLD.start`), with the
 * abilities the hero starts with. R1 teaches the dash, so it is owned from the first step. The playgrounds (`?room=movement_test`)
 * and `?unlock=` do not use this: they start with exactly what the URL says.
 */
export const START = { room: WORLD.start.room, entry: WORLD.start.entry, unlocked: ['dash'] as readonly string[] } as const;

export { ABILITIES, ENEMIES, PLAYER, PROCEDURAL_ATLASES, PROCEDURAL_LOOKS, SPRITE_SETS, WORLD };
