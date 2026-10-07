import { Rectangle, Texture, type TextureSource } from 'pixi.js';
import type { AtlasFrameJson } from '@/presentation/artAtlas';
import type { BuiltPlaceholder } from '@/presentation/placeholder';
import type { AtlasMeta } from '@/presentation/SpriteSetDefinition';
import { drawPlaceholderAtlas } from './placeholderAtlas';
import type { LoadedSpriteSet, SpriteSetLoader } from './SpriteAssetManager';

export type { AtlasFrameJson, AtlasRect } from '@/presentation/artAtlas';

/** One texture per frame, all sharing the atlas' GPU source. Honours trimming: pivots stay relative to the ORIGINAL frame. */
export function texturesFromFrames(source: TextureSource, frames: Readonly<Record<string, AtlasFrameJson>>): Map<string, Texture> {
  const out = new Map<string, Texture>();
  for (const [name, f] of Object.entries(frames)) {
    const frame = new Rectangle(f.frame.x, f.frame.y, f.frame.w, f.frame.h);
    const orig = f.sourceSize ? new Rectangle(0, 0, f.sourceSize.w, f.sourceSize.h) : undefined;
    const trim = f.trimmed && f.spriteSourceSize ? new Rectangle(f.spriteSourceSize.x, f.spriteSourceSize.y, f.spriteSourceSize.w, f.spriteSourceSize.h) : undefined;
    out.set(name, new Texture({ source, frame, ...(orig ? { orig } : {}), ...(trim ? { trim } : {}) }));
  }
  return out;
}

export interface PixiSpriteLoaderOptions {
  /** Generators for `procedural:<id>` atlases (placeholders). */
  procedural: Readonly<Record<string, BuiltPlaceholder>>;
}

/**
 * Turns a `SpriteSetDefinition` of the PLACEHOLDER kind into Pixi textures: its atlas is `procedural:<id>`, a figure drawn at start-up with a canvas
 * (no files, no art dependency). It is the only loader the game's first frame needs, which is why it is the only one in the cold start.
 *
 * Sets drawn from FILES (packs of real art) never come through here: they are fetched, validated and turned into textures by the art library
 * (`assets/artLibrary.ts`, a chunk of its own that a page without art never downloads — docs/ART-PIPELINE-2D.md part C).
 */
export function createPixiSpriteLoader(options: PixiSpriteLoaderOptions): SpriteSetLoader<Texture> {
  return async (def) => {
    if (!def.atlas.startsWith('procedural:')) {
      throw new Error(`sprite set "${def.id}": "${def.atlas}" is not a procedural atlas — sets drawn from files are loaded by the art library (docs/ART-PIPELINE-2D.md)`);
    }
    const id = def.atlas.slice('procedural:'.length);
    const built = options.procedural[id];
    if (!built) throw new Error(`sprite set "${def.id}": no procedural atlas "${id}"`);
    const atlas = Texture.from(drawPlaceholderAtlas(built));
    const frames: Record<string, AtlasFrameJson> = {};
    for (const f of built.frames) frames[f.name] = { frame: { x: f.x, y: f.y, w: f.w, h: f.h } };
    return fromSource(atlas, frames, built.meta);
  };
}

/** Wraps an atlas image and its frames as a loaded set: the textures share ONE source, and disposing frees both. */
export function fromSource(atlas: Texture, frames: Record<string, AtlasFrameJson>, meta: AtlasMeta): Omit<LoadedSpriteSet<Texture>, 'def'> {
  const textures = texturesFromFrames(atlas.source, frames);
  return {
    meta,
    textures,
    dispose: () => {
      for (const t of textures.values()) t.destroy(false);
      atlas.destroy(true);
    },
  };
}
