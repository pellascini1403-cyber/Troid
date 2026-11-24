/**
 * The geometry of the rigs (docs/PROMPT24-LOG.md): pure maths, no renderer. A creature is authored in CENTIMETRES, x FORWARD (the way it faces) and y UP from its feet — the way a person draws it — and the kit flips y when
 * it speaks to Pixi. Outlines are a handful of points joined by a smooth curve (a Catmull–Rom spline written as Béziers, so the drawing is made of curves and not of a hundred segments), and the light that makes them
 * read as glossy bodies — the thin bright edge on the side the light comes from, the lens of gloss — is computed from the outline itself.
 */

export type Pt = readonly [number, number];
/** A cubic Bézier segment as the pen wants it: first control, second control, end point. */
export type Seg = readonly [c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number];

export interface ContourOptions {
  /** A closed outline (default) or an open stroke (a limb, a tail). */
  closed?: boolean;
  /** How round the corners of the control polygon are: 0 straight lines, 1 the Catmull–Rom curve (default), more bulges. */
  round?: number;
  /** Indices of the points that stay SHARP: a claw, the tip of a wing, a horn. */
  sharp?: readonly number[];
}

/** The Béziers of a smooth curve through `pts`. The first one starts where the last point of the previous one ended (`pts[0]`). */
export function contourSegments(pts: readonly Pt[], o: ContourOptions = {}): Seg[] {
  const n = pts.length;
  const closed = o.closed ?? true;
  const k = (o.round ?? 1) / 6;
  const sharp = new Set(o.sharp ?? []);
  const at = (i: number): Pt => {
    if (closed) return pts[((i % n) + n) % n]!;
    return pts[Math.max(0, Math.min(n - 1, i))]!;
  };
  const out: Seg[] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const s1 = sharp.has(((i % n) + n) % n);
    const s2 = sharp.has((((i + 1) % n) + n) % n);
    const c1: Pt = s1 ? p1 : [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = s2 ? p2 : [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    out.push([c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]]);
  }
  return out;
}

/** A point of the cubic Bézier that begins at `a` and is described by `s`, at `t` ∈ [0, 1]. */
export function bezierAt(a: Pt, s: Seg, t: number): Pt {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [w0 * a[0] + w1 * s[0] + w2 * s[2] + w3 * s[4], w0 * a[1] + w1 * s[1] + w2 * s[3] + w3 * s[5]];
}

/** The outline as a polyline: `per` samples on every segment (the last point of a closed outline is NOT repeated). */
export function sampleContour(pts: readonly Pt[], o: ContourOptions = {}, per = 6): Pt[] {
  const segs = contourSegments(pts, o);
  const out: Pt[] = [];
  let a: Pt = pts[0]!;
  for (const s of segs) {
    for (let j = 0; j < per; j++) out.push(bezierAt(a, s, j / per));
    a = [s[4], s[5]];
  }
  if (!(o.closed ?? true)) out.push(a);
  return out;
}

/** The signed area (positive when the polygon runs counter-clockwise, y up). */
export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** The outward unit normals of a closed polygon, one per point (whatever its winding). */
export function outwardNormals(poly: readonly Pt[]): Pt[] {
  const n = poly.length;
  const ccw = signedArea(poly) >= 0;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n]!;
    const b = poly[(i + 1) % n]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // for a counter-clockwise polygon the outside is on the right of the direction of travel
    out.push(ccw ? [dy / len, -dx / len] : [-dy / len, dx / len]);
  }
  return out;
}

export interface RimSpec {
  /** Where the light comes from (a direction, need not be a unit vector): the edge that faces it is lit. */
  dir: Pt;
  /** The widest the lit band gets (cm), where the edge faces the light head-on. */
  width: number;
  /** How quickly the band thins away from the light: 1 gently, 3 only the very edge. */
  power?: number;
  /** Below this share of the width the band is not drawn at all. */
  cut?: number;
}

/**
 * The bands of light along the edge of a closed outline: wherever the edge faces `dir`, a sliver as wide as `width · cosᵖ` runs along the outline and fades to nothing on either side, like the thin bright edge on the lit side of
 * a body in the references. Returns one polygon per stretch of lit edge (a flat list of x, y pairs).
 */
