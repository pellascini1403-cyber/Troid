import { describe, expect, it } from 'vitest';
import {
  alongPolyline, contourSegments, darken, ellipsePoly, lighten, mirrored, mix, outwardNormals, placed, rimBands, sampleContour, signedArea, taperedOutline, type Pt,
} from '@/rigs/kit/geometry';

/** A circle as a polygon, counter-clockwise (y up), `n` points. */
const circle = (r: number, n = 32, ccw = true): Pt[] => Array.from({ length: n }, (_, i) => {
  const a = ((ccw ? i : -i) / n) * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r] as const;
});

describe('geometry of the rigs: outlines', () => {
  it('a closed outline has one Bézier per point and an open one has one fewer', () => {
    const pts: Pt[] = [[0, 0], [10, 5], [20, 0], [10, -5]];
    expect(contourSegments(pts)).toHaveLength(4);
    expect(contourSegments(pts, { closed: false })).toHaveLength(3);
  });

  it('the curve ends where the next point is, and a closed outline comes back to its start', () => {
    const pts: Pt[] = [[0, 0], [10, 5], [20, 0], [10, -5]];
    const segs = contourSegments(pts);
    for (let i = 0; i < segs.length; i++) {
      const end = pts[(i + 1) % pts.length]!;
      expect([segs[i]![4], segs[i]![5]]).toEqual([end[0], end[1]]);
    }
  });

  it('a sharp point keeps its corner: the tangent handles on it collapse onto it', () => {
    const pts: Pt[] = [[0, 0], [10, 10], [20, 0], [10, -10]];
    const smooth = contourSegments(pts, { round: 1 });
    const sharp = contourSegments(pts, { round: 1, sharp: [1] });
    // segment 0 ends at point 1: its second control point is the point itself when sharp
    expect([sharp[0]![2], sharp[0]![3]]).toEqual([10, 10]);
    expect([smooth[0]![2], smooth[0]![3]]).not.toEqual([10, 10]);
  });

  it('sampling gives `per` points on every segment', () => {
    const pts: Pt[] = [[0, 0], [10, 5], [20, 0], [10, -5]];
    expect(sampleContour(pts, {}, 6)).toHaveLength(24);
    expect(sampleContour(pts, { closed: false }, 6)).toHaveLength(19);
  });

  it('the signed area is positive counter-clockwise and the area of a circle is πr²', () => {
    expect(signedArea(circle(10, 256))).toBeGreaterThan(0);
    expect(signedArea(circle(10, 256, false))).toBeLessThan(0);
    expect(Math.abs(signedArea(circle(10, 512)))).toBeCloseTo(Math.PI * 100, 0);
  });

  it('mirroring a half outline closes it across the axis', () => {
    const half: Pt[] = [[0, 10], [5, 6], [6, 0], [4, -6], [0, -8]];
    const full = mirrored(half);
    expect(full).toHaveLength(half.length + half.length - 2);
    expect(full.some((p) => p[0] < 0)).toBe(true);
    expect(Math.abs(signedArea(full))).toBeGreaterThan(0);
  });

  it('a tapered limb is as long as asked and narrows from the joint to the tip', () => {
    const o = taperedOutline(30, 8, 3);
    const xs = o.map((p) => p[0]);
    expect(Math.max(...xs)).toBeGreaterThan(30);
    expect(Math.min(...xs)).toBeLessThan(0);
    const widthAt = (x: number): number => {
      const ys = o.filter((p) => Math.abs(p[0] - x) < 1.5).map((p) => p[1]);
      return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    };
    expect(widthAt(0)).toBeGreaterThan(widthAt(30));
  });

  it('points are placed, scaled and found along a polyline', () => {
    expect(placed([[1, 2]], 10, 20, 2)).toEqual([[12, 24]]);
    const line: Pt[] = [[0, 0], [10, 0], [10, 10]];
    expect(alongPolyline(line, 0).p).toEqual([0, 0]);
    expect(alongPolyline(line, 0.5).p).toEqual([10, 0]);
    expect(alongPolyline(line, 1).p).toEqual([10, 10]);
    expect(alongPolyline(line, 0.25).angle).toBeCloseTo(0, 6);
    expect(alongPolyline(line, 0.75).angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('an ellipse polygon is turned counter-clockwise by its rotation', () => {
    const flat = ellipsePoly(0, 0, 10, 2, 0, 4);
    expect(flat.slice(0, 2)).toEqual([10, 0]);
    const turned = ellipsePoly(0, 0, 10, 2, Math.PI / 2, 4);
    expect(turned[0]).toBeCloseTo(0, 6);
    expect(turned[1]).toBeCloseTo(10, 6);
  });
});

describe('geometry of the rigs: the light on the edge', () => {
  it('the normals of a polygon point OUT, whichever way it is wound, and are unit vectors', () => {
    for (const ccw of [true, false]) {
      const poly = circle(10, 40, ccw);
      const normals = outwardNormals(poly);
      normals.forEach((n, i) => {
        expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 6);
        // the normal of a point of a circle is the point itself, normalised
        const p = poly[i]!;
        expect(n[0] * p[0] + n[1] * p[1]).toBeGreaterThan(9.5);
      });
    }
  });

  it('a band of light runs only along the edges that face the light, and is never wider than asked', () => {
    const poly = circle(20, 64);
    const bands = rimBands(poly, { dir: [0, 1], width: 3 });
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      const pts: Pt[] = [];
      for (let i = 0; i < band.length; i += 2) pts.push([band[i]!, band[i + 1]!]);
      // every point of the band is in the upper half (the side that faces the light) …
      expect(pts.every((p) => p[1] > -3)).toBe(true);
      // … and on or inside the outline, at most `width` in
      for (const p of pts) {
        const r = Math.hypot(p[0], p[1]);
        expect(r).toBeLessThanOrEqual(20.0001);
        expect(r).toBeGreaterThanOrEqual(20 - 3.0001);
      }
    }
  });

  it('the light from the other side lights the other side', () => {
    const poly = circle(20, 64);
    const up = rimBands(poly, { dir: [0, 1], width: 3 }).flat();
    const down = rimBands(poly, { dir: [0, -1], width: 3 }).flat();
    const meanY = (flat: number[]): number => flat.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) / (flat.length / 2);
    expect(meanY(up)).toBeGreaterThan(5);
    expect(meanY(down)).toBeLessThan(-5);
  });

  it('a long flat shape lit from its end is lit at that end only', () => {
    // a slab 40 × 2 with a point every 2 cm along its edges, lit from the right
    const poly: Pt[] = [];
    for (let x = -20; x < 20; x += 2) poly.push([x, -1]);
    for (let y = -1; y < 1; y += 1) poly.push([20, y]);
    for (let x = 20; x > -20; x -= 2) poly.push([x, 1]);
    for (let y = 1; y > -1; y -= 1) poly.push([-20, y]);
    const bands = rimBands(poly, { dir: [1, 0], width: 3, power: 1 });
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) for (let i = 0; i < band.length; i += 2) expect(band[i]!).toBeGreaterThanOrEqual(16.99);
  });

  it('nothing is drawn where the light would be thinner than the cut', () => {
    expect(rimBands(circle(1, 8), { dir: [0, 1], width: 0.0001, cut: 2 })).toEqual([]);
  });
});

describe('geometry of the rigs: colour', () => {
  it('mixes channel by channel, and lightens and darkens toward white and black', () => {
    expect(mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mix(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    expect(lighten(0x102030, 1)).toBe(0xffffff);
    expect(darken(0x102030, 1)).toBe(0x000000);
    expect(darken(0x808080, 0.5)).toBe(0x404040);
  });
});
