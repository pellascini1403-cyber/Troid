import './beyond';

/**
 * The game's concrete data, WHOLE: the first four rooms and what the rest of the world adds to them (docs/PROMPT21-LOG.md). Only `app/` (and tests / tools) import this; the simulation receives it injected. The game's first frame does not
 * import it — it imports `content/core.ts`, and asks for `content/beyond.ts` once it is up — but every other consumer (the pause menu, the tests, the tools) wants the world whole, and here it is.
 */
export { ABILITIES, BOSSES, ENEMIES, PLAYER, PROCEDURAL_ATLASES, PROCEDURAL_LOOKS, ROOMS, SPRITE_SETS, START, UPGRADES, WORLD } from './core';
