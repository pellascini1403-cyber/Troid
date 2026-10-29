import type { ScatterSpec } from './ambience';
import type { RoomSpec } from './reverb';

/**
 * THE SOUND OF EACH PLACE (docs/PROMPT18-LOG.md), as DATA: for each room of the world, the music it plays, the bed of ambience under it, the little sounds that happen in it now and then, what its floor sounds like under
 * the hero's feet and how its air answers a sound (the echo). A room that is not here — a playground, a room that comes later — has no music and no ambience, and the dry air of a plain room: silence is a correct answer.
 *
 * The places of the first slice, and why they sound as they do:
 *  - R1 «Puerta de las Ruinas»: open stone and wind. The piece of the ruins (sparse, mysterious), a bed of wind through broken masonry, a gust now and then, a stone settling.
 *  - R2 «Galería de Raíces»: damp earth and roots. The SAME piece goes on (the music does not restart at a door), under a different bed — a low hum of roots, drops, a creak of wood — and the steps on earth.
 *  - R3 «Cámara del Sello»: a sunken chamber of wet stone and a seal. Its own piece (tense, magical), a bed of deep water and a faint magic, drops, a far resonance, pulses of the seal.
 *  - R4 «Santuario»: a vast quiet. A calm piece for the way in and the rest at the shrine; the Warden's piece for the fight.
 *
 * The sixty rooms past the Sanctum (docs/PROMPT21-LOG.md) are sounded with what there is: the four pieces of music, the four beds and the seven small sounds of the first slice, set by ZONE — the music does not restart at a door, so a zone
 * keeps one piece, and what tells the zones apart is the bed under it, the floor, and how long the air holds a sound. The six guardians that came after the Warden fight to its piece (`BOSS_MUSIC`). That is a reuse, said as one: a zone of its
 * own music is the first thing the audio pipeline is owed.
 *
 * The forty-one rooms of the second half (docs/PROMPT23-LOG.md §7) are sounded the same way, from what there is: the Verge of Dusk is the wind of the ruins over ash, the Orb Grove the damp of the roots with the pulse of the spheres, the Ember
 * Crater the resonance of the chamber (stone that cracks with the heat), the Cinder Throne the vast quiet of the Sanctum. The lava has its own sound when it burns (`hazard.lava`, the hit); the bubbling of a pool and the crackle of an ember are owed
 * to the audio pipeline, with the music of each zone.
 */
export type Surface = 'stone' | 'earth' | 'wet';

export interface ZoneAudio {
  /** A piece of the manifest (`tracks`), or null. */
  track: string | null;
  /** The bed of the ambience (a piece of the manifest with one layer), or null. */
  bed: string | null;
  surface: Surface;
  room: RoomSpec;
  scatter: readonly ScatterSpec[];
  /** The groups of sounds that only this place needs (the boss's, fetched when the hero comes in and let go when they leave). */
  groups?: readonly string[];
}

/** A place with no sound of its own. */
export const SILENT_ZONE: ZoneAudio = {
  track: null,
  bed: null,
  surface: 'stone',
  room: { rt60: 0.9, damp: 0.6, predelayMs: 8, wet: 0.3 },
  scatter: [],
};

const FIRST_SLICE: Readonly<Record<string, ZoneAudio>> = {
  r1_gate: {
    groups: ['amb'],
    track: 'ruins',
    bed: 'bed.ruins',
    surface: 'stone',
    room: { rt60: 1.8, damp: 0.45, predelayMs: 14, wet: 0.3 },
    scatter: [
      { id: 'amb.wind.gust', gap: [9, 22], distance: [10, 26], gainDb: -2 },
      { id: 'amb.stone', gap: [12, 28], chance: 0.8, distance: [8, 24], gainDb: -3 },
    ],
  },
  r2_hall: {
    groups: ['amb'],
    track: 'ruins',
    bed: 'bed.roots',
    surface: 'earth',
    room: { rt60: 1.0, damp: 0.8, predelayMs: 8, wet: 0.22 },
    scatter: [
      { id: 'amb.drip', gap: [4, 11], chance: 0.85, distance: [6, 20], gainDb: -2 },
      { id: 'amb.roots.creak', gap: [14, 30], distance: [8, 24], gainDb: -3 },
    ],
  },
  r3_chamber: {
    groups: ['amb'],
    track: 'chamber',
    bed: 'bed.chamber',
    surface: 'wet',
    room: { rt60: 2.6, damp: 0.35, predelayMs: 18, wet: 0.42 },
    scatter: [
      { id: 'amb.drip', gap: [3, 8], distance: [5, 18], gainDb: -1 },
      { id: 'amb.echo.far', gap: [16, 34], distance: [18, 34], gainDb: -3 },
      { id: 'amb.magic.pulse', gap: [10, 22], chance: 0.9, distance: [6, 22], gainDb: -3 },
    ],
  },
  r4_sanctum: {
    groups: ['amb', 'boss'],
    track: 'sanctum',
    bed: 'bed.sanctum',
    surface: 'stone',
    room: { rt60: 2.8, damp: 0.3, predelayMs: 22, wet: 0.46 },
    scatter: [
      { id: 'amb.sanctum.breath', gap: [22, 45], distance: [12, 30], gainDb: -2 },
      { id: 'amb.magic.pulse', gap: [12, 26], distance: [8, 26], gainDb: -4 },
      { id: 'amb.stone', gap: [20, 40], chance: 0.7, distance: [10, 28], gainDb: -4 },
    ],
  },
};

