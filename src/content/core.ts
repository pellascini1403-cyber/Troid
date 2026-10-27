import type { EnemyDefinition } from '@/enemies/EnemyDefinition';
import type { GuardianDefinition } from '@/enemies/GuardianDefinition';
import type { BossDefinition } from '@/enemies/boss/BossDefinition';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { ABILITIES } from './abilities';
import { INK_SLIME } from './inkSlime';
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
import { UPGRADES } from './upgrades';
import { INK_WARDEN } from './warden';
import { WORLD } from './world';

/**
 * WHAT THE FIRST FRAME OF THE GAME NEEDS OF THE WORLD (docs/PROMPT21-LOG.md): the four rooms of the first chapter, the playgrounds, the Ink Slime and the Ink Warden, the hero, the abilities, the upgrades and the list of the sixty-four rooms. The
 * rest — sixty rooms, thirteen creatures with their brains, six guardians with their engine — is `content/beyond.ts`, a chunk the game asks for once its first frame is up (the budget of the cold start, `npm run bench:bundle`, is about what a
 * hero standing in R1 has to download) and which adds itself to the registries below, which are the same objects for everybody: whoever imports it, the world is whole.
 *
 * The registries are plain mutable objects on purpose, written to once by `beyond.ts` when it arrives.
 */
export const ROOMS: Record<string, RoomDefinition> = {
  [R1_GATE_ROOM.id]: R1_GATE_ROOM,
  [R2_HALL_ROOM.id]: R2_HALL_ROOM,
  [R3_CHAMBER_ROOM.id]: R3_CHAMBER_ROOM,
  [R4_SANCTUM_ROOM.id]: R4_SANCTUM_ROOM,
  [MOVEMENT_TEST_ROOM.id]: MOVEMENT_TEST_ROOM,
  [CROUCH_TEST_ROOM.id]: CROUCH_TEST_ROOM,
  [INTERACTION_TEST_ROOM.id]: INTERACTION_TEST_ROOM,
};

/** The enemies a room's `spawns` may name, by id: the Ink Slime of the first rooms (the creatures of the rest are added by `beyond.ts`). */
export const ENEMIES: Record<string, EnemyDefinition> = { [INK_SLIME.id]: INK_SLIME };

/** The guardians a room's `bosses` may name, by id: the Ink Warden (the six after it are added by `beyond.ts`). */
export const BOSSES: Record<string, GuardianDefinition | BossDefinition> = { [INK_WARDEN.id]: INK_WARDEN };

/**
 * Where a new game begins (docs/GAME-SPEC-2D.md §14.4): the first room of the world (it says so itself, `WORLD.start`), with the
 * abilities the hero starts with. R1 teaches the dash, so it is owned from the first step. The playgrounds (`?room=movement_test`)
 * and `?unlock=` do not use this: they start with exactly what the URL says.
 */
export const START = { room: WORLD.start.room, entry: WORLD.start.entry, unlocked: ['dash'] as readonly string[] } as const;

/** Is this room one of the first four (or a playground): there from the first frame, with nothing to wait for? */
export const inCore = (roomId: string): boolean => roomId in CORE_ROOM_IDS;
const CORE_ROOM_IDS: Readonly<Record<string, true>> = Object.fromEntries(Object.keys(ROOMS).map((id) => [id, true]));

export { ABILITIES, PLAYER, PROCEDURAL_ATLASES, PROCEDURAL_LOOKS, SPRITE_SETS, UPGRADES, WORLD };
