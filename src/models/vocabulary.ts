/**
 * LEGACY 3D vocabulary (removed together with Three.js in S4). The animation vocabulary now lives in
 * `presentation/vocabulary.ts` and is re-exported here so the 3D prototype keeps compiling meanwhile;
 * only the glTF socket ids and cross-fade times remain specific to this file.
 */
import type { AnimState } from '@/presentation/vocabulary';

export { ANIM_STATES, ANIM_FALLBACKS, ONE_SHOT_STATES } from '@/presentation/vocabulary';
export type { AnimState } from '@/presentation/vocabulary';

/** Anchor points on a 3D model. Gameplay VFX / weapons / projectiles attach here, never to a bone by name. */
export const SOCKET_IDS = [
  'weapon_r', 'weapon_l', 'shield', 'projectile_origin',
  'vfx_feet', 'vfx_hand_r', 'vfx_hand_l', 'vfx_center',
  'interaction', 'head', 'back',
] as const;
export type SocketId = (typeof SOCKET_IDS)[number];

/** Convention for sockets inside a glTF: an empty node named `SOCKET_<id>` parented to the right bone. */
export const SOCKET_NODE_PREFIX = 'SOCKET_';

/** Default cross-fade (seconds) when entering a state. Quick for combat, softer for locomotion. */
export const DEFAULT_FADE: Readonly<Partial<Record<AnimState, number>>> = {
  idle: 0.12, walk: 0.1, run: 0.08, move: 0.1, fall: 0.1, land: 0.05,
  jump: 0.04, attack: 0.03, attack1: 0.03, attack2: 0.03, attackAir: 0.03, special: 0.05,
  dash: 0.02, hurt: 0.02, death: 0.05, phaseTransition: 0.05,
};
