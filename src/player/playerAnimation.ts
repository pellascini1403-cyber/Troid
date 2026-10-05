import type { AnimState } from '@/presentation/vocabulary';

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
  /** The body is the crouched size (crouch state, crouched dash, forced crouch). */
  crouching: boolean;
  crouchSpeed: number;
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
  // A crouched dash is a slide under the passage: the low crouch-walk, fast (the stretched dash pose would poke through the roof).
  if (i.dashing) return i.crouching ? { anim: 'crouchWalk', speed: 1.5 } : { anim: 'dash', speed: 1 };
  if (!i.grounded) return { anim: i.vy > 0.5 ? 'jump' : 'fall', speed: 1 };
  if (i.landTicks > 0) return { anim: 'land', speed: 1 };
  const v = Math.abs(i.vx);
  if (i.crouching) return v < 0.4 ? { anim: 'crouch', speed: 1 } : { anim: 'crouchWalk', speed: clampSpeed(v / i.crouchSpeed) };
  if (v < 0.4) return { anim: 'idle', speed: 1 };
  if (v <= i.walkSpeed * 1.15) return { anim: 'walk', speed: clampSpeed(v / i.walkSpeed) };
  return { anim: 'run', speed: clampSpeed(v / i.runSpeed) };
}

function clampSpeed(s: number): number {
  return Math.min(1.5, Math.max(0.5, s));
}
