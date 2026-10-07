import type { BuiltPlaceholder } from '@/presentation/placeholder';
import type { SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { PLAYER_PLACEHOLDER } from './placeholders/playerPlaceholder';

/**
 * Sprite sets of the PLACEHOLDER: abstract figures drawn at start-up with a canvas (`atlas: 'procedural:<id>'`). Real art is not declared here: it comes from
 * packs under `art/` (a manifest with the scale, the pivot, the clips and the anchors), packed by `npm run assets:pack` and loaded after the first frame by the
 * art library (`assets/artLibrary.ts`) — gameplay is unchanged either way (docs/ART-PIPELINE-2D.md, docs/ARCHITECTURE-2D.md §7.5).
 */
export const SPRITE_SETS: Readonly<Record<string, SpriteSetDefinition>> = {
  [PLAYER_PLACEHOLDER.def.id]: PLAYER_PLACEHOLDER.def,
};

/** Procedural atlases (the `procedural:<id>` kind): drawn at start-up, no files. */
export const PROCEDURAL_ATLASES: Readonly<Record<string, BuiltPlaceholder>> = {
  [PLAYER_PLACEHOLDER.def.id]: PLAYER_PLACEHOLDER,
};

export { PLAYER_PLACEHOLDER };