export function rimBands(poly: readonly Pt[], spec: RimSpec): number[][] {
  const n = poly.length;
  const normals = outwardNormals(poly);
  const L = Math.hypot(spec.dir[0], spec.dir[1]) || 1;
  const lx = spec.dir[0] / L;
  const ly = spec.dir[1] / L;
  const power = spec.power ?? 1.6;
  const cut = spec.cut ?? 0.04;
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = normals[i]![0] * lx + normals[i]![1] * ly;
    w.push(d > 0 ? spec.width * d ** power : 0);
  }
  const lit = w.map((x) => x > spec.width * cut);
  if (lit.every(Boolean)) {
    // the whole outline is lit (a ring): one band, closed
    const outer = poly.map((p) => [p[0], p[1]] as const);
    const inner = poly.map((p, i) => [p[0] - normals[i]![0] * w[i]!, p[1] - normals[i]![1] * w[i]!] as const);
    return [[...outer.flat(), ...inner.reverse().flat()]];
  }
  // start at an unlit point so that no stretch is split by the seam of the array
  let start = lit.findIndex((x) => !x);
  if (start < 0) start = 0;
  const bands: number[][] = [];
  let run: number[] = [];
  const flush = (): void => {
    if (run.length >= 3) {
      const outer: number[] = [];
      const inner: number[] = [];
      for (const i of run) {
        const p = poly[i]!;
        outer.push(p[0], p[1]);
        // the inner edge runs back the way the outer one came: each new pair goes to the FRONT (still x, y in that order)
        inner.unshift(p[0] - normals[i]![0] * w[i]!, p[1] - normals[i]![1] * w[i]!);
      }
      bands.push([...outer, ...inner]);
    }
    run = [];
  };
  for (let s = 0; s < n; s++) {
    const i = (start + s) % n;
    if (lit[i]) run.push(i);
    else flush();
  }
  flush();
  return bands;
}

/** An ellipse as a polygon (`steps` points), turned by `rot` radians counter-clockwise: for a lens of gloss. */
export function ellipsePoly(cx: number, cy: number, rx: number, ry: number, rot = 0, steps = 20): number[] {
  const out: number[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}

/** A tapered limb along +x: `len` long, `w0` wide at the joint and `w1` at the tip, with a round end. The outline of one segment of a leg, an arm, a tentacle. */
export function taperedOutline(len: number, w0: number, w1: number): Pt[] {
  const h0 = w0 / 2;
  const h1 = w1 / 2;
  return [
    [-h0 * 0.35, 0],
    [0, h0],
    [len * 0.5, (h0 + h1) / 2],
    [len, h1],
    [len + h1 * 0.55, 0],
    [len, -h1],
    [len * 0.5, -(h0 + h1) / 2],
    [0, -h0],
  ];
}

/** The mirror of a half outline across the vertical axis `x = axis`: `half` runs down the right-hand side from the top; the result is the closed outline (top, right side, bottom, left side). */
export function mirrored(half: readonly Pt[], axis = 0): Pt[] {
  const left = half
    .slice(1, -1)
    .reverse()
    .map((p) => [2 * axis - p[0], p[1]] as const);
  return [...half, ...left];
}

/** Moves every point: a copy of an outline, translated and scaled about the origin. */
export function placed(pts: readonly Pt[], dx = 0, dy = 0, sx = 1, sy = sx): Pt[] {
  return pts.map((p) => [p[0] * sx + dx, p[1] * sy + dy] as const);
}

/** A point on the polyline at the fraction `t` of its length. */
export function alongPolyline(pts: readonly Pt[], t: number): { p: Pt; angle: number } {
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const l = Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
    lens.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]! || i === lens.length - 1) {
      const f = lens[i]! > 0 ? Math.min(1, d / lens[i]!) : 0;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    d -= lens[i]!;
  }
  return { p: pts[0]!, angle: 0 };
}

// ------------------------------------------------------------------------------------------------------- colour

const ch = (c: number, s: number): number => (c >> s) & 255;

/** Two colours blended: `t` 0 gives `a`, 1 gives `b`. */
export function mix(a: number, b: number, t: number): number {
  const r = Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * t);
  const g = Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * t);
  const bl = Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * t);
  return (r << 16) | (g << 8) | bl;
}

/** A colour made lighter (toward white) by `t`. */
export const lighten = (c: number, t: number): number => mix(c, 0xffffff, t);
/** A colour made darker (toward black) by `t`. */
export const darken = (c: number, t: number): number => mix(c, 0x000000, t);
