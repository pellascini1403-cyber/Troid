import { describe, expect, it } from 'vitest';
import { dimEyes, FrameBuilder, lowestRow, over, partition, type Canvas, type RigPose } from '../../../tools/assets/heroRig';
import type { RgbaImage } from '../../../tools/assets/png';

/**
 * THE PROTAGONIST'S RIG (docs/ART-PIPELINE-2D.md part N), on a drawing small enough to read: a body, a fist and a straight blade held by it. What the rig promises is that a part
 * moves as what it is — a blade turns about its hinge and stays straight and the same length, the hinge stays where the hand is, a figure that is laid on the floor rests on it and
 * loses nothing off the canvas — and that a cut-out piece is cut out of the drawing, never drawn into it.
 */

const W = 100;
const H = 80;
const solid = (x: number, y: number, [r, g, b]: [number, number, number]): number[] => [r, g, b, 255].map((v, i) => (i < 3 ? v + ((x * 3 + y * 5) % 9) : v));

/** A body (30…50 × 20…78), a fist (50…62 × 32…48) and a blade (62…95 × 36…44), over a clear background. */
function drawing(): RgbaImage {
  const data = new Uint8Array(W * H * 4);
  const put = (x: number, y: number, rgb: [number, number, number]): void => data.set(solid(x, y, rgb), (y * W + x) * 4);
  for (let y = 20; y < 78; y++) for (let x = 30; x < 50; x++) put(x, y, [40, 60, 120]);
  for (let y = 32; y < 48; y++) for (let x = 50; x < 62; x++) put(x, y, [70, 40, 50]);
  for (let y = 36; y < 44; y++) for (let x = 62; x < 95; x++) put(x, y, [150, 150, 170]);
  return { width: W, height: H, data };
}

const pose = (): RigPose => ({
  pose: 'bar',
  points: { feet: [40, 78], hip: [40, 60], hand: [58, 40], hinge_top: [62, 36], hinge_bot: [62, 44] },
  groups: {
    body: { points: ['hip'], pivot: 'feet' },
    arm: { points: ['hand', 'hinge_top', 'hinge_bot'], pivot: [45, 40], parent: 'body' },
    blade: { points: [], pivot: 'hinge_top', pivotCcw: 'hinge_bot', parent: 'arm' },
  },
  anchors: {
    hand_r: { at: [58, 40], group: 'arm' },
    hinge_bot: { at: [62, 44], group: 'blade' },
    hinge_top: { at: [62, 36], group: 'blade' },
    tip: { at: [94, 40], group: 'blade' },
  },
  layers: { blade: { polygon: [[62, 20], [100, 20], [100, 60], [62, 60]], group: 'blade', z: 'over' } },
});

