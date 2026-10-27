import type { WorldDefinition } from '@/world/WorldDefinition';

/**
 * THE WORLD (docs/GAME-SPEC-2D.md §14.4, docs/PROMPT6-LOG.md S22, docs/PROMPT21-LOG.md): seven zones, sixty-four rooms. The first four are the vertical slice and its guardian; past the Sanctum the world opens on the Collapsed Nave, which is the hub of
 * the rest, and each zone ends in a guardian whose fall opens the way on to the next:
 *
 *   Ruins      r1_gate ⇄ r2_hall ⇄ r3_chamber ⇄ r4_sanctum  (Ink Warden: the Air Dash)  ⇄ ru_nave  + the Archive, the Cistern, the Reliquary
 *   Roots      the hole in the Nave → rt_mouth … rt_arena  (Root Tyrant)       the Double Jump, in the Echo Chamber
 *   Glowmire   mr_edge … mr_lair                           (Mire Matriarch)    the Wall Jump, in the Sinkhole
 *   Mines      mn_gate … mn_arena                          (Crystal Colossus)  the Ground Slam, in the Old Forge
 *   Spire      sp_foot … sp_arena                          (Bell Warden)
 *   Foundry    fd_gate … fd_arena                          (Foundry Engine)
 *   Heart      ih_threshold … ih_arena → ih_end            (Inkheart Sovereign), and the way out of the world
 *
 * Only the rooms and the starting point are written here: the connections are the `exits` of the rooms themselves (`exit.to = { room, entry }`), which is what `world/worldGraph` reads to build the graph and to prove that the whole world can be finished.
 */
export const WORLD: WorldDefinition = {
  id: 'ancient_forest',
  start: { room: 'r1_gate', entry: 'start' },
  rooms: [
    // the Ruins
    'r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum', 'ru_nave', 'ru_archive', 'ru_cistern', 'ru_reliquary',
    // the Sunken Roots
    'rt_mouth', 'rt_tangle', 'rt_hollow', 'rt_cellar', 'rt_bridge', 'rt_echo', 'rt_gallery', 'rt_hideout', 'rt_arena',
    // the Glowmire
    'mr_edge', 'mr_stilts', 'mr_lanterns', 'mr_toadpit', 'mr_shrine', 'mr_sink', 'mr_climb', 'mr_approach', 'mr_lair', 'mr_den',
    // the Crystal Mines
    'mn_gate', 'mn_seam', 'mn_hall', 'mn_camp', 'mn_forge', 'mn_descent', 'mn_rails', 'mn_approach', 'mn_arena', 'mn_vault',
    // the Bell Spire
    'sp_foot', 'sp_gallery', 'sp_stair', 'sp_shrine', 'sp_chimney', 'sp_belfry', 'sp_bridge', 'sp_approach', 'sp_arena', 'sp_loft',
    // the Ink Foundry
    'fd_gate', 'fd_line', 'fd_press', 'fd_furnace', 'fd_vats', 'fd_workshop', 'fd_catwalks', 'fd_control', 'fd_arena', 'fd_scrap',
    // the Heart of the Ink
    'ih_threshold', 'ih_veins', 'ih_shrine', 'ih_ascent', 'ih_approach', 'ih_arena', 'ih_end',
  ],
};
