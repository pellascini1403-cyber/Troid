import { describe, expect, it } from 'vitest';
import { canvasRect, metresPerArtPixel, rectHeight, rectWidth, visibleRect, worldRect, type MetreRect } from '@/presentation/pictureBounds';

const same = (actual: MetreRect, expected: MetreRect): void => {
  for (const k of ['x0', 'x1', 'y0', 'y1'] as const) expect(actual[k], k).toBeCloseTo(expected[k], 12);
};

/**
 * WHERE A PICTURE SITS (docs/ART-PIPELINE-2D.md, parts D and G): the rectangle of a frame in metres, from the feet and in the world. Pure: no GPU, no gameplay —
 * the one set of numbers the game exposes, the lab draws and nothing of the simulation ever reads.
 */
describe('where a picture sits, in metres', () => {
  const def = { pivot: [0.5, 0.9] as const, artPxPerMeter: 100 };

  it('the canvas is a rectangle around the feet pivot: the pivot is a FRACTION of it', () => {
    const r = canvasRect(def, 200, 300);
    same(r, { x0: -1, x1: 1, y0: -0.3, y1: 2.7 });
    expect(rectWidth(r)).toBeCloseTo(2, 12);
    expect(rectHeight(r)).toBeCloseTo(3, 12);
    same(canvasRect({ ...def, pivot: [0.5, 1] }, 200, 300), { x0: -1, x1: 1, y0: 0, y1: 3 });
  });

  it('the visual scale scales the picture about the feet; a denser image covers the same metres with more pixels', () => {
    expect(metresPerArtPixel({ artPxPerMeter: 100, visualScale: 2 })).toBe(0.02);
    same(canvasRect({ ...def, visualScale: 2 }, 200, 300), { x0: -2, x1: 2, y0: -0.6, y1: 5.4 });
    same(canvasRect({ ...def, artPxPerMeter: 50 }, 100, 150), canvasRect(def, 200, 300)); // the half-size image of the same frame covers the same metres
  });

  it('the visible part of a trimmed frame is where its pixels sit in the original', () => {
    const v = visibleRect({ pivot: [0.5, 1], artPxPerMeter: 100 }, { width: 200, height: 300 }, { x: 40, y: 30, width: 100, height: 240 });
    expect(v.x0).toBeCloseTo(-0.6, 12);
    expect(v.x1).toBeCloseTo(0.4, 12);
    expect(v.y1).toBeCloseTo(2.7, 12);
    expect(v.y0).toBeCloseTo(0.3, 12);
    same(visibleRect({ pivot: [0.5, 1], artPxPerMeter: 100 }, { width: 200, height: 300 }, null), canvasRect({ pivot: [0.5, 1], artPxPerMeter: 100 }, 200, 300));
  });
});

describe('the picture in the world', () => {
  const local: MetreRect = { x0: -0.3, x1: 0.5, y0: 0.1, y1: 1.8 };

  it('facing right it is the rectangle from the feet, moved to where the feet are', () => {
    same(worldRect(local, 10, 4, 1), { x0: 9.7, x1: 10.5, y0: 4.1, y1: 5.8 });
  });

  it('facing left it is mirrored about the feet — the same mirror the sprite gets — and nothing else changes', () => {
    const r = worldRect(local, 10, 4, -1);
    same(r, { x0: 9.5, x1: 10.3, y0: 4.1, y1: 5.8 });
    expect(rectWidth(r)).toBeCloseTo(rectWidth(local), 12);
    expect(rectHeight(r)).toBeCloseTo(rectHeight(local), 12);
  });

  it('the feet stay inside the picture of a figure that stands on them, whichever way it faces', () => {
    const standing = canvasRect({ pivot: [0.5, 1], artPxPerMeter: 60 }, 96, 120); // the feet are the bottom centre of the canvas
    for (const facing of [1, -1]) {
      const r = worldRect(standing, 3, 2, facing);
      expect(r.x0).toBeLessThan(3);
      expect(r.x1).toBeGreaterThan(3);
      expect(r.y0).toBeCloseTo(2, 12);
    }
  });

  it('fills the rectangle it is given instead of making a new one (it runs every frame)', () => {
    const out: MetreRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
    expect(worldRect(local, 1, 1, 1, out)).toBe(out);
    expect(out.x1).toBeCloseTo(1.5, 12);
  });

  it('a hero that faces nowhere (0) is drawn as if facing right: only a negative facing mirrors', () => {
    same(worldRect(local, 0, 0, 0), local);
  });
});
