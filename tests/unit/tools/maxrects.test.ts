import { describe, expect, it } from 'vitest';
import { packPages, type Box, type PackedPage } from '../../../tools/assets/maxrects';
import { Rng } from '@/core/rng';

/**
 * THE PAGE PACKER (docs/ART-PIPELINE-2D.md, part C): boxes in, positions out. What matters: nothing overlaps, nothing leaves its page, the result never depends on
 * the order the boxes came in, and a page is only as big as it needs to be.
 */
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function check(boxes: Box[], pages: PackedPage[], maxSide: number): void {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const seen = new Set<number>();
  for (const page of pages) {
    expect(page.width).toBeLessThanOrEqual(maxSide);
    expect(page.height).toBeLessThanOrEqual(maxSide);
    expect(page.width % 4, 'a multiple of 4').toBe(0);
    expect(page.height % 4).toBe(0);
    const rects = page.slots.map((s) => ({ ...s, w: byId.get(s.id)!.w, h: byId.get(s.id)!.h }));
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, `box ${r.id} inside its page`).toBeLessThanOrEqual(page.width);
      expect(r.y + r.h).toBeLessThanOrEqual(page.height);
      expect(seen.has(r.id), `box ${r.id} placed once`).toBe(false);
      seen.add(r.id);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!), `boxes ${rects[i]!.id} and ${rects[j]!.id}`).toBe(false);
  }
  expect(seen.size, 'every box is somewhere').toBe(boxes.length);
}

describe('packPages', () => {
  it('places boxes without overlap, inside their page, each once — whatever their sizes', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rng = new Rng(seed);
      const boxes: Box[] = Array.from({ length: 80 }, (_, id) => ({ id, w: rng.int(4, 120), h: rng.int(4, 160) }));
      check(boxes, packPages(boxes, 512), 512);
    }
  });

  it('is deterministic, and does not depend on the order the boxes came in', () => {
    const rng = new Rng(9);
    const boxes: Box[] = Array.from({ length: 40 }, (_, id) => ({ id, w: rng.int(8, 90), h: rng.int(8, 90) }));
    const a = packPages(boxes, 1024);
    const b = packPages([...boxes].reverse(), 1024);
    expect(b).toEqual(a);
    expect(packPages(boxes, 1024)).toEqual(a);
  });

  it('makes a page only as big as what is on it: a handful of small boxes is not a 2048 page', () => {
    const boxes: Box[] = Array.from({ length: 12 }, (_, id) => ({ id, w: 60, h: 100 }));
    const pages = packPages(boxes, 2048);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.width * pages[0]!.height, 'under four times the area of the boxes').toBeLessThan(4 * 12 * 60 * 100);
    expect(pages[0]!.width).toBeLessThanOrEqual(512);
    check(boxes, pages, 2048);
  });

  it('wastes little: frames of one character fill at least 70% of the page', () => {
    const rng = new Rng(21);
    const boxes: Box[] = Array.from({ length: 120 }, (_, id) => ({ id, w: rng.int(70, 110), h: rng.int(120, 170) }));
    const pages = packPages(boxes, 2048);
    const used = boxes.reduce((n, b) => n + b.w * b.h, 0);
    const total = pages.reduce((n, p) => n + p.width * p.height, 0);
    expect(used / total).toBeGreaterThan(0.7);
    check(boxes, pages, 2048);
  });

  it('opens a second page when one is not enough, and fills the first before it', () => {
    const boxes: Box[] = Array.from({ length: 30 }, (_, id) => ({ id, w: 100, h: 100 }));
    const pages = packPages(boxes, 256); // a 256 page holds 4 boxes of 100 × 100 in a 2 × 2 grid
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]!.slots.length).toBe(4);
    check(boxes, pages, 256);
  });

  it('refuses a box that cannot fit a page, naming it, and boxes that are not whole', () => {
    expect(() => packPages([{ id: 7, w: 300, h: 10 }], 256)).toThrow(/box 7 is 300 × 10: it does not fit a page of 256/);
    expect(() => packPages([{ id: 1, w: 0, h: 10 }], 256)).toThrow(/whole and positive/);
    expect(() => packPages([{ id: 1, w: 10.5, h: 10 }], 256)).toThrow(/whole and positive/);
    expect(packPages([], 256)).toEqual([]);
  });

  it('takes a box that is as large as the page itself', () => {
    const pages = packPages([{ id: 0, w: 256, h: 256 }, { id: 1, w: 10, h: 10 }], 256);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.slots).toEqual([{ id: 0, x: 0, y: 0 }]);
  });
});
