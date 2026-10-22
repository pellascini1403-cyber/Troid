import type { SoundRecipe, TrackRecipe } from '../catalog';
import { COMBAT_SOUNDS } from './combat';
import { ENEMY_SOUNDS } from './enemies';
import { HERO_SOUNDS } from './hero';
import { MAGIC_SOUNDS } from './magic';
import { UI_SOUNDS } from './ui';
import { WORLD_SOUNDS } from './world';

/** Every sound effect of the game, in one list (the music is `TRACKS`). */
export const SOUNDS: readonly SoundRecipe[] = [...HERO_SOUNDS, ...COMBAT_SOUNDS, ...MAGIC_SOUNDS, ...WORLD_SOUNDS, ...ENEMY_SOUNDS, ...UI_SOUNDS];

/** Every piece of music of the game. */
export const TRACKS: readonly TrackRecipe[] = [];
