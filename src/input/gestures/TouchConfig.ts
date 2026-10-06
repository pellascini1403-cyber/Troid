import { clamp } from '@/core/math';

/**
 * Every number of the touch gestures (docs/GAME-SPEC-2D.md §4.3). Distances are dp: device-independent pixels, i.e. CSS pixels
 * at a `uiScale` of 1; the real distance is `dp × uiScale`. They are DATA: calibrating them on a real phone (risk R18, the
 * accidental jump from a drifting thumb) is editing this object, not the recognizer.
 */
export interface TouchConfig {
  /** Useful radius of the movement drag: the displacement that means "all the way" on each axis, dp. */
  rx: number;
  ry: number;
  /** Fraction of `rx` below which the horizontal axis reads 0 (the rest is rescaled to 0..1). */
  deadZoneX: number;
  /** The origin follows the finger when it goes past the radius, so reversing only takes a short drag. */
  followOrigin: boolean;
  /** Jump: `ay` crossing UP `jumpEnter` presses it (when armed), `ay` below `jumpHold` releases it, `ay` back at `jumpRearm` arms it again. */
  jumpEnter: number;
  jumpRearm: number;
  jumpHold: number;
  /** Dropping through a one-way platform: a flick down of at least this many dp... */
  dropFlickDistance: number;
  /** ...within this many milliseconds. */
  dropFlickWindowMs: number;
  /** Width of the invisible movement zone, as a fraction of the usable width (the left side of the screen). */
  leftZoneWidth: number;
  /** Controls are never placed closer than this to the side edges (system gestures live there), dp. */
  edgeMargin: number;
}

export const DEFAULT_TOUCH: Readonly<TouchConfig> = Object.freeze({
  rx: 56,
  ry: 44,
  deadZoneX: 0.12,
  followOrigin: true,
  jumpEnter: 0.55,
  jumpRearm: 0.25,
  jumpHold: 0.3,
  dropFlickDistance: 28,
  dropFlickWindowMs: 100,
  leftZoneWidth: 0.46,
  edgeMargin: 28,
});

/** The reference screen of the design: an 844 px wide landscape phone (GAME-SPEC-2D §4.3.7). */
const REFERENCE_WIDTH = 844;

/**
 * `uiScale` (§4.3.7): scales radii, buttons and thresholds so a phone and a tablet share one design. Capped by the height
 * (a very wide, short screen must not get huge controls) and kept within 0.9 … 1.6.
 */
export function uiScale(width: number, height: number): number {
  return clamp(Math.min(width, height * 2.1) / REFERENCE_WIDTH, 0.9, 1.6);
}
