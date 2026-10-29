import type { WorldDefinition } from '@/world/WorldDefinition';

/**
 * THE WORLD (docs/GAME-SPEC-2D.md §14.4, docs/PROMPT6-LOG.md S22, docs/PROMPT21-LOG.md): eleven zones, a hundred and eight rooms (docs/PROMPT23-LOG.md §7 is the second half). The first four are the vertical slice and its guardian; past the Sanctum the world opens on the Collapsed Nave, which is the hub of
 * the rest, and each zone ends in a guardian whose fall opens the way on to the next:
 *
 *   Ruins      r1_gate ⇄ r2_hall ⇄ r3_chamber ⇄ r4_sanctum  (Ink Warden: the Air Dash)  ⇄ ru_nave  + the Archive, the Cistern, the Reliquary
 *   Roots      the hole in the Nave → rt_mouth … rt_arena  (Root Tyrant)       the Double Jump, in the Echo Chamber
 *   Glowmire   mr_edge … mr_lair                           (Mire Matriarch)    the Wall Jump, in the Sinkhole
 *   Mines      mn_gate … mn_arena                          (Crystal Colossus)  the Ground Slam, in the Old Forge
 *   Spire      sp_foot … sp_arena                          (Bell Warden)
 *   Foundry    fd_gate … fd_arena                          (Foundry Engine)
 *   Heart      ih_threshold … ih_arena → ih_end            (Inkheart Sovereign), and the way on, east, to the Verge
 *   Verge      dv_gate … dv_arena                          (Dusk Shepherd)     the first pools of lava
 *   Grove      og_edge … og_arena                          (Grove Gardener)    lava between the roots
 *   Crater     ec_rim … ec_arena                           (Crater Behemoth)   the river of fire
 *   Throne     ct_gate … ct_arena → ct_end                 (Cinder Sovereign), and the way out of the world
 *
 * Only the rooms and the starting point are written here: the connections are the `exits` of the rooms themselves (`exit.to = { room, entry }`), which is what `world/worldGraph` reads to build the graph and to prove that the whole world can be finished.
 *
 * The list holds the four rooms the first frame needs; the rest of it (`content/worldRooms.ts`) is added by `content/beyond.ts` when that chunk arrives, so whoever imports `@/content` (the pause menu, the tests, the tools) has the world whole.
 */
export const WORLD_ROOMS: string[] = ['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum'];

export const WORLD: WorldDefinition = {
  id: 'ancient_forest',
  start: { room: 'r1_gate', entry: 'start' },
  rooms: WORLD_ROOMS,
};
