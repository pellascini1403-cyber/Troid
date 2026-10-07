import { Observable } from '@/core/observable';

/**
 * The master volume (docs/PROMPT6-LOG.md S30), PREPARED: the game has no sound yet, so nothing is heard at any level. What exists is the control
 * a player already has — a level they choose, saved with their settings — and the one place the sound of a later version will read it from: its
 * `gain` is what goes on the master gain node, and `changed` is what that node follows. Nothing else in the game knows about audio.
 */

/** The level a player sees (a slider, 0–1) is not the amplitude: loudness is heard on a curve, so the same step is the same change at every volume. */
export function gainOf(level: number): number {
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return l * l;
}

export class MasterVolume {
  /** The level, 0–1, announced when it changes. */
  readonly changed: Observable<number>;

  constructor(level = 1) {
    this.changed = new Observable(Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 1);
  }

  get level(): number {
    return this.changed.get();
  }

  /** The amplitude to put on the master gain node: 0 is silence, 1 is full. */
  get gain(): number {
    return gainOf(this.level);
  }

  /** The level is clamped to 0–1; returns whether it changed. */
  set(level: number): boolean {
    if (!Number.isFinite(level)) return false;
    return this.changed.set(Math.min(1, Math.max(0, level)));
  }
}