/** The same place with one thing changed: the air that holds a sound longer, a fight that needs the guardian's sounds, a floor of another kind. */
const like = (base: ZoneAudio, over: Partial<ZoneAudio> = {}): ZoneAudio => ({ ...base, ...over });
/** A guardian's arena: the place, with the sounds of the fight to hold and the air a little longer. */
const arena = (base: ZoneAudio): ZoneAudio => like(base, { groups: [...(base.groups ?? ['amb']), 'boss'], room: { ...base.room, rt60: Math.max(base.room.rt60, 2.4), wet: Math.max(base.room.wet, 0.4) } });
/** Gives every room of the list the same place. */
const each = (ids: readonly string[], z: ZoneAudio): Array<[string, ZoneAudio]> => ids.map((id) => [id, z]);

const OPEN_STONE = FIRST_SLICE['r1_gate']!;
const DAMP_EARTH = FIRST_SLICE['r2_hall']!;
const WET_CHAMBER = FIRST_SLICE['r3_chamber']!;
const VAST = FIRST_SLICE['r4_sanctum']!;

/** The Glowmire: black water, the damp of the roots under the tense piece of the chamber — a drop every few seconds and an echo from far off. */
const MIRE: ZoneAudio = {
  groups: ['amb'],
  track: 'chamber',
  bed: 'bed.roots',
  surface: 'wet',
  room: { rt60: 1.7, damp: 0.6, predelayMs: 12, wet: 0.32 },
  scatter: [
    { id: 'amb.drip', gap: [3, 8], chance: 0.9, distance: [5, 18], gainDb: -2 },
    { id: 'amb.echo.far', gap: [18, 36], distance: [16, 32], gainDb: -4 },
    { id: 'amb.roots.creak', gap: [16, 34], distance: [8, 24], gainDb: -4 },
  ],
};
/** The Crystal Mines: cold stone that rings, the piece of the ruins over the bed of the chamber. */
const MINES: ZoneAudio = {
  groups: ['amb'],
  track: 'ruins',
  bed: 'bed.chamber',
  surface: 'stone',
  room: { rt60: 2.2, damp: 0.38, predelayMs: 16, wet: 0.36 },
  scatter: [
    { id: 'amb.stone', gap: [8, 20], chance: 0.9, distance: [8, 24], gainDb: -3 },
    { id: 'amb.drip', gap: [6, 14], chance: 0.8, distance: [6, 20], gainDb: -3 },
    { id: 'amb.echo.far', gap: [20, 40], distance: [18, 34], gainDb: -4 },
  ],
};
/** The Bell Spire: wind through bronze, high up — the piece of the ruins and its bed of wind, a gust more often than at the gate. */
const SPIRE: ZoneAudio = {
  groups: ['amb'],
  track: 'ruins',
  bed: 'bed.ruins',
  surface: 'stone',
  room: { rt60: 2.3, damp: 0.4, predelayMs: 18, wet: 0.34 },
  scatter: [
    { id: 'amb.wind.gust', gap: [6, 15], distance: [10, 26], gainDb: -2 },
    { id: 'amb.stone', gap: [14, 30], chance: 0.7, distance: [8, 24], gainDb: -4 },
    { id: 'amb.echo.far', gap: [22, 44], distance: [20, 36], gainDb: -4 },
  ],
};
/** The Ink Foundry: iron and a hum that is not wind — the piece of the chamber over its bed, the pulse of something that still runs. */
const FOUNDRY: ZoneAudio = {
  groups: ['amb'],
  track: 'chamber',
  bed: 'bed.chamber',
  surface: 'stone',
  room: { rt60: 1.9, damp: 0.42, predelayMs: 14, wet: 0.3 },
  scatter: [
    { id: 'amb.magic.pulse', gap: [10, 22], chance: 0.9, distance: [6, 22], gainDb: -3 },
    { id: 'amb.stone', gap: [10, 24], chance: 0.8, distance: [8, 24], gainDb: -3 },
    { id: 'amb.echo.far', gap: [24, 44], distance: [18, 34], gainDb: -4 },
  ],
};
/** The Heart of the Ink: the vast quiet of the Sanctum, closer — the same piece, the same bed, the breath and the pulse. */
const HEART: ZoneAudio = like(VAST, { groups: ['amb'], room: { rt60: 3, damp: 0.28, predelayMs: 24, wet: 0.48 } });

