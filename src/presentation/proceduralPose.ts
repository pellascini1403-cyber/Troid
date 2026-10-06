import { clamp01, easeInOutCubic, easeOutCubic, lerp } from '@/core/math';
import { ANIM_FALLBACKS, type AnimPhase, type AnimState } from './vocabulary';

/**
 * A procedural actor (docs/ARCHITECTURE-2D.md §7.5): a creature drawn from shapes and DEFORMED instead of animated by
 * frames — the way of the ink enemies, which squash, stretch and slide. This file is the pure half: the look as data,
 * and the maths that turns "which animation, how far through it" into a deformation. `render/ProceduralActor` only
 * applies the result to Pixi shapes, so the whole behaviour is testable without a renderer.
 *
 * It reads the same logical vocabulary as the sprite pipeline (`anim`, `phaseT`), so the day an enemy gets frames the
 * simulation does not change.
 */

export type Easing = 'linear' | 'in' | 'out' | 'inOut';

/** A pose at the START and at the END of a state, interpolated by the progress `phaseT` of the timed state. */
export interface PoseKeys {
  /** Width / height multipliers of the body (squash and stretch, about the feet). */
  scaleX: readonly [from: number, to: number];
  scaleY: readonly [from: number, to: number];
  /** Horizontal lean (radians; + leans toward the facing). */
  lean?: readonly [from: number, to: number];
  /** Eye brightness: 0 dark, 1 white, > 1 incandescent (extra glow around them). */
  eyeGlow: readonly [from: number, to: number];
  /** Eye closure 0 (wide) → 1 (squinting shut). */
  squint?: readonly [from: number, to: number];
  /** Violet aura strength 0..1 and size multiplier. */
  aura?: readonly [from: number, to: number];
  auraScale?: readonly [from: number, to: number];
  ease?: Easing;
  /** A looping wobble over the pose (breathing, sliding): amplitude as a fraction of the size, frequency in Hz. */
  wobble?: { amp: number; hz: number };
  /** Tremble (m) that grows with the progress: the held breath before a lunge. */
  tremble?: number;
}

export interface ProceduralLook {
  id: string;
  /** The resting blob, metres, feet-centred. */
  width: number;
  height: number;
  colors: {
    /** The body. */
    fill: number;
    /** Its outline and the underside. */
    rim: number;
    /** A soft highlight that gives it volume. */
    sheen: number;
    eye: number;
    /** The glow around incandescent eyes. */
    eyeGlow: number;
    aura: number;
    flash: number;
  };
  /** Eyes: size (m), where they sit (fractions of the body: height up, forward of the centre, spread between them). */
  eyes: { width: number; height: number; y: number; forward: number; spread: number };
  /** The pose of each logical animation (with the vocabulary's fallbacks: a look may define only a few). */
  poses: Partial<Record<AnimState, PoseKeys>>;
  /** Poses of the parts of a timed action; they win over `poses` while that phase is on (a slump in `recovery`). */
  phases?: Partial<Record<Exclude<AnimPhase, 'none'>, PoseKeys>>;
}

export interface ProceduralPose {
  scaleX: number;
  scaleY: number;
  lean: number;
  /** Horizontal tremble offset, metres. */
  shakeX: number;
  eyeGlow: number;
  squint: number;
  aura: number;
  auraScale: number;
}

export function createProceduralPose(): ProceduralPose {
  return { scaleX: 1, scaleY: 1, lean: 0, shakeX: 0, eyeGlow: 0, squint: 0, aura: 0, auraScale: 1 };
}

/** The pose a look defines for `anim`, following the vocabulary's fallback chain (the chain always ends in `idle`). */
export function resolvePose(look: ProceduralLook, anim: AnimState): PoseKeys | undefined {
  const direct = look.poses[anim];
  if (direct) return direct;
  for (const next of ANIM_FALLBACKS[anim]) {
    const keys = look.poses[next];
    if (keys) return keys;
  }
  return look.poses.idle;
}

function ease(kind: Easing | undefined, t: number): number {
  switch (kind) {
    case 'in': return t * t;
    case 'out': return easeOutCubic(t);
    case 'inOut': return easeInOutCubic(t);
    default: return t;
  }
}

/**
 * Evaluates the deformation. `progress` is the 0..1 progress through the current timed state (the simulation's
 * `phaseT`), `time` is the actor's free-running animation clock in seconds (frozen by a hit-stop, like the frames).
 */
export function evalPose(
  look: ProceduralLook,
  anim: AnimState,
  phase: AnimPhase,
  progress: number,
  time: number,
  out: ProceduralPose,
): ProceduralPose {
  const k = (phase !== 'none' ? look.phases?.[phase] : undefined) ?? resolvePose(look, anim);
  if (!k) {
    out.scaleX = out.scaleY = out.auraScale = 1;
    out.lean = out.shakeX = out.eyeGlow = out.squint = out.aura = 0;
    return out;
  }
  const t = ease(k.ease, clamp01(progress));
  let sx = lerp(k.scaleX[0], k.scaleX[1], t);
  let sy = lerp(k.scaleY[0], k.scaleY[1], t);
  if (k.wobble) {
    const w = Math.sin(time * Math.PI * 2 * k.wobble.hz);
    sy *= 1 + k.wobble.amp * w;
    sx *= 1 - k.wobble.amp * 0.6 * w; // roughly volume-preserving: taller = narrower
  }
  out.scaleX = sx;
  out.scaleY = sy;
  out.lean = k.lean ? lerp(k.lean[0], k.lean[1], t) : 0;
  out.eyeGlow = lerp(k.eyeGlow[0], k.eyeGlow[1], t);
  out.squint = k.squint ? lerp(k.squint[0], k.squint[1], t) : 0;
  out.aura = k.aura ? lerp(k.aura[0], k.aura[1], t) : 0;
  out.auraScale = k.auraScale ? lerp(k.auraScale[0], k.auraScale[1], t) : 1;
  out.shakeX = k.tremble ? Math.sin(time * 90) * k.tremble * t : 0;
  return out;
}
