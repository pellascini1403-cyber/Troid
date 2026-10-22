import { AUDIO_CATEGORIES, AUDIO_LEVEL_LIMITS, DEFAULT_AUDIO_LEVELS, type AudioCategory, type AudioLevels } from '@/presentation/audioMix';
import { gainOf } from './volume';

/**
 * THE LEVELS THE PLAYER CHOSE (docs/PROMPT18-LOG.md): the general volume and one for the music, the effects and the ambience. Made BEFORE the engine exists — the page reads them from the settings as it starts — and
 * handed to it later, which follows `changed` from then on: a slider is heard the moment it moves, and a level that is read before any sound is ready is the same level.
 *
 * `gain(category)` is the amplitude the engine puts on that category's bus (the general volume is a bus of its own, so a category's gain does not include it); `audible(category)` is whether anything of it should be
 * played at all — a category at zero, or a general volume at zero, is SILENT, and silent means nothing is started, nothing is loaded for it and nothing is kept going behind.
 */
/** The category a bus of sound answers to: the interface follows the effects' volume. */
export function categoryOfBus(bus: 'sfx' | 'ambience' | 'music' | 'ui'): Exclude<AudioCategory, 'master'> {
  return bus === 'ui' ? 'sfx' : bus;
}

export class Levels {
  private readonly values: AudioLevels;
  /** A level moved: which one and to what (the engine's one subscription). */
  private readonly listeners = new Set<(category: AudioCategory, level: number) => void>();

  constructor(initial: Partial<AudioLevels> = {}) {
    const start = { ...DEFAULT_AUDIO_LEVELS, ...initial };
    this.values = Object.fromEntries(AUDIO_CATEGORIES.map((c) => [c, clampLevel(start[c], DEFAULT_AUDIO_LEVELS[c])])) as AudioLevels;
  }

  level(category: AudioCategory): number {
    return this.values[category];
  }

  /** The amplitude of the category's bus (0 … 1): the square of the level. */
  gain(category: AudioCategory): number {
    return gainOf(this.level(category));
  }

  /** Whether the category can be heard now: its own level and the general one are both above zero. */
  audible(category: AudioCategory): boolean {
    return this.level('master') > 0 && this.level(category) > 0;
  }

  /** What a bus of the engine plays at, with the general volume taken in (what comes out of the speakers). */
  effective(category: Exclude<AudioCategory, 'master'>): number {
    return this.gain('master') * this.gain(category);
  }

  /** The level is clamped to 0 … 1; returns whether it changed. */
  set(category: AudioCategory, level: number): boolean {
    if (!Number.isFinite(level)) return false;
    const next = clampLevel(level, this.values[category]);
    if (next === this.values[category]) return false;
    this.values[category] = next;
    for (const listener of [...this.listeners]) listener(category, next);
    return true;
  }

  /** Sets several at once (the settings as they were loaded); announces each one that changed. */
  setAll(levels: Partial<AudioLevels>): void {
    for (const c of AUDIO_CATEGORIES) {
      const v = levels[c];
      if (v !== undefined) this.set(c, v);
    }
  }

  snapshot(): AudioLevels {
    return Object.fromEntries(AUDIO_CATEGORIES.map((c) => [c, this.level(c)])) as AudioLevels;
  }

  /** `listener` hears every change from now on; returns the way to stop hearing. */
  onChange(listener: (category: AudioCategory, level: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function clampLevel(level: number, fallback: number): number {
  if (!Number.isFinite(level)) return fallback;
  return Math.min(AUDIO_LEVEL_LIMITS.max, Math.max(AUDIO_LEVEL_LIMITS.min, level));
}
