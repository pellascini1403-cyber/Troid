import { decodePng as decode, type RgbaImage } from '../assets/png';

/**
 * What the E2E needs to look at the PIXELS of what the player sees — "is there violet on screen while the slime winds up?" — without a dependency. The
 * decoding itself is the art pipeline's (`tools/assets/png.ts`: every PNG a screenshot or an artist can produce); only the checksums are not verified here,
 * a screenshot is read straight from the browser's own memory.
 */
export type Image = RgbaImage;

export function decodePng(buf: Uint8Array): Image {
  return decode(buf, { verifyCrc: false });
}

export type PixelTest = (r: number, g: number, b: number, a: number) => boolean;

/** How many pixels of the image (or of a sub-rectangle) satisfy the test. */
export function countPixels(img: Image, test: PixelTest, region?: { x0: number; y0: number; x1: number; y1: number }): number {
  const x0 = Math.max(0, region?.x0 ?? 0);
  const y0 = Math.max(0, region?.y0 ?? 0);
  const x1 = Math.min(img.width, region?.x1 ?? img.width);
  const y1 = Math.min(img.height, region?.y1 ?? img.height);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * img.width + x) * 4;
      if (test(img.data[o]!, img.data[o + 1]!, img.data[o + 2]!, img.data[o + 3]!)) n++;
    }
  }
  return n;
}

/**
 * Violet LIGHT, as the enemy palette makes it (docs/GAME-SPEC-2D.md §3.4) — a hue test, not a colour match, because
 * additive light over a dark scene scales every channel: blue clearly above green, red above green, and bright enough
 * not to be the creature's own dark violet rim (58, 31, 122). Grey scenery, the hero's cyan and the enemy's white eyes
 * are all outside it.
 */
export const isVioletLight: PixelTest = (r, g, b) => b >= 120 && r >= 70 && b - g >= 40 && r - g >= 8 && r < 235;

/**
 * Bright cyan / white-hot LIGHT, the hero's energy (docs/GAME-SPEC-2D.md §3.2): blue and green both high, red a step lower
 * (cyan) or all of them very high (the white core). The dark scene, the grey scenery and violet light are outside it.
 */
export const isCyanLight: PixelTest = (r, g, b) => b >= 190 && g >= 180 && (b - r >= 18 || (r >= 235 && g >= 235));
