import type { AnimState } from '@/models/vocabulary';

/**
 * The ONLY thing the view needs to know about an actor (player, enemy, boss). The simulation fills it;
 * `ActorVisual` (three.js) reads it. Nothing here mentions meshes, clips or bones, which is what makes
 * every model swappable without touching gameplay.
 */
export interface ActorViewState {
  /** Feet-centre position at the previous and at the current simulation tick (for render interpolation). */
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  /** Visual depth offset (depth lanes). Never affects collision. */
  z: number;
  facing: 1 | -1;
  anim: AnimState;
  /** Playback speed multiplier (e.g. actual run speed / authored run speed). */
  animSpeed: number;
  /** Increment to restart the current animation (repeated attacks, combo hits). */
  animSerial: number;
  /** When > 0 the clip is time-fitted to this many seconds (ties the clip to AttackDefinition timing). */
  animDuration: number;
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
    flash: 0,
    opacity: 1,
    blink: false,
    visible: true,
  };
}
