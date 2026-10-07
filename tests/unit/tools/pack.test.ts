import { describe, expect, it } from 'vitest';
import { atlasJson, crop, DEFAULT_PACK, opaqueBounds, packFrames, unpackFrame, type SourceFrame } from '../../../tools/assets/pack';
import type { RgbaImage } from '../../../tools/assets/png';
import { parseAtlasData } from '@/presentation/artAtlas';
import { Rng } from '@/core/rng';

/**
 * THE ATLAS PACKER (docs/ART-PIPELINE-2D.md, part C): every frame must come back out of its page exactly as it went in — that is the whole contract. The frames
 * here are noise with a transparent margin of a given size: technical fixtures, never art.
 */
function frameWith(width: number, height: number, solid: { x: number; y: number; w: number; h: number } | null, seed: number): RgbaImage {
  const rng = new Rng(seed);
  const data = new Uint8Array(width * height * 4);
  if (solid) {
    for (let y = solid.y; y < solid.y + solid.h; y++) {
      for (let x = solid.x; x < solid.x + solid.w; x++) {
        const o = (y * width + x) * 4;
        data[o] = rng.int(0, 256);
        data[o + 1] = rng.int(0, 256);
        data[o + 2] = rng.int(0, 256);
        data[o + 3] = [1, 128, 255, 254][rng.int(0, 4)]!; // visible, never 0 inside the solid part
      }
    }
  }
  return { width, height, data };
}
const same = (a: RgbaImage, b: RgbaImage): boolean => a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i]);
const frames = (n: number, seed = 1): SourceFrame[] => {
  const rng = new Rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const w = rng.int(6, 40);
    const h = rng.int(6, 50);
    return { name: `f_${String(i).padStart(2, '0')}`, image: frameWith(64, 80, { x: rng.int(0, 20), y: rng.int(0, 20), w, h }, 100 + i) };
  });
};

describe('opaqueBounds / crop', () => {
  it('finds the rectangle of every pixel that can be seen, and only that: one almost-clear pixel keeps its row and column', () => {
    const img = frameWith(20, 20, { x: 5, y: 6, w: 4, h: 3 }, 1);
    expect(opaqueBounds(img)).toEqual({ x: 5, y: 6, w: 4, h: 3 });
    img.data[(19 * 20 + 19) * 4 + 3] = 1; // alpha 1 in the far corner
    expect(opaqueBounds(img)).toEqual({ x: 5, y: 6, w: 15, h: 14 });
    expect(opaqueBounds({ width: 4, height: 4, data: new Uint8Array(64) })).toBeNull();
    const c = crop(img, { x: 5, y: 6, w: 2, h: 2 });
    expect([c.width, c.height]).toEqual([2, 2]);
    expect(Array.from(c.data.subarray(0, 4))).toEqual(Array.from(img.data.subarray((6 * 20 + 5) * 4, (6 * 20 + 5) * 4 + 4)));
  });
});

