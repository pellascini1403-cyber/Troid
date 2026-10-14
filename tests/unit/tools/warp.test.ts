import { describe, expect, it } from 'vitest';
import type { RgbaImage } from '../../../tools/assets/png';
import { about, apply, compose, invert, isIdentity, renderFrame, RigidMls, toDrawing, type Pin, type Pt } from '../../../tools/assets/warp';

/**
 * THE PUPPET WARP (docs/ART-PIPELINE-2D.md part N): the one operation that makes the user's drawings move. What it promises is checked here on small pictures, so that the promise
 * does not depend on the protagonist's art being there: with no point moved it is the identity; a point asked to go somewhere goes exactly there; a rigid move of every point is
 * reproduced as a rigid move; whole-pixel moves lose and invent nothing; and the same inputs give the same pixels.
 */

/** A small picture with an opaque shape, a soft edge and a clear background: every kind of pixel the real drawings have. */
function sample(): RgbaImage {
  const w = 24;
  const h = 20;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const inside = x >= 6 && x < 17 && y >= 5 && y < 15;
      const edge = !inside && x >= 5 && x < 18 && y >= 4 && y < 16;
      if (!inside && !edge) continue;
      data[o] = 30 + x * 7;
      data[o + 1] = 60 + y * 9;
      data[o + 2] = 200 - x * 4;
      data[o + 3] = inside ? 255 : 90;
    }
  }
  return { width: w, height: h, data };
}

const frame = { width: 24, height: 20, scale: 1, origin: { x: 0, y: 0 } } as const;
const maxDiff = (a: RgbaImage, b: RgbaImage): number => {
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) worst = Math.max(worst, Math.abs(a.data[i]! - b.data[i]!));
  return worst;
};