const canvas: Canvas = { width: 130, height: 140, pivot: [40, 78], scale: 1, artPxPerMeter: 50 };
const builder = (rig: RigPose = pose()): FrameBuilder => new FrameBuilder({ images: new Map([['bar', drawing()]]), rig: { bar: rig } }, canvas);
const mass = (img: RgbaImage): number => {
  let m = 0;
  for (let i = 3; i < img.data.length; i += 4) m += img.data[i]!;
  return m / 255;
};
const dist = (a: [number, number], b: [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('the rig: a piece that is cut out', () => {
  it('a cut is a partition: every pixel of the drawing is in exactly one of the two halves, unchanged', () => {
    const img = drawing();
    const { piece, rest } = partition(img, pose().layers!['blade']!.polygon);
    let inPiece = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const a = [...img.data.slice(i, i + 4)];
      const p = [...piece.data.slice(i, i + 4)];
      const r = [...rest.data.slice(i, i + 4)];
      const zero = [0, 0, 0, 0];
      const isPiece = p.some((v) => v !== 0);
      const isRest = r.some((v) => v !== 0);
      expect(isPiece && isRest, `pixel ${i / 4} is in both halves`).toBe(false);
      if (a[3] !== 0) expect(isPiece ? p : r, `pixel ${i / 4} is not what the drawing has`).toEqual(a);
      else expect([p, r]).toEqual([zero, zero]);
      if (isPiece) inPiece++;
    }
    expect(inPiece).toBe(33 * 8); // the blade, all of it, and nothing else
  });

  it('with the piece at rest the frame is the drawing as a whole: nothing was cut', () => {
    const withLayer = builder().build({ pose: 'bar' });
    const noLayer = pose();
    delete (noLayer as { layers?: unknown }).layers;
    const without = builder(noLayer).build({ pose: 'bar' });
    expect(Buffer.compare(Buffer.from(withLayer.image.data), Buffer.from(without.image.data))).toBe(0);
  });

  it('a blade turns about its hinge: it stays the same length and straight, and the hinge does not move — about the corner it closes on', () => {
    const rest = builder().build({ pose: 'bar' });
    const tipRest = rest.anchors['tip']!;
    for (const rot of [-50, -25, 20, 40]) {
      const f = builder().build({ pose: 'bar', move: { blade: { rot } } });
      // the corner the turn closes on stays where it was in the drawing
      const hinge = rot < 0 ? 'hinge_bot' : 'hinge_top';
      expect(dist(f.anchors[hinge]!, rest.anchors[hinge]!), `${rot}°: the ${hinge} moved`).toBeLessThan(0.0006);
      // the tip is on a circle about the hinge
      expect(Math.abs(dist(f.anchors['tip']!, f.anchors[hinge]!) - dist(tipRest, rest.anchors[hinge]!)), `${rot}°: the blade changed length`).toBeLessThan(0.001);
      // and it did turn, the way asked: negative = the tip goes up (+y up in the anchors)
      expect(Math.sign(f.anchors['tip']![1] - tipRest[1]), `${rot}°`).toBe(rot < 0 ? 1 : -1);
      // nothing was lost off the canvas, nothing was invented
      expect(Math.abs(mass(f.image) - mass(rest.image)) / mass(rest.image), `${rot}°: the mass of the picture`).toBeLessThan(0.06);
    }
  });

  it('the blade of a frame is straight: every pixel of it lies on a bar of the width it had', () => {
    const f = builder().build({ pose: 'bar', move: { blade: { rot: -35 } } });
    // the pixels of the blade are the ones of its colour (the fist and the body are darker): fit a line through them and measure how far the farthest is
    const pts: Array<[number, number]> = [];
    for (let y = 0; y < f.image.height; y++) for (let x = 0; x < f.image.width; x++) if (f.image.data[(y * f.image.width + x) * 4 + 3]! >= 200 && f.image.data[(y * f.image.width + x) * 4]! > 120) pts.push([x, y]);
    expect(pts.length).toBeGreaterThan(100);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of pts) {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
      syy += (y - my) ** 2;
    }
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const nx = -Math.sin(theta);
    const ny = Math.cos(theta);
    const across = pts.map(([x, y]) => (x - mx) * nx + (y - my) * ny);
    expect(Math.max(...across) - Math.min(...across), 'the blade is 8 pixels wide').toBeLessThan(10.5);
    // and it points where 35° up from the drawing's horizontal says
    expect(Math.abs(Math.abs(theta) - (35 * Math.PI) / 180)).toBeLessThan(0.04);
  });

  it('a piece goes over or under the rest as the rig says: over, the turned blade hides the fist it crosses', () => {
    const over1 = builder().build({ pose: 'bar', move: { blade: { rot: 80 } } });
    const under = pose();
    (under.layers!['blade'] as { z: string }).z = 'under';
    const under1 = builder(under).build({ pose: 'bar', move: { blade: { rot: 80 } } });
    // the two differ exactly where the blade crosses the fist
    expect(Buffer.compare(Buffer.from(over1.image.data), Buffer.from(under1.image.data))).not.toBe(0);
    // the "over" blade's colour (150, 150, 170) is on top at the fist; the "under" fist's colour (70, 40, 50) is
    let crossing = 0;
    for (let i = 0; i < over1.image.data.length; i += 4) {
      const a = over1.image.data[i]!;
      const b = under1.image.data[i]!;
      if (over1.image.data[i + 3]! === 255 && under1.image.data[i + 3]! === 255 && a > 120 && b < 100) crossing++;
    }
    expect(crossing).toBeGreaterThan(0);
  });

  it('`over` is the usual over: opaque on top hides, clear on top shows, half on top blends', () => {
    const px = (r: number, g: number, b: number, a: number): RgbaImage => ({ width: 1, height: 1, data: new Uint8Array([r, g, b, a]) });
    expect([...over(px(10, 20, 30, 255), px(200, 100, 50, 255)).data]).toEqual([200, 100, 50, 255]);
    expect([...over(px(10, 20, 30, 255), px(0, 0, 0, 0)).data]).toEqual([10, 20, 30, 255]);
    const half = over(px(0, 0, 0, 255), px(200, 100, 50, 128)).data;
    expect(half[3]).toBe(255);
    expect(Math.abs(half[0]! - 100)).toBeLessThanOrEqual(1);
  });
});

