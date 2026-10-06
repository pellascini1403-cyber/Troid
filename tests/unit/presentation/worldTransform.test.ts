// @vitest-environment happy-dom
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { computeViewport } from '@/presentation/viewport';
import { computeWorldTransform, createWorldTransform, parallaxOffset, snapToPixel, viewY, worldToScreen } from '@/presentation/worldTransform';

const layout = computeViewport({ cssWidth: 1920, cssHeight: 1080, dpr: 1, resolutionCap: 2, viewHeight: 13.5 });
const calm = { x: 0, y: 0, rollRad: 0 };

/** Where a world point (simulation space, metres) lands on screen (CSS px) given the container transform. */
function toScreen(t: ReturnType<typeof computeWorldTransform>, x: number, simY: number) {
  return { x: t.posX + (x - t.pivotX) * t.scale, y: t.posY + (viewY(simY) - t.pivotY) * t.scale };
}

describe('worldTransform: camera → world container', () => {
  it('the camera centre lands on the centre of the game area', () => {
    const t = computeWorldTransform({ x: 37.25, y: 4.5 }, calm, layout, false);
    const s = toScreen(t, 37.25, 4.5);
    expect(s.x).toBeCloseTo(960, 6);
    expect(s.y).toBeCloseTo(540, 6);
  });

  it('+Y in the simulation is UP on screen (the Y flip lives in one place)', () => {
    const t = computeWorldTransform({ x: 0, y: 0 }, calm, layout, false);
    expect(toScreen(t, 0, 2).y).toBeLessThan(toScreen(t, 0, 0).y);
    expect(toScreen(t, 2, 0).x).toBeGreaterThan(toScreen(t, 0, 0).x);
  });

  it('one metre is `ppm` CSS pixels, so the visible height is exactly viewHeight metres', () => {
    const t = computeWorldTransform({ x: 0, y: 0 }, calm, layout, false);
    expect(toScreen(t, 0, 13.5 / 2).y).toBeCloseTo(0, 6); // top edge
    expect(toScreen(t, 0, -13.5 / 2).y).toBeCloseTo(1080, 6); // bottom edge
  });

  it('is centred inside the game area when there are bars', () => {
    const wide = computeViewport({ cssWidth: 3440, cssHeight: 1440, dpr: 1, resolutionCap: 2, viewHeight: 13.5 });
    const t = computeWorldTransform({ x: 0, y: 0 }, calm, wide, false);
    expect(t.posX).toBeCloseTo(3440 / 2, 6);
  });

  it('snapping puts the camera on a whole device pixel (no sub-pixel shimmer)', () => {
    const hd = computeViewport({ cssWidth: 844, cssHeight: 390, dpr: 3, resolutionCap: 1.75, viewHeight: 13.5 });
    const dppm = hd.ppm * hd.resolution;
    const t = computeWorldTransform({ x: 12.3456789, y: 3.14159265 }, calm, hd, true);
    expect(t.pivotX * dppm).toBeCloseTo(Math.round(t.pivotX * dppm), 9);
    expect(t.pivotY * dppm).toBeCloseTo(Math.round(t.pivotY * dppm), 9);
    expect(Math.abs(t.pivotX - 12.3456789)).toBeLessThan(0.5 / dppm + 1e-12);
  });

  it('shake offsets the pivot and rolls the container; no shake changes nothing', () => {
    const still = computeWorldTransform({ x: 5, y: 2 }, calm, layout, false);
    const shaken = computeWorldTransform({ x: 5, y: 2 }, { x: 0.2, y: -0.1, rollRad: 0.02 }, layout, false);
    expect(shaken.pivotX).toBeCloseTo(still.pivotX + 0.2, 9);
    expect(shaken.pivotY).toBeCloseTo(still.pivotY + 0.1, 9); // view-space flip
    expect(shaken.rotation).toBe(0.02);
    expect(still.rotation).toBe(0);
  });
});

describe('worldTransform: parallax', () => {
  it('a layer with factor f moves at f times the camera (factor 1 follows the world, 0 is glued to the screen)', () => {
    const t = computeWorldTransform({ x: 100, y: 0 }, calm, layout, false);
    const dppm = layout.ppm * layout.resolution;
    for (const f of [0, 0.15, 0.4, 0.75, 1]) {
      const off = parallaxOffset(t.pivotX, f, dppm);
      // screen position of the layer's local x = 0
      const sx = t.posX + (0 + off - t.pivotX) * t.scale;
      const expected = t.posX + (0 - f * t.pivotX) * t.scale;
      expect(sx).toBeCloseTo(expected, 3);
    }
  });

  it('snapToPixel rounds to the device pixel grid', () => {
    expect(snapToPixel(1.234, 100)).toBeCloseTo(1.23, 9);
    expect(snapToPixel(-1.236, 100)).toBeCloseTo(-1.24, 9);
  });
});

describe('worldToScreen: a point of the world on the screen (DOM that follows an object)', () => {
  it('agrees with the container the renderer builds from the same transform — scale, pivot, position AND roll', () => {
    const cases = [
      { centre: { x: 37.25, y: 4.5 }, shake: calm },
      { centre: { x: 10, y: 2 }, shake: { x: 0.12, y: -0.08, rollRad: 0.03 } },
      { centre: { x: 74.5, y: 1.2 }, shake: { x: 0, y: 0, rollRad: -0.05 } },
    ];
    for (const c of cases) {
      const t = computeWorldTransform(c.centre, c.shake, layout, true);
      const world = new Container();
      world.scale.set(t.scale);
      world.position.set(t.posX, t.posY);
      world.pivot.set(t.pivotX, t.pivotY);
      world.rotation = t.rotation;
      for (const [x, y] of [[0, 0], [37, 3], [74.5, 1.4], [-5, -2]] as const) {
        const child = new Container();
        child.position.set(x, viewY(y));
        world.addChild(child);
        const expected = child.toGlobal({ x: 0, y: 0 });
        const got = worldToScreen(t, x, y);
        expect(got.x).toBeCloseTo(expected.x, 6);
        expect(got.y).toBeCloseTo(expected.y, 6);
      }
    }
  });

  it('the camera centre is the centre of the game area, up is up, and one metre is `ppm` px', () => {
    const t = computeWorldTransform({ x: 8, y: 2 }, calm, layout, false);
    const mid = worldToScreen(t, 8, 2);
    expect([mid.x, mid.y]).toEqual([layout.contentX + layout.contentWidth / 2, layout.contentY + layout.contentHeight / 2].map((v) => expect.closeTo(v, 6)));
    const up = worldToScreen(t, 8, 3);
    expect(up.y).toBeCloseTo(mid.y - layout.ppm, 6);
    const right = worldToScreen(t, 9, 2);
    expect(right.x).toBeCloseTo(mid.x + layout.ppm, 6);
  });

  it('reuses the output object it is given (no allocation per frame)', () => {
    const out = { x: 0, y: 0 };
    const r = worldToScreen(createWorldTransform(), 1, 1, out);
    expect(r).toBe(out);
  });
});

