import type { EdgePulse, Mood } from '@/presentation/atmosphere';
import { PALETTE } from '@/presentation/palette';

/**
 * THE ATMOSPHERE OF THE SCREEN, as DATA (docs/PROMPT8-LOG.md, phase I; the rules it keeps are `ATMOSPHERE_CONTRACT`): the dark each room closes in with, the dark of a fight, and the pulses at the edge of the
 * picture that say something happened to the hero. A dark is the near-black of the room's own hue — the blue of the gate, the green-black of the roots, the cyan-violet of the seal, the violet of the sanctum — so
 * that the vignette is the room's own night and not a grey frame over it.
 */
export const ROOM_MOODS: Readonly<Record<string, Mood>> = {
  // the Ruins: the blue of the gate, the green-black of the roots, the cyan-violet of the seal, the violet of the sanctum — and the Nave, which is the hub of the rest
  r1_gate: { tint: 0x020a12, strength: 0.5 },
  r2_hall: { tint: 0x03100d, strength: 0.52 },
  r3_chamber: { tint: 0x040a1a, strength: 0.52 },
  r4_sanctum: { tint: 0x07040f, strength: 0.62 },
  ru_nave: { tint: 0x030b14, strength: 0.48 },
  ru_archive: { tint: 0x050a1c, strength: 0.54 },
  ru_cistern: { tint: 0x02100f, strength: 0.56 },
  ru_reliquary: { tint: 0x06050f, strength: 0.56 },
  // the Sunken Roots: the green-black of R2, closer the deeper the stair goes
  rt_mouth: { tint: 0x03100b, strength: 0.5 },
  rt_tangle: { tint: 0x03110c, strength: 0.54 },
  rt_hollow: { tint: 0x04120a, strength: 0.54 },
  rt_cellar: { tint: 0x03100d, strength: 0.5 },
  rt_bridge: { tint: 0x02100e, strength: 0.56 },
  rt_echo: { tint: 0x031211, strength: 0.58 },
  rt_gallery: { tint: 0x03110b, strength: 0.54 },
  rt_hideout: { tint: 0x04130c, strength: 0.56 },
  rt_arena: { tint: 0x03130a, strength: 0.6 },
  // the Glowmire: the teal of black water with something that glows in it
  mr_edge: { tint: 0x03110e, strength: 0.48 },
  mr_stilts: { tint: 0x02120f, strength: 0.5 },
  mr_lanterns: { tint: 0x031410, strength: 0.52 },
  mr_mangrove: { tint: 0x03100c, strength: 0.52 },
  mr_toadpit: { tint: 0x02110c, strength: 0.54 },
  mr_shrine: { tint: 0x03120f, strength: 0.46 },
  mr_sink: { tint: 0x020f0e, strength: 0.56 },
  mr_climb: { tint: 0x03130f, strength: 0.52 },
  mr_approach: { tint: 0x031510, strength: 0.56 },
  mr_lair: { tint: 0x02140f, strength: 0.6 },
  mr_den: { tint: 0x02100b, strength: 0.58 },
  // the Crystal Mines: the cold blue of a lamp in a mine
  mn_gate: { tint: 0x040c16, strength: 0.48 },
  mn_seam: { tint: 0x040d1a, strength: 0.52 },
  mn_hall: { tint: 0x050e1c, strength: 0.52 },
  mn_camp: { tint: 0x06101a, strength: 0.46 },
  mn_forge: { tint: 0x0a0a14, strength: 0.54 },
  mn_descent: { tint: 0x040b18, strength: 0.58 },
  mn_rails: { tint: 0x050d1a, strength: 0.54 },
  mn_approach: { tint: 0x050c1b, strength: 0.56 },
  mn_arena: { tint: 0x050b1d, strength: 0.6 },
  mn_vault: { tint: 0x040a1a, strength: 0.58 },
  // the Bell Spire: the bronze-brown of old metal in the wind
  sp_foot: { tint: 0x100a06, strength: 0.46 },
  sp_gallery: { tint: 0x120b06, strength: 0.5 },
  sp_stair: { tint: 0x110906, strength: 0.52 },
  sp_shrine: { tint: 0x120a07, strength: 0.46 },
  sp_chimney: { tint: 0x100806, strength: 0.56 },
  sp_belfry: { tint: 0x140a05, strength: 0.54 },
  sp_roofs: { tint: 0x120a07, strength: 0.46 },
  sp_bridge: { tint: 0x0e0a08, strength: 0.5 },
  sp_approach: { tint: 0x120a05, strength: 0.56 },
  sp_arena: { tint: 0x140905, strength: 0.6 },
  sp_loft: { tint: 0x100906, strength: 0.56 },
  // the Ink Foundry: the red-black of a furnace gone cold
  fd_gate: { tint: 0x140806, strength: 0.48 },
  fd_line: { tint: 0x160907, strength: 0.52 },
  fd_press: { tint: 0x170807, strength: 0.54 },
  fd_furnace: { tint: 0x1a0905, strength: 0.54 },
  fd_vats: { tint: 0x120a10, strength: 0.54 },
  fd_workshop: { tint: 0x150a06, strength: 0.46 },
  fd_catwalks: { tint: 0x130907, strength: 0.5 },
  fd_control: { tint: 0x150808, strength: 0.56 },
  fd_arena: { tint: 0x1a0805, strength: 0.6 },
  fd_scrap: { tint: 0x120806, strength: 0.56 },
  // the Heart of the Ink: violet-black, the closest the screen comes in before the Sovereign (and no room closes in further than the sanctum)
  ih_threshold: { tint: 0x08040f, strength: 0.54 },
  ih_veins: { tint: 0x0a040f, strength: 0.58 },
  ih_shrine: { tint: 0x08050f, strength: 0.5 },
  ih_atrium: { tint: 0x09040f, strength: 0.58 },
  ih_ascent: { tint: 0x09040e, strength: 0.6 },
  ih_approach: { tint: 0x0a0410, strength: 0.6 },
  ih_arena: { tint: 0x08031a, strength: 0.62 },
  ih_end: { tint: 0x070a14, strength: 0.46 },
};

/** A room with no mood of its own (a playground, a room that comes later) closes in with this. */
export const DEFAULT_MOOD: Mood = { tint: 0x03070d, strength: 0.48 };

/** The dark while the guardian is awake: it comes in closer and takes the violet of what it is. */
export const FIGHT_MOOD: Mood = { tint: 0x07031a, strength: 0.7 };

export type PulseName = 'hurt' | 'power' | 'rest' | 'guardian' | 'fall';

/** The pulses at the edge of the screen: the colour each comes in, how strong and how long. A blow taken is the only one that darkens (a muted carmín, the accent of the palette); the rest are light. */
export const EDGE_PULSES: Readonly<Record<PulseName, EdgePulse>> = {
  hurt: { tint: 0xa51e2c, blend: 'normal', peak: 0.3, life: 0.42 },
  power: { tint: PALETTE.energyGlow, blend: 'add', peak: 0.26, life: 1.0 },
  rest: { tint: PALETTE.energyCore, blend: 'add', peak: 0.18, life: 0.8 },
  guardian: { tint: PALETTE.violetCore, blend: 'add', peak: 0.26, life: 1.0 },
  fall: { tint: PALETTE.violetGlow, blend: 'add', peak: 0.34, life: 1.3 },
};

export function moodFor(roomId: string): Mood {
  return ROOM_MOODS[roomId] ?? DEFAULT_MOOD;
}