describe('packFrames: lossless', () => {
  it('every frame is rebuilt from its page exactly as it was handed in', () => {
    const input = frames(40, 3);
    const result = packFrames(input, { maxSide: 128 });
    expect(result.pages.length, 'forty frames do not fit one 128 page').toBeGreaterThan(1);
    for (const f of input) expect(same(unpackFrame(result, f.name), f.image), f.name).toBe(true);
  });

  it('is lossless with no trim, with no padding, and with a wide gutter', () => {
    const input = frames(12, 4);
    for (const options of [{ trim: false }, { padding: 0, extrude: 0 }, { padding: 6, extrude: 3 }]) {
      const result = packFrames(input, options);
      for (const f of input) expect(same(unpackFrame(result, f.name), f.image), `${f.name} ${JSON.stringify(options)}`).toBe(true);
    }
  });

  it('writes down where the trimmed pixels were, so that the pivot (a fraction of the ORIGINAL frame) never moves', () => {
    const input: SourceFrame[] = [{ name: 'a', image: frameWith(64, 80, { x: 10, y: 20, w: 12, h: 30 }, 5) }];
    const r = packFrames(input);
    expect(r.frames['a']).toMatchObject({ trimmed: true, spriteSourceSize: { x: 10, y: 20, w: 12, h: 30 }, sourceSize: { w: 64, h: 80 } });
    expect([r.frames['a']!.frame.w, r.frames['a']!.frame.h]).toEqual([12, 30]);
    const whole = packFrames([{ name: 'b', image: frameWith(8, 8, { x: 0, y: 0, w: 8, h: 8 }, 6) }]);
    expect(whole.frames['b']!.trimmed, 'a frame that fills its rectangle is not trimmed').toBeUndefined();
    expect(whole.frames['b']!.sourceSize).toEqual({ w: 8, h: 8 });
  });

  it('keeps a frame with nothing visible (a blink) as one clear pixel in its place', () => {
    const empty: RgbaImage = { width: 16, height: 16, data: new Uint8Array(16 * 16 * 4) };
    const r = packFrames([{ name: 'blink', image: empty }, { name: 'other', image: frameWith(16, 16, { x: 2, y: 2, w: 4, h: 4 }, 7) }]);
    expect(r.frames['blink']).toMatchObject({ trimmed: true, sourceSize: { w: 16, h: 16 }, frame: { w: 1, h: 1 } });
    expect(same(unpackFrame(r, 'blink'), empty)).toBe(true);
  });

  it('stores identical frames once and says which one it is', () => {
    const a = frameWith(32, 32, { x: 4, y: 4, w: 10, h: 10 }, 8);
    const copy: RgbaImage = { ...a, data: new Uint8Array(a.data) };
    const moved = frameWith(32, 32, { x: 5, y: 4, w: 10, h: 10 }, 8); // same pixels shifted: NOT the same frame (the pivot would move)
    const r = packFrames([{ name: 'hold_00', image: a }, { name: 'hold_01', image: copy }, { name: 'hold_02', image: moved }]);
    expect(r.frames['hold_01']!.frame).toEqual(r.frames['hold_00']!.frame);
    expect(r.frames['hold_01']!.sameAs).toBe('hold_00');
    expect(r.frames['hold_02']!.frame).not.toEqual(r.frames['hold_00']!.frame);
    expect(r.frames['hold_02']!.sameAs).toBeUndefined();
    expect(r.stats).toMatchObject({ frames: 3, stored: 2, duplicates: 1 });
    expect(same(unpackFrame(r, 'hold_01'), copy)).toBe(true);
  });

  it('is deterministic whatever order the frames are given in', () => {
    const input = frames(25, 6);
    const a = packFrames(input, { maxSide: 256 });
    const b = packFrames([...input].reverse(), { maxSide: 256 });
    expect(b.frames).toEqual(a.frames);
    expect(b.pages.map((p) => [p.image.width, p.image.height, Buffer.from(p.image.data).toString('base64')])).toEqual(a.pages.map((p) => [p.image.width, p.image.height, Buffer.from(p.image.data).toString('base64')]));
  });
});

