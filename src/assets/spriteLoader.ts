import { Assets, Rectangle, Texture, type TextureSource } from 'pixi.js';
import type { BuiltPlaceholder } from '@/presentation/placeholder';
import type { AtlasMeta } from '@/presentation/SpriteSetDefinition';
import { drawPlaceholderAtlas } from './placeholderAtlas';
import type { LoadedSpriteSet, SpriteSetLoader } from './SpriteAssetManager';

/** A rectangle inside an atlas image, in pixels. */
export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One frame of an atlas JSON in the TexturePacker "hash" layout (what every common packer exports). */
export interface AtlasFrameJson {
  frame: AtlasRect;
  /** Where the trimmed pixels sit inside the original (untrimmed) frame. */
  spriteSourceSize?: AtlasRect;
  /** Size of the original (untrimmed) frame. */
  sourceSize?: { w: number; h: number };
  trimmed?: boolean;
}

/**
 * Atlas file contract (`public/<atlas>.json` next to its image): `frames` as the packers export them, plus
 * `meta.image` (file name of the image) and the engine's own `meta.troid` (per-frame anchors and height).
 */
export interface AtlasJson {
  frames: Record<string, AtlasFrameJson>;
  meta?: { image?: string; troid?: AtlasMeta };
}

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
  /** URL prefix of file-based atlases (the app's base URL). */
  base?: string;
  /** Generators for `procedural:<id>` atlases (placeholders). */
  procedural: Readonly<Record<string, BuiltPlaceholder>>;
}

/**
 * Turns a `SpriteSetDefinition` into Pixi textures. Two kinds of atlas, selected by `def.atlas`:
 *  - `procedural:<id>` — a placeholder drawn at start-up with a canvas (no files, no art dependency);
 *  - anything else — a file-based atlas: `<base><atlas>.json` (+ its image), the path final art will use.
 */
export function createPixiSpriteLoader(options: PixiSpriteLoaderOptions): SpriteSetLoader<Texture> {
  const base = options.base ?? import.meta.env.BASE_URL ?? '/';
  return async (def) => {
    if (def.atlas.startsWith('procedural:')) {
      const id = def.atlas.slice('procedural:'.length);
      const built = options.procedural[id];
      if (!built) throw new Error(`sprite set "${def.id}": no procedural atlas "${id}"`);
      const atlas = Texture.from(drawPlaceholderAtlas(built));
      const frames: Record<string, AtlasFrameJson> = {};
      for (const f of built.frames) frames[f.name] = { frame: { x: f.x, y: f.y, w: f.w, h: f.h } };
      return fromSource(atlas, frames, built.meta);
    }
    const jsonUrl = `${base}${def.atlas}.json`;
    const response = await fetch(jsonUrl);
    if (!response.ok) throw new Error(`sprite set "${def.id}": ${jsonUrl} → HTTP ${response.status}`);
    const json = (await response.json()) as AtlasJson;
    const imageUrl = new URL(json.meta?.image ?? `${def.atlas.split('/').pop()}.png`, new URL(jsonUrl, location.href)).href;
    const atlas = await Assets.load<Texture>(imageUrl);
    return fromSource(atlas, json.frames, json.meta?.troid ?? { frames: {} });
  };
}

function fromSource(atlas: Texture, frames: Record<string, AtlasFrameJson>, meta: AtlasMeta): Omit<LoadedSpriteSet<Texture>, 'def'> {
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
