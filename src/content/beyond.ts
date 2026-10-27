import '@/enemies/archetypes/all';
import '@/enemies/boss/engine';
import { BOSSES, ENEMIES, ROOMS } from './core';
import { ENGINE_BOSSES } from './bosses';
import { CREATURES } from './creatures';
import { FOUNDRY_ROOMS } from './rooms/foundry';
import { HEART_ROOMS } from './rooms/heart';
import { MINES_ROOMS } from './rooms/mines';
import { MIRE_ROOMS } from './rooms/mire';
import { ROOTS_ROOMS } from './rooms/roots';
import { RUINS_ROOMS } from './rooms/ruins';
import { SPIRE_ROOMS } from './rooms/spire';

/**
 * THE REST OF THE WORLD (docs/PROMPT21-LOG.md): the sixty rooms past the Sanctum — a file of rooms for each zone, in the order the hero meets them —, the thirteen creatures after the Ink Slime with the brains that run them
 * (`enemies/archetypes/all.ts`), and the six guardians after the Warden with their engine (`enemies/boss/engine.ts`). Importing this module adds all of it to the registries of `content/core.ts` and teaches the simulation the code that runs it.
 *
 * It is the chunk the game fetches once its first frame is up; the tests and the tools import it with the rest (`content/index.ts`, `content/enemies.ts`).
 */
Object.assign(ROOMS, Object.fromEntries([...RUINS_ROOMS, ...ROOTS_ROOMS, ...MIRE_ROOMS, ...MINES_ROOMS, ...SPIRE_ROOMS, ...FOUNDRY_ROOMS, ...HEART_ROOMS].map((r) => [r.id, r])));
Object.assign(ENEMIES, Object.fromEntries(CREATURES.map((c) => [c.id, c])));
Object.assign(BOSSES, ENGINE_BOSSES);