describe('the rig: a figure on the floor', () => {
  it('a figure laid down is drawn on a canvas that does not cut it, and rests on the pivot row with all of its mass', () => {
    const standing = builder().build({ pose: 'bar', ground: true });
    expect(lowestRow(standing.image, 96)).toBe(78);
    // turned a quarter about the feet it would fall far below the canvas: it is found, and put on the floor
    const down = builder().build({ pose: 'bar', ground: true, global: { rot: -90, dx: 50 } });
    expect(lowestRow(down.image, 96)).toBe(78);
    expect(down.groundShift).not.toBe(0);
    expect(Math.abs(mass(down.image) - mass(standing.image)) / mass(standing.image), 'nothing was lost').toBeLessThan(0.03);
    // a frame that is not asked to rest keeps the pivot: the feet of the drawing stand on it
    const free = builder().build({ pose: 'bar' });
    expect(free.groundShift).toBe(0);
  });

  it('the anchors follow the figure to the floor and down the global move', () => {
    const rest = builder().build({ pose: 'bar', ground: true });
    const moved = builder().build({ pose: 'bar', ground: true, global: { rot: -90, dx: 50 } });
    // laid on its back the tip of the blade is no longer in front of the hand but ABOVE it ... and it is as far from it as before
    expect(dist(moved.anchors['tip']!, moved.anchors['hand_r']!)).toBeCloseTo(dist(rest.anchors['tip']!, rest.anchors['hand_r']!), 2);
    expect(moved.anchors['tip']![1]).toBeGreaterThan(rest.anchors['tip']![1]);
  });
});

describe('the rig: the light of the eyes', () => {
  /** A dark face with a bright cyan eye in it. */
  function face(): RgbaImage {
    const data = new Uint8Array(40 * 40 * 4);
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const o = (y * 40 + x) * 4;
        const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20);
        data.set(d < 8 ? [120, 230, 250, 255] : [14, 20, 34, 255], o);
      }
    }
    return { width: 40, height: 40, data };
  }

  it('does nothing at 0, falls toward the dark of the face as it grows, and touches nothing outside the eye', () => {
    const img = face();
    expect(dimEyes(img, [[20, 20, 8]], 0)).toBe(img);
    const dim = dimEyes(img, [[20, 20, 8]], 0.6);
    const lum = (i: RgbaImage, x: number, y: number): number => i.data[(y * 40 + x) * 4]! + i.data[(y * 40 + x) * 4 + 1]! + i.data[(y * 40 + x) * 4 + 2]!;
    expect(lum(dim, 20, 20)).toBeLessThan(lum(img, 20, 20) * 0.6);
    const out = dimEyes(img, [[20, 20, 8]], 1);
    expect(lum(out, 20, 20)).toBeLessThan(lum(img, 20, 20) * 0.2);
    // a pixel far from the eye is the very same pixel
    expect([...dim.data.slice(0, 4)]).toEqual([...img.data.slice(0, 4)]);
    expect([...out.data.slice((39 * 40 + 39) * 4, (39 * 40 + 39) * 4 + 4)]).toEqual([14, 20, 34, 255]);
  });
});
