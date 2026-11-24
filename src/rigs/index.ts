import { BRAMBLE_CRAWLER_RIG } from './species/brambleCrawler';
import { CAVE_BAT_RIG } from './species/caveBat';
import { BELL_TOLLER_RIG } from './species/bellToller';
import { GLOW_SPORE_RIG } from './species/glowSpore';
import { INK_SPITTER_RIG } from './species/inkSpitter';
import { INK_WEAVER_RIG } from './species/inkWeaver';
import { LANTERN_WISP_RIG } from './species/lanternWisp';
import { MIRE_TOAD_RIG } from './species/mireToad';
import { CRYSTAL_SHARD_RIG } from './species/crystalShard';
import { FLOOR_LEECH_RIG } from './species/floorLeech';
import { PISTON_DRONE_RIG } from './species/pistonDrone';
import { SHARDLING_RIG } from './species/shardling';
import { STONEBACK_RIG } from './species/stoneback';
import { VEIL_SHADE_RIG } from './species/veilShade';
import type { RigDef } from './types';

export { RigActor, type RigSource } from './RigActor';
export { createRigAssets, type RigAssets } from './kit/assets';
export { seedOf } from './kit/motion';
export type { RigBody, RigDef, RigFrame } from './types';

/**
 * Every species that has its own anatomy (docs/PROMPT24-LOG.md), by the id of the look it replaces. A creature or guardian whose look is not here is still drawn by its procedural shapes, exactly as before — so this table
 * can grow one species at a time and the game never has a hole in it.
 */
export const RIGS: Readonly<Record<string, RigDef>> = Object.fromEntries([CAVE_BAT_RIG, BRAMBLE_CRAWLER_RIG, MIRE_TOAD_RIG, STONEBACK_RIG, GLOW_SPORE_RIG, INK_SPITTER_RIG, LANTERN_WISP_RIG, BELL_TOLLER_RIG, SHARDLING_RIG, CRYSTAL_SHARD_RIG, PISTON_DRONE_RIG, FLOOR_LEECH_RIG, INK_WEAVER_RIG, VEIL_SHADE_RIG].map((r) => [r.id, r]));
