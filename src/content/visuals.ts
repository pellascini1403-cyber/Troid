import type { AnimState } from '@/presentation/vocabulary';

/**
 * How the protagonist is DRAWN, as data (docs/ART-PIPELINE-2D.md, parts D and E). The placeholder is always there (`PLAYER.spriteSetId`); the real art, when
 * the art library has it, is the sprite set `art.sprite` of the pack `art.pack`. Nothing here is gameplay: changing it changes what is drawn, never what
 * happens.
 */
export const PLAYER_VISUAL = {
  /** Where the protagonist's real art is declared (`art/index.json` lists the pack; its manifest declares the sprite set). */
  art: { pack: 'player', sprite: 'hero' },
  /**
   * The clips the real art has to provide for the protagonist to be drawn entirely with it: idle, walk, jump, fall, dash, the two ground blows, the air blow,
   * crouch, the crouch blow, hurt, death, the cast, the drink and the interaction. What it lacks, the placeholder draws (in `auto`).
   */
  /**
   * The six to validate FIRST when the art starts to arrive — standing, walking, the first blow, the dash, the jump and being hurt — because they are where a
   * wrong scale, a pivot off the feet or a sword out of the hand show at once. They are among the fifteen: nothing here asks for more.
   */
  first: ['idle', 'walk', 'attack1', 'dash', 'jump', 'hurt'] as readonly AnimState[],
  required: ['idle', 'walk', 'jump', 'fall', 'dash', 'attack1', 'attack2', 'attackAir', 'crouch', 'attackCrouch', 'hurt', 'death', 'cast', 'drink', 'interact'] as readonly AnimState[],
} as const;
