import type { ArtCategory, ArtIssue } from '../../src/presentation/artManifest';
import { opaqueBounds } from './pack';
import type { PngInfo, RgbaImage } from './png';

/**
 * WHAT A PICTURE SAYS ABOUT ITSELF (docs/ART-PIPELINE-2D.md, part E): the checks of a frame or an atlas page that no manifest can make — is there transparency at
 * all, is it all opaque, is it empty, does the art touch the edge of its canvas. They are questions about PIXELS and they only ever LOOK: nothing here changes
 * a pixel, and every answer is a message for a person ("was the background removed?"), never a correction.
 *
 * A character, an enemy, an effect and an interface piece are drawn over the world: without transparency they are a rectangle. Scenery may be opaque (a tile),
 * so for it the same facts are only notes.
 */
export interface PictureFacts {
  /** The file has an alpha channel (or a `tRNS` chunk). */
  hasAlphaChannel: boolean;
  /** Pixels with some alpha / every pixel is fully opaque / nothing at all is visible. */
  visiblePixels: number;
  allOpaque: boolean;
  empty: boolean;
  /** Which edges of the canvas the visible pixels touch. */
  touches: { left: boolean; right: boolean; top: boolean; bottom: boolean };
}

export function inspectPicture(img: RgbaImage, info: Pick<PngInfo, 'hasAlpha'>): PictureFacts {
  let visible = 0;
  let opaque = 0;
  const touches = { left: false, right: false, top: false, bottom: false };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const a = img.data[(y * img.width + x) * 4 + 3]!;
      if (a === 0) continue;
      visible++;
      if (a === 255) opaque++;
      if (x === 0) touches.left = true;
      if (x === img.width - 1) touches.right = true;
      if (y === 0) touches.top = true;
      if (y === img.height - 1) touches.bottom = true;
    }
  }
  return { hasAlphaChannel: info.hasAlpha, visiblePixels: visible, allOpaque: visible === img.width * img.height, empty: visible === 0, touches };
}

/** Categories drawn OVER the world: they must have a transparent background. */
const NEEDS_ALPHA: ReadonlySet<ArtCategory> = new Set<ArtCategory>(['player', 'enemies', 'vfx', 'ui']);

/**
 * What to say about one FRAME of a sprite set (`label` is where it is: `hero/idle_03.png`). `pivotY` is the feet pivot as a fraction of the canvas: art that
 * stands on the bottom edge of its canvas (pivot near 1) touches it by design, so that edge is not reported then. An atlas PAGE (`edges: false`) is packed
 * right up to its borders by design: only what it says about transparency is of interest.
 */
export function pictureIssues(label: string, facts: PictureFacts, category: ArtCategory, pivotY: number, options: { edges?: boolean } = {}): ArtIssue[] {
  const out: ArtIssue[] = [];
  const over = NEEDS_ALPHA.has(category);
  if (!facts.hasAlphaChannel) {
    out.push({
      level: over ? 'error' : 'info',
      path: label,
      message: over
        ? 'has no alpha channel (it is an RGB picture): what is drawn over the world needs a transparent background — as it is, the whole canvas would be drawn as a rectangle. Export it as RGBA'
        : 'has no alpha channel: fine for scenery that fills its canvas',
    });
  } else if (facts.allOpaque && over) {
    out.push({ level: 'warn', path: label, message: 'every pixel is opaque: was the background removed? (a character, an enemy or an effect drawn over the world would be a rectangle)' });
  }
  if (facts.empty) out.push({ level: 'warn', path: label, message: 'is fully transparent: a blink between two poses may be meant, an empty frame by mistake is not' });
  else if (over && (options.edges ?? true) && facts.hasAlphaChannel && !facts.allOpaque) {
    const sides = (['left', 'right', 'top'] as const).filter((s) => facts.touches[s]);
    if (pivotY < 0.9 && facts.touches.bottom) sides.push('bottom' as never);
    if (sides.length > 0) out.push({ level: 'warn', path: label, message: `its pixels touch the ${sides.join(' and ')} edge of the canvas: the art may be cut off there (leave a margin)` });
  }
  return out;
}

export { opaqueBounds };