describe('the puppet warp', () => {
  it('with no control point moved it is the identity: the frame is the drawing', () => {
    const img = sample();
    const pins: Pin[] = [
      { src: { x: 8, y: 8 }, dst: { x: 8, y: 8 } },
      { src: { x: 15, y: 12 }, dst: { x: 15, y: 12 } },
    ];
    const warp = new RigidMls(pins);
    expect(warp.identity).toBe(true);
    // one sample per pixel, at its centre: the frame IS the drawing (a frame made at the production scale averages several samples per pixel instead — see the last test)
    const out = renderFrame(toDrawing(img), frame, { warp, samples: 1 });
    // soft pixels go through premultiplied floats and back: they may differ by a rounding step, the opaque ones not at all
    expect(maxDiff(out, img)).toBeLessThanOrEqual(1);
    const o = (11 * 24 + 10) * 4;
    expect([...out.data.slice(o, o + 4)]).toEqual([...img.data.slice(o, o + 4)]);
  });

  it('a point asked to go somewhere goes exactly there, and the space between follows smoothly', () => {
    const pins: Pin[] = [
      { src: { x: 10, y: 10 }, dst: { x: 14, y: 12 } },
      { src: { x: 2, y: 2 }, dst: { x: 2, y: 2 } },
      { src: { x: 22, y: 2 }, dst: { x: 22, y: 2 } },
    ];
    const warp = new RigidMls(pins);
    const out: Pt = { x: 0, y: 0 };
    // the frame's point (14, 12) is made from the drawing's point (10, 10)
    warp.map(14, 12, out);
    expect(out.x).toBeCloseTo(10, 9);
    expect(out.y).toBeCloseTo(10, 9);
    // a point a hair away comes from a point a hair away (no tear)
    warp.map(14.01, 12, out);
    expect(Math.hypot(out.x - 10, out.y - 10)).toBeLessThan(0.05);
    // the pins that stay are still
    warp.map(2, 2, out);
    expect([out.x, out.y]).toEqual([2, 2]);
  });

  it('a rigid move of every point is reproduced as a rigid move: a shift, a turn, nothing bent', () => {
    const src: Pt[] = [{ x: 3, y: 4 }, { x: 18, y: 5 }, { x: 9, y: 16 }, { x: 20, y: 15 }];
    const t = about({ x: 12, y: 10 }, { rot: 17, dx: 3, dy: -2 });
    const pins: Pin[] = src.map((p) => ({ src: p, dst: apply(t, p) }));
    const warp = new RigidMls(pins);
    const back = invert(t);
    for (const p of [{ x: 1, y: 1 }, { x: 11, y: 9 }, { x: 23, y: 19 }, { x: 7, y: 14 }]) {
      const out: Pt = { x: 0, y: 0 };
      warp.map(p.x, p.y, out);
      const want = apply(back, p);
      expect(out.x).toBeCloseTo(want.x, 6);
      expect(out.y).toBeCloseTo(want.y, 6);
    }
  });

  it('a whole-pixel move loses and invents nothing: the frame is the drawing shifted, to the byte', () => {
    const img = sample();
    const pins: Pin[] = [
      { src: { x: 6, y: 5 }, dst: { x: 9, y: 4 } },
      { src: { x: 17, y: 5 }, dst: { x: 20, y: 4 } },
      { src: { x: 6, y: 15 }, dst: { x: 9, y: 14 } },
      { src: { x: 17, y: 15 }, dst: { x: 20, y: 14 } },
      { src: { x: 0, y: 0 }, dst: { x: 3, y: -1 } },
      { src: { x: 23, y: 19 }, dst: { x: 26, y: 18 } },
    ];
    const out = renderFrame(toDrawing(img), frame, { warp: new RigidMls(pins), samples: 1 });
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 24; x++) {
        const sx = x - 3;
        const sy = y + 1;
        const o = (y * 24 + x) * 4;
        if (sx < 0 || sx >= 24 || sy < 0 || sy >= 20) continue;
        const s = (sy * 24 + sx) * 4;
        for (let c = 0; c < 4; c++) expect(Math.abs(out.data[o + c]! - img.data[s + c]!), `pixel ${x},${y} channel ${c}`).toBeLessThanOrEqual(1);
      }
    }
    // and what the drawing left empty stays empty: not a pixel of the frame is opaque where the shifted drawing is clear
    let stray = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) if (out.data[(y * 24 + x) * 4 + 3]! > 2 && (x - 3 < 0 || x - 3 >= 24 || (y + 1) >= 20 || img.data[((y + 1) * 24 + (x - 3)) * 4 + 3] === 0)) stray++;
    expect(stray).toBe(0);
  });

  it('the same drawing and the same points give the same pixels, every time', () => {
    const img = sample();
    const pins: Pin[] = [
      { src: { x: 8, y: 8 }, dst: { x: 9.3, y: 7.1 } },
      { src: { x: 15, y: 12 }, dst: { x: 14.2, y: 12.8 } },
      { src: { x: 3, y: 3 }, dst: { x: 3, y: 3 } },
    ];
    const a = renderFrame(toDrawing(img), frame, { warp: new RigidMls(pins), global: about({ x: 12, y: 18 }, { rot: 4 }) });
    const b = renderFrame(toDrawing(img), frame, { warp: new RigidMls(pins), global: about({ x: 12, y: 18 }, { rot: 4 }) });
    expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))).toBe(0);
  });

  it('a transparent pixel stays transparent black: no fringe, no halo', () => {
    const img = sample();
    const pins: Pin[] = [
      { src: { x: 11, y: 10 }, dst: { x: 12, y: 11 } },
      { src: { x: 1, y: 1 }, dst: { x: 1, y: 1 } },
    ];
    const out = renderFrame(toDrawing(img), frame, { warp: new RigidMls(pins), global: about({ x: 12, y: 10 }, { rot: 9 }) });
    for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3] === 0) expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([0, 0, 0]);
    // the corners of the frame were never part of the drawing
    expect(out.data[3]).toBe(0);
  });

  it('at the production scale (a half) an unmoved drawing comes out as the drawing averaged over the area of each pixel: nothing shifted, nothing sharpened, nothing lost', () => {
    const img = sample();
    const out = renderFrame(toDrawing(img), { width: 12, height: 10, scale: 0.5, origin: { x: 0, y: 0 } }, { warp: null });
    // the reference: the plain box average of every 2 × 2 block, in premultiplied terms
    let total = 0;
    let n = 0;
    let worst = 0;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 12; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < 4; k++) {
          const o = ((2 * y + (k >> 1)) * 24 + 2 * x + (k & 1)) * 4;
          const al = img.data[o + 3]! / 255;
          r += (img.data[o]! * al) / 4;
          g += (img.data[o + 1]! * al) / 4;
          b += (img.data[o + 2]! * al) / 4;
          a += al / 4;
        }
        const o = (y * 12 + x) * 4;
        if (a < 0.02) {
          expect(out.data[o + 3]).toBeLessThanOrEqual(8);
          continue;
        }
        const want = [r / a, g / a, b / a, a * 255];
        for (let c = 0; c < 4; c++) {
          const d = Math.abs(out.data[o + c]! - want[c]!);
          total += d;
          n++;
          worst = Math.max(worst, d);
        }
      }
    }
    expect(total / n, 'mean error against the box average').toBeLessThan(6);
    expect(worst, 'worst error against the box average').toBeLessThan(70);
  });

  it('transforms compose, invert and recognise the identity', () => {
    const a = about({ x: 5, y: 5 }, { rot: 30, sx: 1.1, sy: 0.9, dx: 2, dy: 1 });
    const b = about({ x: 1, y: 8 }, { rot: -12, dx: -3 });
    const ab = compose(a, b);
    const p = { x: 7, y: 3 };
    const q = apply(a, apply(b, p));
    const r = apply(ab, p);
    expect(r.x).toBeCloseTo(q.x, 9);
    expect(r.y).toBeCloseTo(q.y, 9);
    expect(isIdentity(compose(a, invert(a)), 1e-9)).toBe(true);
    expect(() => invert({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 })).toThrow();
  });
});
