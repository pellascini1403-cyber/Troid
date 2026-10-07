import { describe, expect, it } from 'vitest';
import { canvasRect, ClipTimeline, metresPerArtPixel, rectHeight, rectWidth, visibleRect, type MetreRect } from '@/presentation/labModel';

const same = (actual: MetreRect, expected: MetreRect): void => {
  for (const k of ['x0', 'x1', 'y0', 'y1'] as const) expect(actual[k], k).toBeCloseTo(expected[k], 12);
};

/**
 * THE MATHS OF THE PLAYER LAB (docs/ART-PIPELINE-2D.md, part G): which frame is on screen and where the picture sits in metres.
 */
describe('ClipTimeline', () => {
  it('plays a loop at its rate and wraps', () => {
    const c = new ClipTimeline(4, 8, true);
    expect(c.index).toBe(0);
    c.advance(0.126); // a little over one frame at 8 fps
    expect(c.index).toBe(1);
    c.advance(0.125 * 3);
    expect(c.index).toBe(0); // 4 frames later: round the loop
    c.advance(0.125 * 6.5);
    expect(c.index).toBe(2);
  });

  it('plays a one-shot to its end and stays there', () => {
    const c = new ClipTimeline(3, 10, false);
    c.advance(10);
    expect(c.index).toBe(2);
    expect(c.finished).toBe(true);
    c.advance(10);
    expect(c.index).toBe(2);
  });

  it('pause stops time, and play goes on from where it stood', () => {
    const c = new ClipTimeline(4, 10, true);
    c.advance(0.25);
    expect(c.index).toBe(2);
    c.playing = false;
    c.advance(5);
    expect(c.index).toBe(2);
    c.playing = true;
    c.advance(0.1);
    expect(c.index).toBe(3);
  });

  it('steps one frame at a time, pausing, and wraps both ways — the way a person looks through the clip', () => {
    const c = new ClipTimeline(3, 12, false);
    c.step(1);
    expect([c.index, c.playing]).toEqual([1, false]);
    c.step(1);
    c.step(1);
    expect(c.index).toBe(0); // 2 → 0
    c.step(-1);
    expect(c.index).toBe(2); // 0 → 2
    c.step(-2);
    expect(c.index).toBe(0);
    c.seek(7);
    expect(c.index).toBe(1);
    c.seek(-1);
    expect(c.index).toBe(2);
  });

  it('a stepped frame stays on its frame however long it is looked at, and then plays on from it', () => {
    const c = new ClipTimeline(4, 8, true);
    c.seek(2);
    c.advance(1);
    expect(c.index).toBe(2);
    c.playing = true;
    c.advance(0.126);
    expect(c.index).toBe(3);
  });

  it('play on a clip that has finished plays it again from the start; on one that has not, it goes on from where it is', () => {
    const c = new ClipTimeline(3, 10, false);
    c.advance(10);
    expect(c.finished).toBe(true);
    c.playing = false;
    c.play();
    expect([c.playing, c.index]).toEqual([true, 0]);
    c.advance(0.15);
    c.playing = false;
    expect(c.index).toBe(1);
    c.play();
    expect(c.index).toBe(1);
  });

  it('speed scales time; restart goes back to the first frame', () => {
    const c = new ClipTimeline(8, 8, true);
    c.speed = 0.5;
    c.advance(0.5);
    expect(c.index).toBe(2);
    c.restart();
    expect(c.index).toBe(0);
  });

  it('a one-frame clip, a clip with no rate and an empty clip are frame 0 and never fail', () => {
    for (const c of [new ClipTimeline(1, 8, true), new ClipTimeline(5, 0, true), new ClipTimeline(0, 8, false), new ClipTimeline(5, NaN, false)]) {
      c.advance(3);
      c.step(1);
      c.step(-3);
      expect(Number.isFinite(c.index)).toBe(true);
      expect(c.index).toBeGreaterThanOrEqual(0);
    }
    expect(new ClipTimeline(1, 8, true).index).toBe(0);
  });
});

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
