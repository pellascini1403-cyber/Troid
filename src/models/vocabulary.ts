/**
 * Logical vocabulary shared by the simulation (which *requests* things) and the asset pipeline
 * (which maps them to whatever the current model happens to contain).
 *
 * Gameplay only ever speaks in these ids. Clip names, node names and file paths live in a
 * `ModelDefinition` and can change freely when the final art arrives.
 */

/** Logical animation states. A model does not need all of them: missing ones fall back (see `ANIM_FALLBACKS`). */
export const ANIM_STATES = [
  'idle', 'walk', 'run', 'move',
  'jump', 'fall', 'land',
  'attack', 'attack1', 'attack2', 'attackAir', 'special',
  'dash', 'hurt', 'death', 'phaseTransition',
] as const;
export type AnimState = (typeof ANIM_STATES)[number];

/** Anchor points on a model. Gameplay VFX / weapons / projectiles attach here, never to a bone by name. */
export const SOCKET_IDS = [
  'weapon_r', 'weapon_l', 'shield', 'projectile_origin',
  'vfx_feet', 'vfx_hand_r', 'vfx_hand_l', 'vfx_center',
  'interaction', 'head', 'back',
] as const;
export type SocketId = (typeof SOCKET_IDS)[number];

/** Convention for sockets inside a glTF: an empty node named `SOCKET_<id>` parented to the right bone. */
export const SOCKET_NODE_PREFIX = 'SOCKET_';

/**
 * If a model lacks the clip for a state, try these (in order) before giving up.
 * The chain always ends in `idle`, so a model with a single clip still animates without errors.
 */
export const ANIM_FALLBACKS: Readonly<Record<AnimState, readonly AnimState[]>> = {
  idle: [],
  walk: ['run', 'move', 'idle'],
  run: ['walk', 'move', 'idle'],
  move: ['run', 'walk', 'idle'],
  jump: ['fall', 'idle'],
  fall: ['jump', 'idle'],
  land: ['idle'],
  attack: ['attack1', 'idle'],
  attack1: ['attack', 'idle'],
  attack2: ['attack', 'attack1', 'idle'],
  attackAir: ['attack', 'attack1', 'idle'],
  special: ['attack2', 'attack', 'attack1', 'idle'],
  dash: ['run', 'move', 'idle'],
  hurt: ['idle'],
  death: ['hurt', 'idle'],
  phaseTransition: ['special', 'hurt', 'idle'],
};

/** States that play once and hold their last pose; everything else loops. Overridable per clip. */
export const ONE_SHOT_STATES: ReadonlySet<AnimState> = new Set<AnimState>([
  'jump', 'land', 'attack', 'attack1', 'attack2', 'attackAir', 'special', 'dash', 'hurt', 'death', 'phaseTransition',
]);

/** Default cross-fade (seconds) when entering a state. Quick for combat, softer for locomotion. */
export const DEFAULT_FADE: Readonly<Partial<Record<AnimState, number>>> = {
  idle: 0.12, walk: 0.1, run: 0.08, move: 0.1, fall: 0.1, land: 0.05,
  jump: 0.04, attack: 0.03, attack1: 0.03, attack2: 0.03, attackAir: 0.03, special: 0.05,
  dash: 0.02, hurt: 0.02, death: 0.05, phaseTransition: 0.05,
};