describe('packFrames: the gutter', () => {
  it('repeats the edge pixels of each frame outwards and leaves the rest of the padding clear — never inside the frame\'s own rectangle', () => {
    const image = frameWith(10, 10, { x: 0, y: 0, w: 10, h: 10 }, 11);
    const r = packFrames([{ name: 'a', image }], { padding: 3, extrude: 2 });
    const page = r.pages[0]!.image;
    const f = r.frames['a']!.frame;
    const px = (x: number, y: number): number[] => Array.from(page.data.subarray((y * page.width + x) * 4, (y * page.width + x) * 4 + 4));
    const src = (x: number, y: number): number[] => Array.from(image.data.subarray((y * 10 + x) * 4, (y * 10 + x) * 4 + 4));
    expect(px(f.x - 1, f.y + 4), 'one pixel left of the frame = its left edge').toEqual(src(0, 4));
    expect(px(f.x - 2, f.y + 4)).toEqual(src(0, 4));
    expect(px(f.x + 10 + 1, f.y + 4), 'right').toEqual(src(9, 4));
    expect(px(f.x + 3, f.y - 2), 'above').toEqual(src(3, 0));
    expect(px(f.x + 3, f.y + 10 + 1), 'below').toEqual(src(3, 9));
    expect(px(f.x - 2, f.y - 2), 'the corner repeats the corner pixel').toEqual(src(0, 0));
    expect(px(f.x - 3, f.y + 4), 'the third pixel of the padding stays clear').toEqual([0, 0, 0, 0]);
    // and the frame itself is untouched
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) expect(px(f.x + x, f.y + y)).toEqual(src(x, y));
  });

  it('keeps every frame at least `padding` pixels from any other and from the page edge', () => {
    const input = frames(30, 12);
    const r = packFrames(input, { padding: 2, extrude: 1 });
    for (const [pageIndex, page] of r.pages.entries()) {
      const rects = Object.values(r.frames).filter((f) => f.page === pageIndex && !f.sameAs).map((f) => f.frame);
      for (const a of rects) {
        expect(a.x).toBeGreaterThanOrEqual(2);
        expect(a.y).toBeGreaterThanOrEqual(2);
        expect(a.x + a.w).toBeLessThanOrEqual(page.image.width - 2);
        for (const b of rects) if (a !== b) expect(a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4, 'gutters do not touch').toBe(false);
      }
    }
  });
});

describe('packFrames: what it refuses, and the numbers it reports', () => {
  it('refuses a frame that cannot fit a page, a name given twice, and an extrusion wider than the padding', () => {
    expect(() => packFrames([{ name: 'big', image: frameWith(300, 10, { x: 0, y: 0, w: 300, h: 10 }, 1) }], { maxSide: 256 })).toThrow(/frame "big" is 300 × 10/);
    const f = frames(1)[0]!;
    expect(() => packFrames([f, f])).toThrow(/frame "f_00" is given twice/);
    expect(() => packFrames([f], { padding: 1, extrude: 2 })).toThrow(/extrude \(2\) cannot be more than the padding \(1\)/);
  });

  it('reports what the trim and the dedupe saved', () => {
    const input = frames(10, 14);
    const r = packFrames(input);
    expect(r.stats.frames).toBe(10);
    expect(r.stats.storedPixels).toBeLessThan(r.stats.sourcePixels / 2);
    expect(r.stats.pagePixels).toBeGreaterThanOrEqual(r.stats.storedPixels);
    expect(DEFAULT_PACK).toEqual({ maxSide: 2048, padding: 2, extrude: 1, trim: true });
  });

  it('writes a JSON the engine\'s own atlas reader accepts, page by page, with every frame on exactly one page', () => {
    const input = frames(40, 15);
    const r = packFrames(input, { maxSide: 128 });
    expect(r.pages.length).toBeGreaterThan(1);
    const onPages = new Set<string>();
    r.pages.forEach((page, i) => {
      const json = atlasJson(r, i, `pack_${i}.png`);
      const { value, issues } = parseAtlasData(json);
      expect(issues.filter((x) => x.level === 'error'), `page ${i}`).toEqual([]);
      expect(value!.image).toBe(`pack_${i}.png`);
      expect(value!.size).toEqual({ w: page.image.width, h: page.image.height });
      for (const name of Object.keys(value!.frames)) {
        expect(onPages.has(name), name).toBe(false);
        onPages.add(name);
      }
    });
    expect([...onPages].sort()).toEqual(input.map((f) => f.name).sort());
    expect(() => atlasJson(r, 99, 'x.png')).toThrow(/no page 99/);
  });
});
