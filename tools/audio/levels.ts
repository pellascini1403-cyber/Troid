import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { AudioIndex } from '../../src/audio/manifest';
import { INDEX_PATH, MEASURES_PATH, type Measure } from './build';

/**
 * THE LOUDNESS OF EACH SOUND, ON PURPOSE (docs/PROMPT18-LOG.md): what a player hears as "balanced" is a decision, not an accident of how each sound was made. This is where it is made: for each kind of sound, how loud it is
 * to be when it plays at full level — in LUFS (the loudest 400 ms for a sound under three seconds, the whole of it for one longer, the same as `measures.json` says of each file) — and the build sets the trim that
 * every file needs (`gainDb` in the manifest) to be there. Nothing is re-rendered to change a level; the trim is a number the engine applies when the sound plays.
 *
 * How the targets are set (and what the default volumes then make of them): the hero's own movement lies under the music and is felt more than heard; combat comes out ahead of it, the heavier the louder; the hero's pain
 * is the loudest of the hero's sounds, because it is the one that matters most; the boss's moves are heard through the whole fight; the interface is the quietest of the lot, and the little sounds of a place are quiet and
 * far. With the music at 70 % and the effects at 90 % (the defaults), the music then lies about five LU under a sword blow and a few over a footstep.
 */
export interface LevelTarget {
  /** Sounds whose id matches. The first target that does is the one. */
  match: RegExp;
  /** Loudness (LUFS) the sound plays at at full level. */
  lufs: number;
}

export const LEVEL_TARGETS: readonly LevelTarget[] = [
  // the hero's body
  { match: /^hero\.step\./, lufs: -28 },
  { match: /^hero\.heartbeat$/, lufs: -26 },
  { match: /^hero\.(jump|jump\.air)$/, lufs: -23 },
  { match: /^hero\.dash\./, lufs: -21 },
  { match: /^hero\.land\.light$/, lufs: -25 },
  { match: /^hero\.land\.medium$/, lufs: -22 },
  { match: /^hero\.land\.heavy$/, lufs: -19 },
  { match: /^hero\.slash\./, lufs: -19 },
  { match: /^hero\.hurt\.light$/, lufs: -17 },
  { match: /^hero\.hurt\.heavy$/, lufs: -15 },
  { match: /^hero\.death$/, lufs: -15 },
  { match: /^hero\.respawn$/, lufs: -18 },
  // combat
  { match: /^hit\.light$/, lufs: -20 },
  { match: /^hit\.(heavy|bolt)$/, lufs: -17 },
  // the magic
  { match: /^magic\.cast\.start$/, lufs: -23 },
  { match: /^magic\.cast\.release$/, lufs: -18 },
  { match: /^magic\.(bolt\.fizzle|denied)$/, lufs: -24 },
  // the bottles
  { match: /^bottle\.(start|interrupted|ready)$/, lufs: -23 },
  { match: /^bottle\.drunk$/, lufs: -19 },
  { match: /^bottle\.denied$/, lufs: -25 },
  // the world
  { match: /^interact\.(pickup|rest)$/, lufs: -18 },
  { match: /^interact\.(open|activate)$/, lufs: -20 },
  { match: /^gate\./, lufs: -18 },
  { match: /^seal\.reject$/, lufs: -20 },
  { match: /^seal\.break$/, lufs: -14 },
  { match: /^hazard\./, lufs: -21 },
  { match: /^transition\./, lufs: -21 },
  // the enemies
  { match: /^slime\.alert$/, lufs: -22 },
  { match: /^slime\.(telegraph|lunge|death)$/, lufs: -19 },
  // the boss
  { match: /^boss\.(wake|phase)$/, lufs: -15 },
  { match: /^boss\.death$/, lufs: -14 },
  { match: /^boss\.telegraph\./, lufs: -17 },
  { match: /^boss\.strike\.charge$/, lufs: -16 },
  { match: /^boss\.strike\.rain$/, lufs: -18 },
  // the interface
  { match: /^ui\.(slider|toggle\.(on|off))$/, lufs: -27 },
  { match: /^ui\./, lufs: -25 },
  // the stingers
  { match: /^stinger\.card$/, lufs: -18 },
  { match: /^stinger\.unlock$/, lufs: -16 },
  { match: /^stinger\.victory$/, lufs: -15 },
  // the little sounds of a place
  { match: /^amb\.echo\.far$/, lufs: -31 },
  { match: /^amb\./, lufs: -28 },
  // the music (the layers are mastered to these in the score: the trim is zero) and the beds
  { match: /^(ruins|chamber|sanctum)\.base$/, lufs: -20 },
  { match: /^warden\.base$/, lufs: -19 },
  { match: /^(ruins|chamber|sanctum)\.drive$/, lufs: -24 },
  { match: /^warden\.drive$/, lufs: -23 },
  { match: /^bed\.(ruins|roots)\.base$/, lufs: -31 },
  { match: /^bed\.chamber\.base$/, lufs: -30 },
  { match: /^bed\.sanctum\.base$/, lufs: -32 },
];

