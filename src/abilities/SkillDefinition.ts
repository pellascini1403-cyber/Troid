/** A projectile skill's flight, as data (docs/GAME-SPEC-2D.md §10.1). Metres, seconds, m/s, ticks. */
export interface ProjectileSpec {
  /** m/s along the facing direction. */
  speed: number;
  /** Metres it flies before it fizzles out. */
  range: number;
  damage: number;
  /** Velocity given to what it hits, `x` pointing away from the caster. */
  knockback: { x: number; y: number };
  /** Ticks the world freezes on impact. */
  hitStop: number;
  /** Camera trauma on impact, 0..1. */
  shake: number;
  /** Ticks of lost control it causes (0 = the target's own). */
  stun: number;
  /** Size of its hit area. */
  size: { w: number; h: number };
  /** Where it leaves the caster: metres in front of the body centre and above the feet, standing and crouched. */
  muzzle: { x: number; y: number; yCrouched: number };
}

/**
 * An ACTIVE skill (docs/ARCHITECTURE-2D.md §5.6): what it costs, how long it takes and what it does. It is the thing a card
 * equips. The first slice has one, the Spirit Bolt; adding another is a data entry and, if it does something new, a handler.
 * Times are SIMULATION TICKS except the cooldown, in seconds.
 */
export interface SkillDefinition {
  id: string;
  /** Magic spent when the cast is RELEASED (a cast that is interrupted before it costs nothing). */
  cost: number;
  /** Seconds after the release before the skill can be cast again. */
  cooldown: number;
  /** Ticks of preparation before the release, and of recovery after it. */
  startup: number;
  recovery: number;
  /** Fraction of the normal horizontal control the caster keeps while casting (0 = rooted, 1 = free). */
  moveControl: number;
  /** What the skill does when released: the key of its handler. */
  handler: 'projectile';
  projectile: ProjectileSpec;
}
