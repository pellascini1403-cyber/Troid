import type { Rect } from '@/core/math';
import type { SpriteSetDefinition } from './SpriteSetDefinition';

/**
 * WHERE A PICTURE SITS (docs/ART-PIPELINE-2D.md, parts D and G): the rectangle of a frame in metres — from the feet, or in the world — as ONE set of pure functions,
 * so that the number the game exposes, the one the lab draws and the one the checker computes are the same.
 *
 * The picture is something the player SEES. It is deliberately not any of the other four boxes of the hero (§A.7): the collision body moves it through the world,
 * the hurtbox is where it can be hurt, the hitbox is what its blow reaches, and none of them is read from here — nothing of the simulation imports this module
 * (`architecture.test.ts` enforces it). A picture that is larger than the body, smaller, or wider in one frame than in the next changes how the hero looks and
 * not one thing about how it plays.
 */

/** A rectangle in METRES, +y UP. From the feet (as drawn facing right), or in the world, depending on the function that gave it. */
export type MetreRect = Rect;

/** What drawing a picture of `w × h` art pixels does to the world: the metres each pixel covers, with the visual scale, about the feet pivot. */
export function metresPerArtPixel(def: Pick<SpriteSetDefinition, 'artPxPerMeter' | 'visualScale'>): number {
  return (def.visualScale ?? 1) / def.artPxPerMeter;
}

/** The whole (untrimmed) canvas of a frame, in metres from the feet: the rectangle the pivot is a fraction of. */
export function canvasRect(def: Pick<SpriteSetDefinition, 'pivot' | 'artPxPerMeter' | 'visualScale'>, width: number, height: number): MetreRect {
  const m = metresPerArtPixel(def);
  return { x0: -def.pivot[0] * width * m, x1: (1 - def.pivot[0]) * width * m, y0: -(1 - def.pivot[1]) * height * m, y1: def.pivot[1] * height * m };
}

/** The part of the canvas that was kept when the frame was trimmed (`trim`: where those pixels sit in the original), in metres from the feet. Without a trim, the canvas. */
export function visibleRect(def: Pick<SpriteSetDefinition, 'pivot' | 'artPxPerMeter' | 'visualScale'>, orig: { width: number; height: number }, trim: { x: number; y: number; width: number; height: number } | null): MetreRect {
  const canvas = canvasRect(def, orig.width, orig.height);
  if (!trim) return canvas;
  const m = metresPerArtPixel(def);
  const x0 = canvas.x0 + trim.x * m;
  const y1 = canvas.y1 - trim.y * m;
  return { x0, x1: x0 + trim.width * m, y1, y0: y1 - trim.height * m };
}

/**
 * A rectangle from the feet, as drawn facing right, put in the WORLD: the feet at `(x, y)`, the picture mirrored when the actor faces left (`facing < 0`) — the
 * same mirror the sprite itself gets, so that the rectangle and the pixels agree.
 */
export function worldRect(local: MetreRect, x: number, y: number, facing: number, out: MetreRect = { x0: 0, y0: 0, x1: 0, y1: 0 }): MetreRect {
  const left = facing < 0;
  out.x0 = x + (left ? -local.x1 : local.x0);
  out.x1 = x + (left ? -local.x0 : local.x1);
  out.y0 = y + local.y0;
  out.y1 = y + local.y1;
  return out;
}

export const rectWidth = (r: MetreRect): number => r.x1 - r.x0;
export const rectHeight = (r: MetreRect): number => r.y1 - r.y0;
