/**
 * Every number that defines how the player MOVES, in one place. Units: metres, seconds, m/s, m/s².
 * Designers tweak this object (also live, from the debug panel); nothing about movement is hard-coded elsewhere.
 *
 * Feel reference points (player is 1.8 m tall, the screen shows ≈ 15 m of height / ≈ 32 m of width):
 *  - run speed 8.5 m/s crosses the screen in ≈ 3.7 s
 *  - full jump clears 3.1 m (1.7 body heights); a jump + dash crosses ≈ 9 m
 */
export interface MovementTuning {
  /** Max speed when the stick is only partly tilted / walk modifier held. */
  walkSpeed: number;
  runSpeed: number;
  /** Stick magnitude above which the character runs instead of walking. */
  runThreshold: number;

  groundAccel: number;
  groundDecel: number;
  /** Extra acceleration factor when reversing direction on the ground (snappier turns). */
  turnBoost: number;
  /** Air control: lower accel = more committed jumps; decel is how fast momentum bleeds off with no input. */
  airAccel: number;
  airDecel: number;

  gravity: number;
  /** Gravity multiplier while falling (> 1 = heavier, snappier descent). */
  fallGravityMultiplier: number;
  /** Gravity multiplier near the top of the jump (< 1 = a touch of hang time). */
  apexGravityMultiplier: number;
  /** |vy| below which the apex multiplier applies. */
  apexThreshold: number;
  maxFallSpeed: number;

  /** Height of a full (held) jump, metres. The take-off speed is derived from it. */
  jumpHeight: number;
  /** vy is multiplied by this when jump is released while rising (short hop). */
  jumpCutMultiplier: number;
  /** Seconds the jump is guaranteed before a release can cut it (a tap shorter than a frame still hops). */
  jumpMinHold: number;
  /** Seconds after walking off a ledge during which a jump still works. */
  coyoteTime: number;
  /** Seconds a jump press is remembered before landing. */
  jumpBuffer: number;
  /**
   * Seconds a "drop" press (the flick down of the touch controls) is remembered. It only does something on a one-way
   * platform, so it is kept short: long enough to survive the gap between two ticks, too short to fire on the next platform.
   */
  dropBuffer: number;
  /** Seconds an Ability press is remembered (a press during the cooldown of the last cast, or while attacking, still counts). */
  abilityBuffer: number;
  /** Landing faster than this (m/s) plays the landing animation / emits an impact. */
  landImpactSpeed: number;

  dash: {
    speed: number;
    duration: number;
    cooldown: number;
    /** Seconds from the start of the dash during which the player cannot be hurt. */
    invulnerability: number;
    /** Fraction of runSpeed kept when the dash ends. */
    exitSpeedFactor: number;
    /** Dashes allowed per airtime (reset on landing). */
    airDashes: number;
    /**
     * Fraction of the upward speed carried into the dash that is restored when it ends. The dash itself is flat,
     * but dashing early in a jump must not throw the jump away (it is the instinctive moment to press).
     */
    ascentRetention: number;
    /** Seconds a dash press is remembered (so it fires the moment it becomes available). */
    buffer: number;
  };

  /** Crouching (docs/GAME-SPEC-2D.md §6): a posture with collision consequences, not just an animation. */
  crouch: {
    /** Height of the collision body while crouched, metres (standing height lives in `PlayerDefinition.body`). */
    height: number;
    /** Height of the vulnerable region while crouched: hits at head height miss. */
    hurtboxHeight: number;
    /** Top walking speed while crouched, m/s (the ground accelerations still apply). */
    speed: number;
    /** `move.y` at or below `-enter` starts a crouch... */
    enter: number;
    /** ...and it can only end once `move.y` is back at or above `-exit` (hysteresis) AND there is room to stand. */
    exit: number;
  };
}

export const DEFAULT_MOVEMENT: MovementTuning = {
  walkSpeed: 4.2,
  runSpeed: 8.5,
  runThreshold: 0.62,

  groundAccel: 75,
  groundDecel: 95,
  turnBoost: 1.7,
  airAccel: 48,
  airDecel: 22,

  gravity: 52,
  fallGravityMultiplier: 1.4,
  apexGravityMultiplier: 0.62,
  apexThreshold: 2.4,
  maxFallSpeed: 26,

  jumpHeight: 3.1,
  jumpCutMultiplier: 0.42,
  jumpMinHold: 0.07,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  dropBuffer: 0.08,
  abilityBuffer: 0.12,
  landImpactSpeed: 9,

  dash: {
    speed: 21,
    duration: 0.17,
    cooldown: 0.42,
    invulnerability: 0.13,
    exitSpeedFactor: 0.85,
    airDashes: 1,
    ascentRetention: 0.8,
    buffer: 0.1,
  },

  crouch: {
    height: 1.0,
    hurtboxHeight: 0.9,
    speed: 3.0,
    enter: 0.6,
    exit: 0.4,
  },
};