/** The Verge of Dusk: the wind of the ruins over a floor of ash, a little closer than at the gate — the piece of the ruins, its bed, and a gust now and then. */
const DUSK: ZoneAudio = like(OPEN_STONE, {
  surface: 'earth',
  room: { rt60: 1.7, damp: 0.5, predelayMs: 12, wet: 0.26 },
  scatter: [
    { id: 'amb.wind.gust', gap: [7, 17], distance: [10, 26], gainDb: -2 },
    { id: 'amb.stone', gap: [14, 30], chance: 0.6, distance: [8, 24], gainDb: -4 },
    { id: 'amb.echo.far', gap: [24, 46], distance: [20, 36], gainDb: -5 },
  ],
});
/** The Orb Grove: the damp of the roots under the piece of the chamber — a creak of wood, and the slow pulse of the spheres that hang in the trees. */
const GROVE: ZoneAudio = {
  groups: ['amb'],
  track: 'chamber',
  bed: 'bed.roots',
  surface: 'earth',
  room: { rt60: 1.5, damp: 0.7, predelayMs: 10, wet: 0.26 },
  scatter: [
    { id: 'amb.roots.creak', gap: [9, 20], distance: [8, 24], gainDb: -3 },
    { id: 'amb.magic.pulse', gap: [8, 18], chance: 0.9, distance: [6, 22], gainDb: -3 },
    { id: 'amb.echo.far', gap: [22, 42], distance: [18, 34], gainDb: -5 },
  ],
};
/** The Ember Crater: stone that rings and cracks with the heat — the piece of the chamber over its deep bed, a long air. */
const CRATER: ZoneAudio = {
  groups: ['amb'],
  track: 'chamber',
  bed: 'bed.chamber',
  surface: 'stone',
  room: { rt60: 2.1, damp: 0.34, predelayMs: 16, wet: 0.36 },
  scatter: [
    { id: 'amb.stone', gap: [6, 14], chance: 0.9, distance: [8, 24], gainDb: -2 },
    { id: 'amb.magic.pulse', gap: [12, 24], chance: 0.8, distance: [6, 22], gainDb: -4 },
    { id: 'amb.echo.far', gap: [20, 40], distance: [18, 34], gainDb: -4 },
  ],
};
/** The Cinder Throne: the vast quiet of the Sanctum, hotter and farther — the same piece and bed, a breath, a crack, an echo that takes its time. */
const THRONE: ZoneAudio = like(VAST, {
  groups: ['amb'],
  room: { rt60: 3.2, damp: 0.26, predelayMs: 26, wet: 0.5 },
  scatter: [
    { id: 'amb.sanctum.breath', gap: [20, 40], distance: [12, 30], gainDb: -2 },
    { id: 'amb.stone', gap: [12, 26], chance: 0.8, distance: [8, 26], gainDb: -3 },
    { id: 'amb.echo.far', gap: [24, 46], distance: [20, 36], gainDb: -4 },
  ],
});

