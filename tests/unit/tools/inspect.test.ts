import { describe, expect, it } from 'vitest';
import { inspectPicture, pictureIssues } from '../../../tools/assets/inspect';
import type { RgbaImage } from '../../../tools/assets/png';

/**
 * WHAT A PICTURE SAYS ABOUT ITSELF (docs/ART-PIPELINE-2D.md, part E): transparency, emptiness and the edges of the canvas. These checks only LOOK.
 */
const img = (w: number, h: number, alphaAt: (x: number, y: number) => number): RgbaImage => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = alphaAt(x, y);
  return { width: w, height: h, data };
};
const middle = (w: number, h: number): RgbaImage => img(w, h, (x, y) => (x >= 3 && x < w - 3 && y >= 3 && y < h - 3 ? 255 : 0));
const say = (facts: ReturnType<typeof inspectPicture>, category: Parameters<typeof pictureIssues>[2], pivotY = 1, opts = {}): string[] => pictureIssues('f.png', facts, category, pivotY, opts).map((i) => `${i.level}: ${i.message}`);

describe('inspectPicture', () => {
  it('counts what can be seen and says which edges of the canvas it touches', () => {
    const a = inspectPicture(middle(20, 20), { hasAlpha: true });
    expect(a).toMatchObject({ hasAlphaChannel: true, visiblePixels: 14 * 14, allOpaque: false, empty: false, touches: { left: false, right: false, top: false, bottom: false } });
    const b = inspectPicture(img(10, 10, (x, y) => (x === 0 && y === 9 ? 1 : 0)), { hasAlpha: true });
    expect(b.touches).toEqual({ left: true, right: false, top: false, bottom: true });
    expect(b.visiblePixels).toBe(1); // one pixel with alpha 1 is visible: it counts
    expect(inspectPicture(img(4, 4, () => 255), { hasAlpha: true }).allOpaque).toBe(true);
    expect(inspectPicture(img(4, 4, () => 0), { hasAlpha: true }).empty).toBe(true);
  });
});

describe('pictureIssues', () => {
  it('a clean frame (transparent, with a margin) has nothing to say', () => {
    expect(say(inspectPicture(middle(20, 20), { hasAlpha: true }), 'player')).toEqual([]);
  });

  it('no alpha channel: an ERROR for what is drawn over the world (player, enemies, vfx, ui), a note for scenery', () => {
    const rgb = inspectPicture(img(8, 8, () => 255), { hasAlpha: false });
    for (const c of ['player', 'enemies', 'vfx', 'ui'] as const) expect(say(rgb, c)[0], c).toMatch(/^error: has no alpha channel \(it is an RGB picture\)/);
    expect(say(rgb, 'environment')).toEqual(['info: has no alpha channel: fine for scenery that fills its canvas']);
  });

  it('an alpha channel that is opaque everywhere: was the background removed? (a warning for what is drawn over the world only)', () => {
    const solid = inspectPicture(img(8, 8, () => 255), { hasAlpha: true });
    expect(say(solid, 'enemies')).toEqual(['warn: every pixel is opaque: was the background removed? (a character, an enemy or an effect drawn over the world would be a rectangle)']);
    expect(say(solid, 'environment')).toEqual([]);
  });

  it('an empty frame is a warning: a blink may be meant, a mistake is not', () => {
    expect(say(inspectPicture(img(8, 8, () => 0), { hasAlpha: true }), 'player')[0]).toMatch(/^warn: is fully transparent/);
  });

  it('art that touches the left, right or top edge may be cut off; the bottom edge only matters when the feet are not at the bottom of the canvas', () => {
    const wide = inspectPicture(img(12, 12, (_x, y) => (y >= 2 && y < 11 ? 255 : 0)), { hasAlpha: true }); // touches left and right
    expect(say(wide, 'player')[0]).toMatch(/touch the left and right edge of the canvas: the art may be cut off there/);
    const standing = inspectPicture(img(12, 12, (x, y) => (x >= 3 && x < 9 && y >= 2 ? 255 : 0)), { hasAlpha: true }); // touches the bottom only
    expect(say(standing, 'player', 1)).toEqual([]);
    expect(say(standing, 'player', 0.5)[0]).toMatch(/touch the bottom edge/);
  });

  it('an atlas PAGE is packed to its borders on purpose: with `edges: false` only transparency is of interest', () => {
    const page = inspectPicture(img(12, 12, (x) => (x % 2 === 0 ? 255 : 0)), { hasAlpha: true });
    expect(say(page, 'player')[0]).toMatch(/touch the left and top edge/);
    expect(say(page, 'player', 0, { edges: false })).toEqual([]);
  });
});
