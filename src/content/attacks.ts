import type { AttackDefinition } from '@/combat/AttackDefinition';

/**
 * The player's attacks (docs/GAME-SPEC-2D.md §7.2). Starting values, retuned by playing: they are DATA, in ticks and
 * metres relative to the body facing right. `startup / active / recovery` are the whole contract with the sprite
 * clip (it picks its frame from the phase) and with the enemy (who reads the wind-up).
 */
export const SLASH_1: AttackDefinition = {
  id: 'slash_1',
  startup: 4, active: 3, recovery: 8,
  damage: 1,
  hitbox: { x: 0.2, y: 0.3, w: 1.4, h: 1.1 },
  knockback: { x: 5, y: 2 },
  stun: 12,
  hitStop: 4,
  shake: 0.06,
  lunge: { speed: 3, ticks: 4 },
  moveControl: 0.25,
  cancelWindow: { from: 8, to: 15 },
  next: 'slash_2',
  anim: 'attack',
  vfx: 'slash',
  hitVfx: 'impact',
};

export const SLASH_2: AttackDefinition = {
  id: 'slash_2',
  startup: 3, active: 3, recovery: 11,
  damage: 1,
  hitbox: { x: 0.2, y: 0.25, w: 1.6, h: 1.25 },
  knockback: { x: 9, y: 3.5 },
  stun: 16,
  hitStop: 6,
  shake: 0.14,
  moveControl: 0.1,
  anim: 'attack2',
  vfx: 'slash',
  hitVfx: 'impact',
};

export const AIR_SLASH: AttackDefinition = {
  id: 'air_slash',
  startup: 3, active: 4, recovery: 9,
  damage: 1,
  hitbox: { x: 0.15, y: 0.3, w: 1.4, h: 1.2 },
  knockback: { x: 5, y: 2 },
  stun: 12,
  hitStop: 4,
  shake: 0.06,
  moveControl: 0.6,
  airGravityScale: 0.6,
  anim: 'attackAir',
  vfx: 'slash',
  hitVfx: 'impact',
};

export const CROUCH_SLASH: AttackDefinition = {
  id: 'crouch_slash',
  startup: 4, active: 3, recovery: 9,
  damage: 1,
  hitbox: { x: 0.2, y: 0.0, w: 1.4, h: 0.65 },
  knockback: { x: 4, y: 1 },
  stun: 10,
  hitStop: 4,
  shake: 0.05,
  moveControl: 0,
  anim: 'attackCrouch',
  vfx: 'slash',
  hitVfx: 'impact',
};

/**
 * The Ground Slam (docs/PROMPT21-LOG.md), two blows the controller submits itself (it owns the timing of the hover, the dive and the lag): the dive hurts what the hero falls on, once each; the wave, on the tick after
 * the feet touch the ground, is the id a cracked floor asks for. They are data like every other attack — `startup/active/recovery` are not used (the controller's `slam` tuning owns the phases), the hitboxes, the damage and the shake are.
 */
export const SLAM_DIVE: AttackDefinition = {
  id: 'slam_dive',
  startup: 0, active: 1, recovery: 0,
  damage: 2,
  hitbox: { x: -0.5, y: -0.9, w: 1.0, h: 1.4 },
  knockback: { x: 3, y: 4 },
  stun: 18,
  hitStop: 5,
  shake: 0.1,
  moveControl: 0,
  anim: 'attackAir',
  vfx: 'slash',
  hitVfx: 'impact',
};

export const SLAM_WAVE: AttackDefinition = {
  id: 'slam',
  startup: 0, active: 3, recovery: 0,
  damage: 3,
  hitbox: { x: 0, y: -0.1, w: 3.4, h: 1.5 },
  knockback: { x: 8, y: 5 },
  stun: 26,
  hitStop: 7,
  shake: 0.32,
  moveControl: 0,
  anim: 'attackAir',
  vfx: 'slash',
  hitVfx: 'impact',
};

/** The ids a hit of the sword carries: what a wall that any blow breaks accepts (the Spirit Bolt and the slam are other ids). */
export const SWORD_HITS: readonly string[] = ['slash_1', 'slash_2', 'air_slash', 'crouch_slash'];

export const PLAYER_ATTACKS: Readonly<Record<string, AttackDefinition>> = {
  [SLASH_1.id]: SLASH_1,
  [SLASH_2.id]: SLASH_2,
  [AIR_SLASH.id]: AIR_SLASH,
  [CROUCH_SLASH.id]: CROUCH_SLASH,
  [SLAM_DIVE.id]: SLAM_DIVE,
  [SLAM_WAVE.id]: SLAM_WAVE,
};