export const ZONES: Readonly<Record<string, ZoneAudio>> = Object.fromEntries([
  ...Object.entries(FIRST_SLICE),
  // the Ruins past the Sanctum: the Nave is the gate again, larger; the Archive and the Cistern are the chamber, one dry and one under water; the Reliquary is above the roof, in the Sanctum's quiet
  ...each(['ru_nave'], like(OPEN_STONE, { room: { rt60: 2.4, damp: 0.4, predelayMs: 18, wet: 0.34 } })),
  ...each(['ru_archive'], like(WET_CHAMBER, { surface: 'stone' })),
  ...each(['ru_cistern'], like(WET_CHAMBER, { room: { rt60: 3, damp: 0.3, predelayMs: 20, wet: 0.5 } })),
  ...each(['ru_reliquary'], like(VAST, { groups: ['amb'], room: { rt60: 2.2, damp: 0.35, predelayMs: 18, wet: 0.4 } })),
  // the Sunken Roots: the damp earth of R2 all the way down; the Echo Chamber answers a sound for twice as long
  ...each(['rt_mouth', 'rt_tangle', 'rt_hollow', 'rt_cellar', 'rt_bridge', 'rt_gallery', 'rt_hideout'], DAMP_EARTH),
  ...each(['rt_echo'], like(DAMP_EARTH, { room: { rt60: 2.6, damp: 0.5, predelayMs: 16, wet: 0.4 } })),
  ...each(['rt_arena'], arena(DAMP_EARTH)),
  // the Glowmire
  ...each(['mr_edge', 'mr_stilts', 'mr_lanterns', 'mr_mangrove', 'mr_toadpit', 'mr_shrine', 'mr_sink', 'mr_climb', 'mr_approach', 'mr_den'], MIRE),
  ...each(['mr_lair'], arena(MIRE)),
  // the Crystal Mines
  ...each(['mn_gate', 'mn_seam', 'mn_hall', 'mn_camp', 'mn_forge', 'mn_descent', 'mn_rails', 'mn_approach', 'mn_vault'], MINES),
  ...each(['mn_arena'], arena(MINES)),
  // the Bell Spire
  ...each(['sp_foot', 'sp_gallery', 'sp_stair', 'sp_shrine', 'sp_chimney', 'sp_belfry', 'sp_roofs', 'sp_bridge', 'sp_approach', 'sp_loft'], SPIRE),
  ...each(['sp_arena'], arena(SPIRE)),
  // the Ink Foundry
  ...each(['fd_gate', 'fd_line', 'fd_press', 'fd_furnace', 'fd_vats', 'fd_workshop', 'fd_catwalks', 'fd_control', 'fd_scrap'], FOUNDRY),
  ...each(['fd_arena'], arena(FOUNDRY)),
  // the Heart of the Ink, and the last room, where the quiet is the Sanctum's
  ...each(['ih_threshold', 'ih_veins', 'ih_shrine', 'ih_atrium', 'ih_ascent', 'ih_approach', 'ih_end'], HEART),
  ...each(['ih_arena'], arena(HEART)),
  // the second half: the Verge of Dusk, the Orb Grove, the Ember Crater and the Cinder Throne (the last room is the Sanctum's quiet again)
  ...each(['dv_gate', 'dv_orchard', 'dv_ford', 'dv_shrine', 'dv_lake', 'dv_ruins', 'dv_ridge', 'dv_approach', 'dv_cellar'], DUSK),
  ...each(['dv_arena'], arena(DUSK)),
  ...each(['og_edge', 'og_roots', 'og_trunk', 'og_shrine', 'og_clearing', 'og_gap', 'og_spring', 'og_canopy', 'og_approach', 'og_vault'], GROVE),
  ...each(['og_arena'], arena(GROVE)),
  ...each(['ec_rim', 'ec_slope', 'ec_river', 'ec_shrine', 'ec_forge', 'ec_tunnel', 'ec_caldera', 'ec_approach', 'ec_cache'], CRATER),
  ...each(['ec_arena'], arena(CRATER)),
  ...each(['ct_gate', 'ct_hall', 'ct_gallery', 'ct_shrine', 'ct_stair', 'ct_chains', 'ct_gauntlet', 'ct_approach', 'ct_end'], THRONE),
  ...each(['ct_arena'], arena(THRONE)),
]);

export function zoneOf(roomId: string): ZoneAudio {
  return ZONES[roomId] ?? SILENT_ZONE;
}

/** The piece that plays while a boss fights, by the boss (`defId`): the Warden's, for all of them (a piece of each is owed). */
export const BOSS_MUSIC: Readonly<Record<string, string>> = {
  ink_warden: 'warden',
  boss_root_tyrant: 'warden',
  boss_mire_matriarch: 'warden',
  boss_colossus: 'warden',
  boss_bell_warden: 'warden',
  boss_engine: 'warden',
  boss_sovereign: 'warden',
  // the four of the second half, to the same piece (a piece of each is owed)
  boss_shepherd: 'warden',
  boss_gardener: 'warden',
  boss_behemoth: 'warden',
  boss_cinder_sovereign: 'warden',
};
