import type { EdgePulse, Mood } from '@/presentation/atmosphere';
import { PALETTE } from '@/presentation/palette';

/**
 * THE ATMOSPHERE OF THE SCREEN, as DATA (docs/PROMPT8-LOG.md, phase I; the rules it keeps are `ATMOSPHERE_CONTRACT`): the dark each room closes in with, the dark of a fight, and the pulses at the edge of the
 * picture that say something happened to the hero. A dark is the near-black of the room's own hue — the blue of the gate, the green-black of the roots, the cyan-violet of the seal, the violet of the sanctum — so
 * that the vignette is the room's own night and not a grey frame over it.
 */
export const ROOM_MOODS: Readonly<Record<string, Mood>> = {
  r1_gate: { tint: 0x020a12, strength: 0.5 },
  r2_hall: { tint: 0x03100d, strength: 0.52 },
  r3_chamber: { tint: 0x040a1a, strength: 0.52 },
  r4_sanctum: { tint: 0x07040f, strength: 0.62 },
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
