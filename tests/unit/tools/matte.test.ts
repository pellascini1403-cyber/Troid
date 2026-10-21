import { describe, expect, it } from 'vitest';
import { compositeError, extractFigure, MATTE_DEFAULTS } from '../../../tools/assets/matte';
import type { RgbaImage } from '../../../tools/assets/png';

/**
 * THE FIGURE OF A DRAWING ON WHITE (tools/assets/matte.ts, docs/PROMPT16-LOG.md): the way the background is taken off the poses of the character sheet. Tested on a sheet made for it — a black body with a soft edge,
 * a scarf of translucent blue fire whose tips fade into the white, an eye with white highlights inside a cyan ring, a loop of antenna that closes round a gap of white, an ember apart from the rest, and the
 * noise of a generated background — so what is asserted is the rule and not a drawing: put back over the white it was drawn on, the figure IS the sheet; its inside is the sheet's own pixels; nothing of it is lost for being
 * pale or far; and nothing of the white is left in it.
 */
const W = 100;
const H = 80;
const BODY: readonly [number, number, number] = [10, 12, 14];
const FIRE: readonly [number, number, number] = [60, 170, 235];
const RING: readonly [number, number, number] = [80, 205, 240];

/** The sheet: opaque, white with ±1 noise, the figure drawn over it with anti-aliased edges. */
function sheet(): RgbaImage {
  const data = new Uint8Array(W * H * 4);
  const at = (x: number, y: number): number => (y * W + x) * 4;
  const mix = (x: number, y: number, rgb: readonly [number, number, number], a: number): void => {
    const o = at(x, y);
    for (let c = 0; c < 3; c++) data[o + c] = Math.round(rgb[c]! * a + data[o + c]! * (1 - a));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([255 - ((x * 7 + y * 13) % 3 === 0 ? 1 : 0), 255 - ((x + y) % 5 === 0 ? 1 : 0), 255, 255], at(x, y));
  // coverage of a shape by 4 × 4 sub-samples: a soft edge, as an artist's brush leaves it
  const cover = (x: number, y: number, inside: (px: number, py: number) => boolean): number => {
    let n = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (inside(x + (i + 0.5) / 4, y + (j + 0.5) / 4)) n++;
    return n / 16;
  };
  const disc = (cx: number, cy: number, r: number) => (px: number, py: number): boolean => Math.hypot(px - cx, py - cy) <= r;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // the body: a black disc
      const a = cover(x, y, disc(30, 46, 18));
      if (a > 0) mix(x, y, BODY, a);
    }
  }
  // the scarf: an ellipse of blue fire whose opacity falls from 1 in the middle to 0.14 at the rim (over white that is a pale cyan: the tip)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = Math.hypot((x + 0.5 - 72) / 20, (y + 0.5 - 46) / 9);
      if (k >= 1) continue;
      mix(x, y, FIRE, Math.max(0.14, 1 - k * 0.9));
    }
  }
  // the eye: a cyan ring on the body with a white highlight inside it (the highlight is the colour of the background)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - 30, y + 0.5 - 46);
      if (d <= 8 && d > 3.5) mix(x, y, RING, 1);
      else if (d <= 3.5) data.set([255, 255, 255, 255], at(x, y));
    }
  }
  // the loop of an antenna: a closed ring of dark pixels that holds a gap of white (not the figure)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - 30, y + 0.5 - 14);
      if (d <= 7 && d > 5) mix(x, y, BODY, 1);
    }
  }
  // an ember, apart from everything
  for (let y = 8; y < 11; y++) for (let x = 85; x < 88; x++) mix(x, y, [150, 215, 240], 1);
  return { width: W, height: H, data };
}

