import '@/enemies/archetypes/all';
import '@/enemies/boss/engine';
import { BOSSES, ENEMIES, ROOMS } from './core';
import { ENGINE_BOSSES } from './bosses';
import { EMBER_BOSSES } from './bossesEmber';
import { CREATURES } from './creatures';
import { EMBER_CREATURES } from './creaturesEmber';
import { PROCEDURAL_LOOKS } from './proceduralActors';
import { EMBER_LOOKS } from './proceduralEmber';
import { CRATER_ROOMS } from './rooms/crater';
import { DUSK_ROOMS } from './rooms/dusk';
import { FOUNDRY_ROOMS } from './rooms/foundry';
import { GROVE_ROOMS } from './rooms/grove';
import { HEART_ROOMS } from './rooms/heart';
import { MINES_ROOMS } from './rooms/mines';
import { MIRE_ROOMS } from './rooms/mire';
import { ROOTS_ROOMS } from './rooms/roots';
import { RUINS_ROOMS } from './rooms/ruins';
import { SPIRE_ROOMS } from './rooms/spire';
import { THRONE_ROOMS } from './rooms/throne';
import { WORLD_ROOMS } from './world';
import { BEYOND_ROOMS } from './worldRooms';

/**
 * THE REST OF THE WORLD (docs/PROMPT21-LOG.md): the sixty rooms past the Sanctum — a file of rooms for each zone, in the order the hero meets them —, the thirteen creatures after the Ink Slime with the brains that run them
 * (`enemies/archetypes/all.ts`), and the six guardians after the Warden with their engine (`enemies/boss/engine.ts`). Importing this module adds all of it to the registries of `content/core.ts` and teaches the simulation the code that runs it.
 * The second half of the adventure (docs/PROMPT23-LOG.md §7) is in it too: forty-one rooms in four zones that begin where the Heart of the Ink ends, the ten creatures that burn and the four guardians of those zones, and the looks they are drawn with.
 *
 * It is the chunk the game fetches once its first frame is up; the tests and the tools import it with the rest (`content/index.ts`, `content/enemies.ts`).
 */
Object.assign(
  ROOMS,
  Object.fromEntries(
    [...RUINS_ROOMS, ...ROOTS_ROOMS, ...MIRE_ROOMS, ...MINES_ROOMS, ...SPIRE_ROOMS, ...FOUNDRY_ROOMS, ...HEART_ROOMS, ...DUSK_ROOMS, ...GROVE_ROOMS, ...CRATER_ROOMS, ...THRONE_ROOMS].map((r) => [r.id, r]),
  ),
);
Object.assign(ENEMIES, Object.fromEntries(CREATURES.map((c) => [c.id, c])));
Object.assign(BOSSES, ENGINE_BOSSES);
// the creatures that burn, their four guardians and their looks
Object.assign(ENEMIES, Object.fromEntries(EMBER_CREATURES.map((c) => [c.id, c])));
Object.assign(BOSSES, EMBER_BOSSES);
Object.assign(PROCEDURAL_LOOKS, EMBER_LOOKS);
WORLD_ROOMS.push(...BEYOND_ROOMS);
