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

export const ZONES: Readonly<Record<string, ZoneAudio>> = {
  r1_gate: {
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
    groups: ['boss'],
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

export function zoneOf(roomId: string): ZoneAudio {
  return ZONES[roomId] ?? SILENT_ZONE;
}

/** The piece that plays while a boss fights, by the boss (`defId`). */
export const BOSS_MUSIC: Readonly<Record<string, string>> = { ink_warden: 'warden' };
