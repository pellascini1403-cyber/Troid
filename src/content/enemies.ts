import './beyond';

/**
 * EVERY enemy and every guardian of the world, by id — what the tests and the tools read (docs/PROMPT21-LOG.md). The game itself starts with the part of them the first four rooms need (`content/core.ts`: the Ink Slime and the Ink Warden)
 * and has the rest added when `content/beyond.ts` arrives; importing this module is importing the whole of it, with the code that runs them (the brains of the creatures, the boss engine) taught on the way in.
 */
export { INK_SLIME, SLIME_LUNGE } from './inkSlime';
export { INK_WARDEN, WARDEN_CHARGE, WARDEN_RAIN } from './warden';
export { BOSSES, ENEMIES } from './core';
