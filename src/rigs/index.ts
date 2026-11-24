import { CAVE_BAT_RIG } from './species/caveBat';
import type { RigDef } from './types';

export { RigActor, type RigSource } from './RigActor';
export { createRigAssets, type RigAssets } from './kit/assets';
export { seedOf } from './kit/motion';
export type { RigBody, RigDef, RigFrame } from './types';

/**
 * Every species that has its own anatomy (docs/PROMPT24-LOG.md), by the id of the look it replaces. A creature or guardian whose look is not here is still drawn by its procedural shapes, exactly as before — so this table
 * can grow one species at a time and the game never has a hole in it.
 */
export const RIGS: Readonly<Record<string, RigDef>> = Object.fromEntries([CAVE_BAT_RIG].map((r) => [r.id, r]));
