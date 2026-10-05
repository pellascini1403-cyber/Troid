import type { AnimPhase, AnimState } from './vocabulary';

/**
 * The ONLY thing the view needs to know about an actor (player, enemy, boss). The simulation fills it; the actor
 * sprite (Pixi) reads it. Nothing here mentions frames, textures or atlases, which is what makes every sprite set
 * swappable without touching gameplay.
 */
export interface ActorViewState {
  /** Feet-centre position at the previous and at the current simulation tick (for render interpolation). */
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  /** Legacy depth offset of the 3D prototype (removed in S4). Never affects collision. */
  z: number;
  facing: 1 | -1;
  anim: AnimState;
  /** Playback speed multiplier (e.g. actual run speed / authored run speed). */
  animSpeed: number;
  /** Increment to restart the current animation (repeated attacks, combo hits). */
  animSerial: number;
  /** When > 0 the clip is time-fitted to this many seconds (ties the clip to AttackDefinition timing). */
  animDuration: number;
  /**
   * Phase of the current timed action (`startup → active → recovery`) and progress 0..1 inside it. Clips that declare
   * `phases` pick their frame from THESE, not from real time, so the visible blow always coincides with the hitbox.
   */
  phase: AnimPhase;
  phaseT: number;
  /** Hit flash intensity 0..1. */
  flash: number;
  opacity: number;
  /** i-frames: the visual may blink. */
  blink: boolean;
  visible: boolean;
}

export function createActorViewState(): ActorViewState {
  return {
    prevX: 0, prevY: 0, x: 0, y: 0, z: 0,
    facing: 1,
    anim: 'idle',
    animSpeed: 1,
    animSerial: 0,
    animDuration: 0,
    phase: 'none',
    phaseT: 0,
    flash: 0,
    opacity: 1,
    blink: false,
    visible: true,
  };
}
