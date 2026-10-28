/**
 * THE ROOMS OF THE WORLD PAST THE SANCTUM, in the order the hero meets them, zone by zone (the list `content/beyond.ts` adds to `WORLD.rooms` when it arrives: the first frame of the game needs the four rooms of the first chapter and no more, and the budget
 * of the cold start is about what a hero standing in R1 has to download — sixty ids of rooms it cannot reach yet are not part of that).
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
];
