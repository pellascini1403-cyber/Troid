import type { AnimState } from '@/models/vocabulary';

/**
 * One attack, as data. Times are SIMULATION TICKS (60 per second). The three phases are the whole contract with
 * animation and balance:
 *
 *   startup   — wind-up: the attacker is committed but harmless (this is what the defender reads and reacts to)
 *   active    — the hitbox exists
 *   recovery  — follow-through: harmless and (mostly) helpless: the opening for a counter-attack
 *
 * The animation clip is time-fitted to the total, so retuning timings never needs new art.
 */
export interface AttackDefinition {
  id: string;

  startup: number;
  active: number;
  recovery: number;

  damage: number;

  /**
   * Hit area in the attacker's local frame, facing right: `x` = distance from the body centre to the NEAR edge,
   * `y` = height of the BOTTOM edge above the feet. Mirrored automatically when facing left.
   */
  hitbox: { x: number; y: number; w: number; h: number };

  /** Velocity given to the target, `x` pointing away from the attacker. */
  knockback: { x: number; y: number };
  /** Ticks the target loses control for (only if it can be staggered). */
  stun: number;

  /** Ticks the whole simulation freezes on impact — the single biggest contributor to a hit feeling heavy. */
  hitStop: number;
  /** Camera trauma added on impact, 0..1. */
  shake: number;

  /** Forward speed of the attacker while it lunges, for the first `ticks` ticks. */
  lunge?: { speed: number; ticks: number };
  /** Horizontal control retained during the attack (0 = rooted, 1 = free movement). */
  moveControl: number;
  /** Gravity multiplier while attacking in the air (< 1 = a small hover that makes air attacks usable). */
  airGravityScale?: number;

  /** Window (ticks since the attack began) in which a fresh attack press chains into `next`. */
  cancelWindow?: { from: number; to: number };
  next?: string;

  /** Energy gained by the attacker for every confirmed hit. */
  energyOnHit?: number;

  /** Logical animation to play (time-fitted to the attack length). */
  anim: AnimState;
  /** Logical effect ids: the VFX / audio layers decide what they look and sound like. */
  vfx?: string;
  sfx?: string;
  hitVfx?: string;
  hitSfx?: string;
}

export function attackLength(a: Pick<AttackDefinition, 'startup' | 'active' | 'recovery'>): number {
  return a.startup + a.active + a.recovery;
}
