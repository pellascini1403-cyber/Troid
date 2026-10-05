import type { BuiltPlaceholder } from '@/presentation/placeholder';
import type { SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { PLAYER_PLACEHOLDER } from './placeholders/playerPlaceholder';

/**
 * Sprite sets: the only place that knows atlas ids and frame names. To use final art, add a definition that points
 * at the artist's atlas (`atlas: 'sprites/hero'` → `public/sprites/hero.json` + `.png`) and keep the logical `clips`
 * keys: gameplay is unchanged (docs/ARCHITECTURE-2D.md §7.5).
 */
export const SPRITE_SETS: Readonly<Record<string, SpriteSetDefinition>> = {
  [PLAYER_PLACEHOLDER.def.id]: PLAYER_PLACEHOLDER.def,
};

/** Procedural atlases (the `procedural:<id>` kind): drawn at start-up, no files. */
export const PROCEDURAL_ATLASES: Readonly<Record<string, BuiltPlaceholder>> = {
  [PLAYER_PLACEHOLDER.def.id]: PLAYER_PLACEHOLDER,
};

export { PLAYER_PLACEHOLDER };
