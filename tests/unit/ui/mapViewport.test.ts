import { describe, expect, it } from 'vitest';
import { clampScale, clampView, fitScale, fitView, FIT_PAD, KEEP_IN_VIEW, openingView, panBy, pinchOf, TOOLS_RESERVE, toMap, toScreen, viewCentredOn, wheelFactor, ZOOM, zoomAbout } from '@/ui/map/viewport';

/** The arithmetic of seeing the map: fitting, zooming into a point, dragging and never losing it off the screen. */

const size = { width: 800, height: 400 };
const strip = { x0: 0, y0: 0, x1: 400, y1: 20 };

describe('fitting the map to the panel', () => {
  it('fits the whole of it, with room around it, at the scale the narrower side allows', () => {
    expect(fitScale(strip, size)).toBeCloseTo((800 - 2 * FIT_PAD) / 400, 9);
    expect(fitScale({ x0: 0, y0: 0, x1: 20, y1: 400 }, size)).toBeCloseTo((400 - 2 * FIT_PAD) / 400, 9);
  });

  it('centres what it fits, and does not blow a small map up to the whole panel', () => {
    const v = fitView({ x0: 0, y0: 0, x1: 100, y1: 20 }, size);
    expect(v.scale).toBe(ZOOM.start); // a hundred metres would fit at 7 px/m: a first view stops at the start scale
    const mid = toScreen(v, { x: 50, y: 10 });
    expect(mid.x).toBeCloseTo(400, 9);
    expect(mid.y).toBeCloseTo(200, 9);
  });

  it('sets a strip at the right edge aside: the map is fitted and centred in what is left, the buttons have their own place', () => {
    const v = fitView(strip, size, FIT_PAD, TOOLS_RESERVE);
    expect(v.scale).toBeCloseTo((800 - TOOLS_RESERVE - 2 * FIT_PAD) / 400, 9);
    const east = toScreen(v, { x: 400, y: 10 });
    const west = toScreen(v, { x: 0, y: 10 });
    expect(east.x).toBeCloseTo(800 - TOOLS_RESERVE - FIT_PAD, 9); // the same room is left on each side, within what is left
    expect(west.x).toBeCloseTo(FIT_PAD, 9);
    // nothing reserved is the whole panel, as before
    expect(fitView(strip, size, FIT_PAD, 0)).toEqual(fitView(strip, size));
    // a strip wider than the panel does not turn the numbers into nonsense
    const v2 = fitView(strip, { width: 40, height: 400 }, FIT_PAD, TOOLS_RESERVE);
    expect(Number.isFinite(v2.scale) && Number.isFinite(v2.x) && Number.isFinite(v2.y)).toBe(true);
  });

  it('never goes below the least scale, whatever the size of the world', () => {
    expect(fitView({ x0: 0, y0: 0, x1: 100_000, y1: 10 }, size).scale).toBe(ZOOM.min);
  });

  it('survives an empty box and a panel with no size (a screen that is not laid out yet)', () => {
    expect(Number.isFinite(fitView({ x0: 0, y0: 0, x1: 0, y1: 0 }, size).scale)).toBe(true);
    expect(Number.isFinite(fitView(strip, { width: 0, height: 0 }).scale)).toBe(true);
  });
});

describe('the first view of the map', () => {
  it('shows everything discovered when it can be read', () => {
    const v = openingView({ x0: 0, y0: 0, x1: 300, y1: 20 }, { x: 10, y: 10 }, size);
    expect(v).toEqual(fitView({ x0: 0, y0: 0, x1: 300, y1: 20 }, size));
    expect(v.scale).toBeGreaterThanOrEqual(ZOOM.legible);
  });

  it('reads the map at a legible scale around the hero when everything would not be', () => {
    const wide = { x0: 0, y0: 0, x1: 3000, y1: 40 };
    const v = openingView(wide, { x: 2500, y: 20 }, size);
    expect(v.scale).toBe(ZOOM.legible);
    const at = toScreen(v, { x: 2500, y: 20 });
    expect([at.x, at.y]).toEqual([400, 200]);
    // with nobody to look for, the fitted one
    expect(openingView(wide, null, size).scale).toBeLessThan(ZOOM.legible);
  });

  it('puts the hero in the middle of what the buttons leave of the panel', () => {
    const wide = { x0: 0, y0: 0, x1: 3000, y1: 40 };
    const v = openingView(wide, { x: 2500, y: 20 }, size, FIT_PAD, TOOLS_RESERVE);
    expect(v.scale).toBe(ZOOM.legible);
    const at = toScreen(v, { x: 2500, y: 20 });
    expect([at.x, at.y]).toEqual([(800 - TOOLS_RESERVE) / 2, 200]);
    expect(openingView({ x0: 0, y0: 0, x1: 300, y1: 20 }, { x: 10, y: 10 }, size, FIT_PAD, TOOLS_RESERVE)).toEqual(fitView({ x0: 0, y0: 0, x1: 300, y1: 20 }, size, FIT_PAD, TOOLS_RESERVE));
  });
});

