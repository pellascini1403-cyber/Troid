/**
 * THE ROOMS OF THE WORLD PAST THE SANCTUM, in the order the hero meets them, zone by zone (the list `content/beyond.ts` adds to `WORLD.rooms` when it arrives: the first frame of the game needs the four rooms of the first chapter and no more, and the budget
 * of the cold start is about what a hero standing in R1 has to download — a hundred rooms it cannot reach yet are not part of that). The first sixty-three (the first half of the adventure, past the Sanctum) are followed, after the Heart of the Ink, by the forty-one of the second
 * (docs/PROMPT23-LOG.md §7): the road goes on through the Heart's last room and ends, forty-one rooms later, behind the Cinder Sovereign.
 */
export const BEYOND_ROOMS: readonly string[] = [
  // the Ruins past the Sanctum
  'ru_nave', 'ru_archive', 'ru_cistern', 'ru_reliquary',
  // the Sunken Roots
  'rt_mouth', 'rt_tangle', 'rt_hollow', 'rt_cellar', 'rt_bridge', 'rt_echo', 'rt_gallery', 'rt_hideout', 'rt_arena',
  // the Glowmire
  'mr_edge', 'mr_stilts', 'mr_lanterns', 'mr_mangrove', 'mr_toadpit', 'mr_shrine', 'mr_sink', 'mr_climb', 'mr_approach', 'mr_lair', 'mr_den',
  // the Crystal Mines
  'mn_gate', 'mn_seam', 'mn_hall', 'mn_camp', 'mn_forge', 'mn_descent', 'mn_rails', 'mn_approach', 'mn_arena', 'mn_vault',
  // the Bell Spire
  'sp_foot', 'sp_gallery', 'sp_stair', 'sp_shrine', 'sp_chimney', 'sp_belfry', 'sp_roofs', 'sp_bridge', 'sp_approach', 'sp_arena', 'sp_loft',
  // the Ink Foundry
  'fd_gate', 'fd_line', 'fd_press', 'fd_furnace', 'fd_vats', 'fd_workshop', 'fd_catwalks', 'fd_control', 'fd_arena', 'fd_scrap',
  // the Heart of the Ink
  'ih_threshold', 'ih_veins', 'ih_shrine', 'ih_atrium', 'ih_ascent', 'ih_approach', 'ih_arena', 'ih_end',
  // the Dusk Verge
  'dv_gate', 'dv_orchard', 'dv_ford', 'dv_shrine', 'dv_lake', 'dv_ruins', 'dv_ridge', 'dv_approach', 'dv_arena', 'dv_cellar',
  // the Orb Grove
  'og_edge', 'og_roots', 'og_trunk', 'og_shrine', 'og_clearing', 'og_gap', 'og_spring', 'og_canopy', 'og_approach', 'og_arena', 'og_vault',
  // the Ember Crater
  'ec_rim', 'ec_slope', 'ec_river', 'ec_shrine', 'ec_forge', 'ec_tunnel', 'ec_caldera', 'ec_approach', 'ec_arena', 'ec_cache',
  // the Cinder Throne
  'ct_gate', 'ct_hall', 'ct_gallery', 'ct_shrine', 'ct_stair', 'ct_chains', 'ct_gauntlet', 'ct_approach', 'ct_arena', 'ct_end',
];