/** The most a trim may turn a sound down or up (dB): a sound that needs more than this is a sound to be re-made. */
export const TRIM_LIMITS = { min: -14, max: 6 } as const;
/** The highest a peak may be once the trim is on (dBFS): the limiter of the engine is a safety net, not part of the sound. */
export const PEAK_CEILING = -1;

export const targetOf = (id: string): LevelTarget | undefined => LEVEL_TARGETS.find((t) => t.match.test(id));

/** The measurement name of a sound's file (the build writes `measures.json` by it): dots become underscores, and a sound with variations is numbered. */
export const measureName = (id: string, variant: number, variants: number): string => `${id.replace(/\./g, '_')}${variants > 1 ? `_${variant + 1}` : ''}`;

/**
 * The loudness of a sound as measured — of the file as a decoder gives it back when that was measured (`playedLufs`), of the samples it was made from if not: for variations, the loudest of them is the one the trim is made
 * for (the quieter ones are a little under it, as a light blow is under a heavy one).
 */
export function measuredLufs(id: string, variants: number, measures: Record<string, Measure>): number | null {
  let loudest: number | null = null;
  for (let v = 0; v < variants; v++) {
    const m = measures[measureName(id, v, variants)];
    const lufs = m?.playedLufs ?? m?.lufs;
    if (lufs !== undefined && (loudest === null || lufs > loudest)) loudest = lufs;
  }
  return loudest;
}

/** The loudest peak of a sound's files (as decoded, when that was measured). */
export function measuredPeak(id: string, variants: number, measures: Record<string, Measure>): number | null {
  let loudest: number | null = null;
  for (let v = 0; v < variants; v++) {
    const m = measures[measureName(id, v, variants)];
    const peak = m?.playedPeakDb ?? m?.peakDb;
    if (peak !== undefined && (loudest === null || peak > loudest)) loudest = peak;
  }
  return loudest;
}

/** Writes what the decoder gives back for each file (see `Measure.playedLufs`) into `measures.json`. */
export function writePlayed(played: Record<string, { lufs: number; peakDb: number }>): number {
  if (!existsSync(MEASURES_PATH)) return 0;
  const measures = JSON.parse(readFileSync(MEASURES_PATH, 'utf8')) as Record<string, Measure>;
  let n = 0;
  for (const [name, p] of Object.entries(played)) {
    const m = measures[name];
    if (!m) continue;
    m.playedLufs = p.lufs;
    m.playedPeakDb = p.peakDb;
    n++;
  }
  writeFileSync(MEASURES_PATH, `${JSON.stringify(measures, null, 1)}\n`);
  return n;
}

/** The trim (dB) that puts a sound at its target: the target minus how loud it is, held to the limits and to the peak ceiling. */
export function trimFor(target: number, lufs: number, peakDb: number): number {
  const wanted = target - lufs;
  const byPeak = PEAK_CEILING - peakDb; // the most it can be turned UP before it passes the ceiling
  return Math.round(Math.min(TRIM_LIMITS.max, Math.max(TRIM_LIMITS.min, Math.min(wanted, byPeak))) * 10) / 10;
}

/** Writes the trim of every sound that has a target into the manifest, from `measures.json`. Returns what it changed. */
export function balance(): Array<{ id: string; from: number; to: number }> {
  if (!existsSync(INDEX_PATH) || !existsSync(MEASURES_PATH)) return [];
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as AudioIndex;
  const measures = JSON.parse(readFileSync(MEASURES_PATH, 'utf8')) as Record<string, Measure>;
  const changes: Array<{ id: string; from: number; to: number }> = [];
  for (const [id, def] of Object.entries(index.sounds)) {
    const target = targetOf(id);
    const lufs = measuredLufs(id, def.variants.length, measures);
    const peak = measuredPeak(id, def.variants.length, measures);
    if (!target || lufs === null || peak === null) continue;
    const trim = trimFor(target.lufs, lufs, peak);
    if (trim !== def.gainDb) {
      changes.push({ id, from: def.gainDb, to: trim });
      def.gainDb = trim;
    }
  }
  if (changes.length > 0) writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`);
  return changes;
}
