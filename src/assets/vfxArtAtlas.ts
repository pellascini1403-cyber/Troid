import type { Texture } from 'pixi.js';
import type { VfxShape } from '@/presentation/vfx';
import { clipFrameNames, type SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { hasEveryShape, vfxParts, VFX_SHAPE_NAMES, type VfxSequenceName } from '@/presentation/vfxArt';
import type { ArtLibrary } from './artLibrary';
import type { VfxAtlas, VfxSequence } from './vfxAtlas';

/**
 * THE LIGHT THE ART PAINTED, as the effects take it (docs/PROMPT8-LOG.md, phase H; docs/ART-PIPELINE-2D.md §M.14): the packs of the `vfx` category the library holds are turned into the atlas the effects draw from.
 * It is made ON TOP of the game's own atlas (`createVfxAtlas`) and never instead of it:
 *
 *  - the SHAPES of the art replace the game's only when it has all ten and they are all on ONE page (the particle container of the effects draws from one texture source) — otherwise the game keeps drawing its own;
 *  - the SEQUENCES are added: each one whose frames are all there. An effect bound to one the atlas does not have is not played (the others bound beside it are what is seen).
 *
 * Nothing here can fail the game: a pack that did not load, a frame that is missing, a page that is not whole — each leaves the game's own atlas as it was, and the answer is `null` when the art gave nothing at all.
 * Only the library's own sets are taken (and given back by `dispose`): the textures belong to the library, which frees a page with the last of its sets. PURE of Pixi's classes: it only reads the textures.
 */
export type VfxArtLibrary = Pick<ArtLibrary<unknown, Texture>, 'heldPacks' | 'acquireLoaded' | 'release'>;

export interface ArtVfx {
  /** The atlas the effects draw from: the art's shapes (when they are whole) and sequences over the game's own. */
  readonly atlas: VfxAtlas;
  /** Whether the shapes of the art are the ones in use. */
  readonly shapes: boolean;
  /** The sequences the art gave. */
  readonly sequences: readonly VfxSequenceName[];
  /** Gives the sets back to the library. */
  dispose(): void;
}

/** The textures of the `idle` clip of a loaded set, in order; `null` when the clip is not there or a frame is missing (a picture with a hole in it is not drawn). */
function idleFrames(set: { def: SpriteSetDefinition; textures: ReadonlyMap<string, Texture> }): Texture[] | null {
  const idle = set.def.clips['idle'];
  if (!idle) return null;
  const frames: Texture[] = [];
  for (const name of clipFrameNames(idle)) {
    const t = set.textures.get(name);
    if (t) frames.push(t);
  }
  return frames.length === idle.count && frames.length > 0 ? frames : null;
}

export function createArtVfxAtlas(art: VfxArtLibrary, base: VfxAtlas): ArtVfx | null {
  const taken: Array<Pick<SpriteSetDefinition, 'id'>> = [];
  const shapeFrames = new Map<VfxShape, Texture>();
  const sequences: Partial<Record<VfxSequenceName, VfxSequence>> = {};

  for (const info of art.heldPacks('vfx')) {
    const parts = vfxParts(info.pack.sprites);
    for (const [name, spriteId] of parts.shapes) {
      if (shapeFrames.has(name)) continue;
      const set = art.acquireLoaded(info.pack.id, spriteId);
      if (!set) continue;
      taken.push(set.def);
      const frames = idleFrames(set);
      if (frames) shapeFrames.set(name, frames[0]!);
    }
    for (const [name, spriteId] of parts.sequences) {
      if (sequences[name]) continue;
      const set = art.acquireLoaded(info.pack.id, spriteId);
      if (!set) continue;
      taken.push(set.def);
      const frames = idleFrames(set);
      if (!frames) continue;
      const first = frames[0]!;
      // every frame of a sequence is of one original size (the check of the pack says so); the first one tells it
      sequences[name] = { frames, width: first.orig.width, height: first.orig.height, pivot: [set.def.pivot[0], set.def.pivot[1]] };
    }
  }

  // the shapes: the art's only when all ten are there and they share one page
  const whole =
    hasEveryShape(new Map([...shapeFrames.keys()].map((k) => [k, k]))) &&
    new Set(VFX_SHAPE_NAMES.map((n) => shapeFrames.get(n)!.source)).size === 1;
  const names = Object.keys(sequences) as VfxSequenceName[];
  const giveBack = (): void => {
    for (const def of taken.splice(0)) art.release(def);
  };
  if (!whole && names.length === 0) {
    giveBack();
    return null;
  }

  const frames = {} as Record<VfxShape, Texture>;
  const widthPx = {} as Record<VfxShape, number>;
  const heightPx = {} as Record<VfxShape, number>;
  for (const n of VFX_SHAPE_NAMES) {
    const t = whole ? shapeFrames.get(n)! : base.frames[n];
    frames[n] = t;
    widthPx[n] = whole ? t.orig.width : base.widthPx[n];
    heightPx[n] = whole ? t.orig.height : base.heightPx[n];
  }
  const atlas: VfxAtlas = {
    frames,
    widthPx,
    heightPx,
    sequences,
    origin: whole ? 'art' : base.origin,
    source: whole ? frames.glow : base.source,
    // the textures are the library's (and the base's own): this gives back what was taken and nothing else
    destroy: giveBack,
  };
  return { atlas, shapes: whole, sequences: names, dispose: giveBack };
}
