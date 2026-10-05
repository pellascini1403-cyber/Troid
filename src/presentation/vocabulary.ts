/**
 * Logical vocabulary shared by the simulation (which REQUESTS things) and the presentation (which maps them to
 * whatever sprite set the actor currently has). Gameplay only ever speaks in these ids; frame names, atlases and
 * files live in a `SpriteSetDefinition` and can change freely when the final art arrives.
 */

/** Logical animation states. A sprite set does not need all of them: missing ones fall back (see `ANIM_FALLBACKS`). */
export const ANIM_STATES = [
  'idle', 'walk', 'run', 'move',
  'jump', 'fall', 'land',
  'crouch', 'crouchWalk',
  'attack', 'attack1', 'attack2', 'attackAir', 'attackCrouch', 'special', 'cast',
  'dash', 'hurt', 'death',
  'drink', 'interact', 'telegraph', 'phaseTransition',
] as const;
export type AnimState = (typeof ANIM_STATES)[number];

/**
 * Anchor points of an actor, in METRES relative to the feet centre, +x = forward (the art faces right) and +y = up.
 * VFX, projectiles' visuals and the sword attach to these, never to pixel coordinates or frame numbers.
 */
export const ANCHOR_IDS = ['feet', 'head', 'hand_r', 'weapon_grip', 'weapon_tip', 'vfx_origin', 'projectile_origin', 'interaction'] as const;
export type AnchorId = (typeof ANCHOR_IDS)[number];

/** Phase of an attack (or any timed action) as the SIMULATION sees it; the animation derives the frame from it. */
export type AnimPhase = 'none' | 'startup' | 'active' | 'recovery';

/**
 * If a sprite set lacks the clip for a state, try these (in order) before giving up. The chain always ends in
 * `idle`, so a set with a single clip still animates without errors.
 */
export const ANIM_FALLBACKS: Readonly<Record<AnimState, readonly AnimState[]>> = {
  idle: [],
  walk: ['run', 'move', 'idle'],
  run: ['walk', 'move', 'idle'],
  move: ['run', 'walk', 'idle'],
  jump: ['fall', 'idle'],
  fall: ['jump', 'idle'],
  land: ['idle'],
  crouch: ['idle'],
  crouchWalk: ['crouch', 'walk', 'idle'],
  attack: ['attack1', 'idle'],
  attack1: ['attack', 'idle'],
  attack2: ['attack', 'attack1', 'idle'],
  attackAir: ['attack', 'attack1', 'idle'],
  attackCrouch: ['attack', 'attack1', 'idle'],
  special: ['attack2', 'attack', 'attack1', 'idle'],
  cast: ['special', 'attack2', 'attack', 'attack1', 'idle'],
  dash: ['run', 'move', 'idle'],
  hurt: ['idle'],
  death: ['hurt', 'idle'],
  drink: ['interact', 'idle'],
  interact: ['idle'],
  telegraph: ['special', 'attack', 'idle'],
  phaseTransition: ['special', 'hurt', 'idle'],
};

/** States that play once and hold their last frame; everything else loops. Overridable per clip. */
export const ONE_SHOT_STATES: ReadonlySet<AnimState> = new Set<AnimState>([
  'jump', 'land', 'attack', 'attack1', 'attack2', 'attackAir', 'attackCrouch', 'special', 'cast',
  'dash', 'hurt', 'death', 'drink', 'interact', 'telegraph', 'phaseTransition',
]);