const box = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
const px = (img: RgbaImage, x: number, y: number): number[] => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe('the figure of a drawing on white', () => {
  const src = sheet();
  const out = extractFigure(src, box);

  it('put back over the white it was drawn on, the figure is the sheet: not a pixel of ink differs by more than the noise of the background', () => {
    const e = compositeError(src, box, out.image, 6);
    expect(e.ink).toBeGreaterThan(1000);
    expect(e.differing, `${e.differing} of ${e.ink} pixels of ink differ by more than 6 levels`).toBe(0);
    expect(e.worst).toBeLessThanOrEqual(6);
  });

  it('keeps the sheet\'s own pixels inside the outline — exactly, opaque — and takes the white off outside it: the noise of the background is not figure', () => {
    // deep in the body, in the middle of the scarf, on the ring of the eye: the sheet's pixel, alpha 255
    for (const [x, y] of [[22, 56], [30, 62], [72, 46], [64, 44], [30, 38]] as const) {
      expect(px(out.image, x, y), `(${x}, ${y})`).toEqual([...px(src, x, y).slice(0, 3), 255]);
    }
    // far from everything: transparent, noise or not
    for (const [x, y] of [[2, 2], [97, 77], [50, 5], [5, 70], [92, 40]] as const) expect(px(out.image, x, y)[3], `(${x}, ${y})`).toBe(0);
    // and no pixel farther than the soft edge (3 px) from the ink is anything but transparent
    const near = (x: number, y: number): boolean => {
      for (let dy = -MATTE_DEFAULTS.rim - 1; dy <= MATTE_DEFAULTS.rim + 1; dy++) {
        for (let dx = -MATTE_DEFAULTS.rim - 1; dx <= MATTE_DEFAULTS.rim + 1; dx++) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          if (255 - Math.min(...px(src, sx, sy).slice(0, 3)) >= 255 * MATTE_DEFAULTS.ink) return true;
        }
      }
      return false;
    }
    let strays = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px(out.image, x, y)[3]! > 0 && !near(x, y)) strays++;
    expect(strays).toBe(0);
  });

  it('what the ink encloses is the figure — the white highlight of the eye is opaque — except a gap an outline closes round (the loop of an antenna is mostly white, ringed by dark): that is background', () => {
    expect(px(out.image, 30, 46)).toEqual([255, 255, 255, 255]);
    expect(px(out.image, 29, 47)[3]).toBe(255);
    expect(px(out.image, 30, 14)[3], 'the gap inside the antenna\'s loop').toBe(0);
    expect(px(out.image, 31, 15)[3]).toBe(0);
    // the ring itself, which is dark, is figure
    expect(px(out.image, 30, 8)[3]).toBeGreaterThan(200);
  });

  it('loses nothing for being pale or far: the fire fades to a pale tip and the tip is there (translucent, in the colour of the fire), and an ember apart from everything is there', () => {
    // the tip of the scarf over white is a pale cyan; here at the left end of the ellipse the opacity is down to about a sixth
    const tip = px(out.image, 53, 46);
    expect(tip[3], 'the pale tip is kept').toBeGreaterThan(0);
    expect(tip[3], 'and it is translucent: not made solid').toBeLessThan(160);
    expect(tip[2]!, 'cyan, not grey').toBeGreaterThan(tip[0]! + 40);
    // the ember
    const ember = px(out.image, 86, 9);
    expect(ember[3]).toBe(255);
    expect([...ember.slice(0, 3)]).toEqual([150, 215, 240]);
    expect(out.bounds!.x1).toBeGreaterThanOrEqual(87);
    // (a 3 × 3 speck has no inside of its own: it is the sheet's pixels, opaque, not a faint colour made up for it)
  });

  it('has no pale fringe: the soft edge of the black body is unmixed from the white it was drawn on, so each pixel of it is dark and only its alpha is partial', () => {
    let edge = 0;
    for (let y = 28; y < 64; y++) {
      for (let x = 10; x < 28; x++) {
        const p = px(out.image, x, y);
        if (p[3]! > 8 && p[3]! < 240 && Math.hypot(x + 0.5 - 30, y + 0.5 - 46) > 16) {
          edge++;
          expect(Math.max(p[0]!, p[1]!, p[2]!), `(${x}, ${y}) alpha ${p[3]}`).toBeLessThanOrEqual(40);
        }
      }
    }
    expect(edge, 'the disc has a soft edge to look at').toBeGreaterThan(10);
  });

  it('only ink counts: `ink` raised past the palest tip takes the tip off, and a box that holds no figure gives nothing', () => {
    const strict = extractFigure(src, box, { ink: 0.4 });
    expect(px(strict.image, 53, 46)[3]).toBe(0);
    expect(px(strict.image, 22, 56)[3]).toBe(255);
    const empty = extractFigure(src, { x0: 0, y0: 68, x1: 8, y1: 79 });
    expect(empty.bounds).toBeNull();
  });
});
