import { BRAMBLE_CRAWLER_RIG } from './species/brambleCrawler';
import { CAVE_BAT_RIG } from './species/caveBat';
import { ASH_BAT_RIG } from './species/ashBat';
import { ASH_TOLLER_RIG } from './species/ashToller';
import { BASALT_GUARD_RIG } from './species/basaltGuard';
import { BELL_TOLLER_RIG } from './species/bellToller';
import { BELL_WARDEN_RIG } from './species/bellWarden';
import { CINDER_CRAWLER_RIG } from './species/cinderCrawler';
import { CRATER_BEHEMOTH_RIG } from './species/craterBehemoth';
import { CRYSTAL_COLOSSUS_RIG } from './species/crystalColossus';
import { CINDER_SOVEREIGN_RIG } from './species/cinderSovereign';
import { CINDER_WEAVER_RIG } from './species/cinderWeaver';
import { DUSK_SHADE_RIG } from './species/duskShade';
import { DUSK_SHEPHERD_RIG } from './species/duskShepherd';
import { EMBER_WISP_RIG } from './species/emberWisp';
import { FOUNDRY_ENGINE_RIG } from './species/foundryEngine';
import { GLOW_SPORE_RIG } from './species/glowSpore';
import { GROVE_GARDENER_RIG } from './species/groveGardener';
import { INK_SPITTER_RIG } from './species/inkSpitter';
import { INKHEART_SOVEREIGN_RIG } from './species/inkheartSovereign';
import { INK_WEAVER_RIG } from './species/inkWeaver';
import { LANTERN_WISP_RIG } from './species/lanternWisp';
import { MAGMA_PISTON_RIG } from './species/magmaPiston';
import { MAGMA_TOAD_RIG } from './species/magmaToad';
import { MIRE_MATRIARCH_RIG } from './species/mireMatriarch';
import { MIRE_TOAD_RIG } from './species/mireToad';
import { CRYSTAL_SHARD_RIG } from './species/crystalShard';
import { FLOOR_LEECH_RIG } from './species/floorLeech';
import { PISTON_DRONE_RIG } from './species/pistonDrone';
import { SHARDLING_RIG } from './species/shardling';
import { SLAG_SPITTER_RIG } from './species/slagSpitter';
import { ROOT_TYRANT_RIG } from './species/rootTyrant';
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
export const RIGS: Readonly<Record<string, RigDef>> = Object.fromEntries([CAVE_BAT_RIG, BRAMBLE_CRAWLER_RIG, MIRE_TOAD_RIG, STONEBACK_RIG, GLOW_SPORE_RIG, INK_SPITTER_RIG, LANTERN_WISP_RIG, BELL_TOLLER_RIG, SHARDLING_RIG, CRYSTAL_SHARD_RIG, PISTON_DRONE_RIG, FLOOR_LEECH_RIG, INK_WEAVER_RIG, VEIL_SHADE_RIG, CINDER_CRAWLER_RIG, ASH_BAT_RIG, EMBER_WISP_RIG, SLAG_SPITTER_RIG, BASALT_GUARD_RIG, MAGMA_TOAD_RIG, ASH_TOLLER_RIG, MAGMA_PISTON_RIG, CINDER_WEAVER_RIG, DUSK_SHADE_RIG, ROOT_TYRANT_RIG, MIRE_MATRIARCH_RIG, CRYSTAL_COLOSSUS_RIG, BELL_WARDEN_RIG, FOUNDRY_ENGINE_RIG, INKHEART_SOVEREIGN_RIG, DUSK_SHEPHERD_RIG, GROVE_GARDENER_RIG, CRATER_BEHEMOTH_RIG, CINDER_SOVEREIGN_RIG].map((r) => [r.id, r]));