describe('zooming', () => {
  it('keeps the point under the cursor where it is', () => {
    const v = fitView(strip, size);
    const anchor = { x: 300, y: 150 };
    const before = toMap(v, anchor);
    const z = zoomAbout(v, 1.6, anchor);
    expect(z.scale).toBeCloseTo(v.scale * 1.6, 9);
    expect(toMap(z, anchor).x).toBeCloseTo(before.x, 9);
    expect(toMap(z, anchor).y).toBeCloseTo(before.y, 9);
  });

  it('stops at the least and the most scale, and there the view does not move', () => {
    const v = { scale: ZOOM.max, x: 10, y: 20 };
    expect(zoomAbout(v, 2, { x: 5, y: 5 })).toEqual(v);
    const low = { scale: ZOOM.min, x: 10, y: 20 };
    expect(zoomAbout(low, 0.5, { x: 5, y: 5 })).toEqual(low);
    expect(clampScale(1e9)).toBe(ZOOM.max);
    expect(clampScale(0)).toBe(ZOOM.min);
  });

  it('is undone by the opposite factor', () => {
    const v = { scale: 3, x: -120, y: 40 };
    const back = zoomAbout(zoomAbout(v, 1.7, { x: 222, y: 99 }), 1 / 1.7, { x: 222, y: 99 });
    expect(back.scale).toBeCloseTo(v.scale, 9);
    expect(back.x).toBeCloseTo(v.x, 9);
    expect(back.y).toBeCloseTo(v.y, 9);
  });

  it('turns a wheel into a smooth factor: forwards zooms out, backwards in, a pinch of the trackpad faster, and a wild delta is limited', () => {
    expect(wheelFactor(100, 0, false)).toBeLessThan(1);
    expect(wheelFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelFactor(-10, 0, true)).toBeGreaterThan(wheelFactor(-10, 0, false));
    expect(wheelFactor(3, 1, false)).toBeCloseTo(wheelFactor(48, 0, false), 9); // three lines
    expect(wheelFactor(-1e9, 0, false)).toBe(wheelFactor(-240, 0, false));
    expect(wheelFactor(0, 0, false)).toBe(1);
  });

  it('reads a pinch as a distance and a middle', () => {
    expect(pinchOf({ x: 0, y: 0 }, { x: 6, y: 8 })).toEqual({ distance: 10, middle: { x: 3, y: 4 } });
  });
});

describe('dragging', () => {
  it('moves the map with the finger', () => {
    expect(panBy({ scale: 2, x: 10, y: 10 }, -30, 5)).toEqual({ scale: 2, x: -20, y: 15 });
  });

  it('keeps some of the map in the panel however far it is dragged, on every side', () => {
    const v = { scale: 2, x: 0, y: 0 };
    const map = { x0: 0, y0: 0, x1: 300, y1: 40 }; // 600 × 80 px at this scale
    const gone = clampView(panBy(v, -10_000, 0), map, size);
    expect(map.x1 * gone.scale + gone.x).toBeGreaterThanOrEqual(KEEP_IN_VIEW);
    const far = clampView(panBy(v, 10_000, 10_000), map, size);
    expect(map.x0 * far.scale + far.x).toBeLessThanOrEqual(size.width - KEEP_IN_VIEW);
    expect(map.y0 * far.scale + far.y).toBeLessThanOrEqual(size.height - KEEP_IN_VIEW);
    const up = clampView(panBy(v, 0, -10_000), map, size);
    expect(map.y1 * up.scale + up.y).toBeGreaterThanOrEqual(Math.min(KEEP_IN_VIEW, 80));
  });

  it('leaves a view that is already fine exactly as it is (the same object: nothing to redraw)', () => {
    const v = fitView(strip, size);
    expect(clampView(v, strip, size)).toBe(v);
  });

  it('never asks for more than the map has: a mark smaller than the margin is kept whole', () => {
    const tiny = { x0: 0, y0: 0, x1: 10, y1: 4 };
    const v = clampView({ scale: 1, x: -500, y: -500 }, tiny, size);
    expect(tiny.x1 * v.scale + v.x).toBeGreaterThanOrEqual(10);
  });
});

describe('centring', () => {
  it('puts a point in the middle of the panel at the scale asked for, within the limits', () => {
    const v = viewCentredOn({ x: 50, y: 5 }, size, 4);
    expect(toScreen(v, { x: 50, y: 5 })).toEqual({ x: 400, y: 200 });
    expect(viewCentredOn({ x: 0, y: 0 }, size, 1e9).scale).toBe(ZOOM.max);
  });
});
