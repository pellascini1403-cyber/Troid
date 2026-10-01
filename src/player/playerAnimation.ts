import type { AnimState } from '@/models/vocabulary';

/** Everything the animation choice depends on. Pure data → pure function → trivially testable. */
export interface PlayerAnimInput {
  dashing: boolean;
  grounded: boolean;
  vx: number;
  vy: number;
  /** > 0 for a few ticks after a hard landing. */
  landTicks: number;
  walkSpeed: number;
  runSpeed: number;
}

export interface PlayerAnimOutput {
  anim: AnimState;
  /** Playback speed multiplier so feet match the ground speed (no moonwalking). */
  speed: number;
}

/**
 * PLAYER ANIMATION: maps player logic to LOGICAL animation states. It never mentions clips or files — the
 * model definition decides what 'run' means for the current character.
 */
export function deriveAnimation(i: PlayerAnimInput): PlayerAnimOutput {
  if (i.dashing) return { anim: 'dash', speed: 1 };
  if (!i.grounded) return { anim: i.vy > 0.5 ? 'jump' : 'fall', speed: 1 };
  if (i.landTicks > 0) return { anim: 'land', speed: 1 };
  const v = Math.abs(i.vx);
  if (v < 0.4) return { anim: 'idle', speed: 1 };
  if (v <= i.walkSpeed * 1.15) return { anim: 'walk', speed: clampSpeed(v / i.walkSpeed) };
  return { anim: 'run', speed: clampSpeed(v / i.runSpeed) };
}

function clampSpeed(s: number): number {
  return Math.min(1.5, Math.max(0.5, s));
}
