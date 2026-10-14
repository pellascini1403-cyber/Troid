import type { RgbaImage } from './png';

/**
 * THE PUPPET WARP (docs/ART-PIPELINE-2D.md part N): how a drawing of the protagonist is made to MOVE without a pixel being drawn. The user's pose sheet has one drawing per action; an
 * animation needs the same drawing a little bent, lifted, swayed. This is the one operation that does it: a smooth, locally RIGID deformation (moving least squares, Schaefer, McPhail
 * & Warren 2006) steered by a few control points — "this point of the drawing goes here" — that moves the pixels of the drawing and invents none:
 *
 *   • every pixel of a frame is a pixel (or an area-average of a few) of the user's drawing, taken from where the warp says it was;
 *   • "rigid" means a region keeps its shape as it moves — an eye stays an eye, a blade stays straight — and only the space BETWEEN control points stretches;
 *   • control points that are not moved are pins: whatever is near them stays where it was, so a head can bob without the feet noticing;
 *   • with no point moved the warp is the identity, so a frame at rest is the drawing itself (checked by a test).
 *
 * PURE: no I/O, no randomness; the same drawing and the same points always give the same pixels (the committed frames are checked against this).
 */

export interface Pt {
  x: number;
  y: number;
}

/** A control point: where it is in the drawing (`src`) and where the frame wants it (`dst`), both in the drawing's pixels (the centre of its first pixel is 0.5, 0.5). */
export interface Pin {
  src: Pt;
  dst: Pt;
}

/** How far a control point's pull reaches: the weight of a pin at distance d is 1 / d^(2α). Higher = more local. */
export const DEFAULT_ALPHA = 1.5;

/**
 * Rigid moving least squares, THE WAY BACK: it maps a point of the frame (`dst` space) to the point of the drawing it is made from (`src` space), so a frame can be drawn by asking, for
 * each of its pixels, what colour the drawing has there.
 */
export class RigidMls {
  private readonly dx: Float64Array;
  private readonly dy: Float64Array;
  private readonly sx: Float64Array;
  private readonly sy: Float64Array;
  private readonly n: number;
  private readonly alpha: number;
  readonly identity: boolean;

  constructor(pins: readonly Pin[], alpha = DEFAULT_ALPHA) {
    this.n = pins.length;
    this.alpha = alpha;
    this.dx = new Float64Array(this.n);
    this.dy = new Float64Array(this.n);
    this.sx = new Float64Array(this.n);
    this.sy = new Float64Array(this.n);
    let identity = true;
    for (let i = 0; i < this.n; i++) {
      const p = pins[i]!;
      this.dx[i] = p.dst.x;
      this.dy[i] = p.dst.y;
      this.sx[i] = p.src.x;
      this.sy[i] = p.src.y;
      if (Math.abs(p.dst.x - p.src.x) > 1e-9 || Math.abs(p.dst.y - p.src.y) > 1e-9) identity = false;
    }
    this.identity = identity;
  }

  /** The point of the drawing that a point of the frame is made from. */
  map(x: number, y: number, out: Pt): Pt {
    if (this.identity || this.n === 0) {
      out.x = x;
      out.y = y;
      return out;
    }
    const { n, dx, dy, sx, sy, alpha } = this;
    // weights by distance to the DESTINATION points (the frame's side)
    let wSum = 0;
    let pcx = 0;
    let pcy = 0;
    let qcx = 0;
    let qcy = 0;
    const w = this.scratch;
    for (let i = 0; i < n; i++) {
      const ddx = x - dx[i]!;
      const ddy = y - dy[i]!;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < 1e-12) {
        // exactly on a control point: it goes exactly where it says
        out.x = sx[i]!;
        out.y = sy[i]!;
        return out;
      }
      // 1 / d^(2α), without a `pow` in the commonest cases (this runs for every point of every frame)
      const wi = alpha === 1.5 ? 1 / (d2 * Math.sqrt(d2)) : alpha === 1 ? 1 / d2 : Math.pow(d2, -alpha);
      w[i] = wi;
      wSum += wi;
      pcx += wi * dx[i]!;
      pcy += wi * dy[i]!;
      qcx += wi * sx[i]!;
      qcy += wi * sy[i]!;
    }
    pcx /= wSum;
    pcy /= wSum;
    qcx /= wSum;
    qcy /= wSum;
    // the best rotation (no scale) taking the weighted P-hats onto the weighted Q-hats
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      const px = dx[i]! - pcx;
      const py = dy[i]! - pcy;
      const qx = sx[i]! - qcx;
      const qy = sy[i]! - qcy;
      const wi = w[i]!;
      a += wi * (px * qx + py * qy);
      b += wi * (px * qy - py * qx);
    }
    const r = Math.hypot(a, b);
    const c = r > 1e-12 ? a / r : 1;
    const s = r > 1e-12 ? b / r : 0;
    const ux = x - pcx;
    const uy = y - pcy;
    out.x = c * ux - s * uy + qcx;
    out.y = s * ux + c * uy + qcy;
    return out;
  }

  private get scratch(): Float64Array {
    return (this._scratch ??= new Float64Array(this.n));
  }
  private _scratch: Float64Array | undefined;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ a drawing, for sampling

/** A drawing ready to be sampled: premultiplied floats, so that a soft edge blends the way light does and no fringe appears. */
export interface Drawing {
  width: number;
  height: number;
  /** 4 floats per pixel: r·a, g·a, b·a, a (0–1). */
  data: Float32Array;
  /** The pixels (inclusive) that have any alpha at all, or null for an empty drawing: what a frame can possibly be made of. */
  support: { x0: number; y0: number; x1: number; y1: number } | null;
}

export function toDrawing(img: RgbaImage): Drawing {
  const data = new Float32Array(img.width * img.height * 4);
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0, j = 0; i < img.data.length; i += 4, j += 4) {
    const a = img.data[i + 3]! / 255;
    data[j] = (img.data[i]! / 255) * a;
    data[j + 1] = (img.data[i + 1]! / 255) * a;
    data[j + 2] = (img.data[i + 2]! / 255) * a;
    data[j + 3] = a;
    if (a > 0) {
      const px = (i >> 2) % img.width;
      const py = ((i >> 2) / img.width) | 0;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
  }
  return { width: img.width, height: img.height, data, support: x1 < 0 ? null : { x0, y0, x1, y1 } };
}

/** Bilinear sample of the drawing at a continuous point (pixel centres at +0.5), adding the four premultiplied channels × `weight` into `acc`. Outside the drawing it is transparent. */
function sampleInto(d: Drawing, x: number, y: number, weight: number, acc: Float64Array): void {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const { width, height, data } = d;
  for (let k = 0; k < 4; k++) {
    const ix = x0 + (k & 1);
    const iy = y0 + (k >> 1);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue;
    const wgt = ((k & 1) === 0 ? 1 - tx : tx) * ((k >> 1) === 0 ? 1 - ty : ty) * weight;
    if (wgt === 0) continue;
    const o = (iy * width + ix) * 4;
    acc[0]! += data[o]! * wgt;
    acc[1]! += data[o + 1]! * wgt;
    acc[2]! += data[o + 2]! * wgt;
    acc[3]! += data[o + 3]! * wgt;
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ a global affine

/** x' = a·x + c·y + e, y' = b·x + d·y + f. */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function invert(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) throw new Error('a singular transform cannot be inverted');
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

/** A rotation (degrees, clockwise on screen — +y down) and a scale about a point, then a shift. */
export function about(p: Pt, o: { rot?: number; sx?: number; sy?: number; dx?: number; dy?: number }): Affine {
  const t = ((o.rot ?? 0) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const sx = o.sx ?? 1;
  const sy = o.sy ?? 1;
  // M = T(p + shift) · R · S · T(−p)
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  return { a, b, c, d, e: p.x + (o.dx ?? 0) - (a * p.x + c * p.y), f: p.y + (o.dy ?? 0) - (b * p.x + d * p.y) };
}

/** The transform that does `b` first and then `a`. */
export function compose(a: Affine, b: Affine): Affine {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}

export function isIdentity(m: Affine, eps = 1e-9): boolean {
  return Math.abs(m.a - 1) < eps && Math.abs(m.b) < eps && Math.abs(m.c) < eps && Math.abs(m.d - 1) < eps && Math.abs(m.e) < eps && Math.abs(m.f) < eps;
}

export function apply(m: Affine, p: Pt, out: Pt = { x: 0, y: 0 }): Pt {
  const x = m.a * p.x + m.c * p.y + m.e;
  const y = m.b * p.x + m.d * p.y + m.f;
  out.x = x;
  out.y = y;
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ rendering a frame

export interface Target {
  /** Size of the output image in its own pixels. */
  width: number;
  height: number;
  /** Output pixels per drawing pixel (the frame is smaller than the drawing: ~0.55). */
  scale: number;
  /** The point of the frame space (the drawing's own units) at the top-left corner of the output. */
  origin: Pt;
}

export interface RenderOptions {
  /** The warp, from the frame to the drawing; `null` = none. */
  warp: RigidMls | null;
  /** A transform of the whole figure applied after the warp (a tilt, a topple, a squash about the feet). */
  global?: Affine;
  /** Sub-samples per output pixel along each axis (area sampling); default 3. */
  samples?: number;
}

/**
 * Draws one frame: for each pixel of the output, the average over its area of what the drawing has at the point the (global transform, then warp) say it is made from. Returns straight
 * (non-premultiplied) RGBA, the form the packer takes.
 *
 * The warp is evaluated once at every CORNER of every output pixel (a lattice of the map), and the points inside a pixel are read off that lattice by bilinear interpolation: the map is
 * smooth over the span of one output pixel, so this is the same picture as asking the warp for every sample, at a ninth of the cost. A pixel whose four corners all come from outside the
 * drawing's pixels is empty without being sampled.
 */
export function renderFrame(drawing: Drawing, target: Target, options: RenderOptions): RgbaImage {
  const { width, height, scale, origin } = target;
  const samples = options.samples ?? 3;
  const inv = options.global ? invert(options.global) : null;
  const warp = options.warp && !options.warp.identity ? options.warp : null;
  const out = new Uint8Array(width * height * 4);
  const sup = drawing.support;
  if (!sup) return { width, height, data: out };

  const lw = width + 1;
  const mx = new Float64Array(lw * (height + 1));
  const my = new Float64Array(lw * (height + 1));
  const p: Pt = { x: 0, y: 0 };
  const q: Pt = { x: 0, y: 0 };
  for (let j = 0; j <= height; j++) {
    for (let i = 0; i <= width; i++) {
      p.x = origin.x + i / scale;
      p.y = origin.y + j / scale;
      if (inv) apply(inv, p, p);
      if (warp) warp.map(p.x, p.y, q);
      else {
        q.x = p.x;
        q.y = p.y;
      }
      mx[j * lw + i] = q.x;
      my[j * lw + i] = q.y;
    }
  }

  // what the bilinear read of the drawing can reach: its pixels, and one more all round
  const rx0 = sup.x0 - 1;
  const ry0 = sup.y0 - 1;
  const rx1 = sup.x1 + 2;
  const ry1 = sup.y1 + 2;
  const acc = new Float64Array(4);
  const weight = 1 / (samples * samples);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const a00 = j * lw + i;
      const a10 = a00 + 1;
      const a01 = a00 + lw;
      const a11 = a01 + 1;
      const minX = Math.min(mx[a00]!, mx[a10]!, mx[a01]!, mx[a11]!);
      const maxX = Math.max(mx[a00]!, mx[a10]!, mx[a01]!, mx[a11]!);
      const minY = Math.min(my[a00]!, my[a10]!, my[a01]!, my[a11]!);
      const maxY = Math.max(my[a00]!, my[a10]!, my[a01]!, my[a11]!);
      if (maxX < rx0 || minX > rx1 || maxY < ry0 || minY > ry1) continue;
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      for (let sj = 0; sj < samples; sj++) {
        const v = (sj + 0.5) / samples;
        for (let si = 0; si < samples; si++) {
          const u = (si + 0.5) / samples;
          const x = (mx[a00]! * (1 - u) + mx[a10]! * u) * (1 - v) + (mx[a01]! * (1 - u) + mx[a11]! * u) * v;
          const y = (my[a00]! * (1 - u) + my[a10]! * u) * (1 - v) + (my[a01]! * (1 - u) + my[a11]! * u) * v;
          sampleInto(drawing, x, y, weight, acc);
        }
      }
      const a = acc[3]!;
      if (a <= 1 / 512) continue; // nothing there (a transparent pixel stays transparent black)
      const o = (j * width + i) * 4;
      const inva = 1 / a;
      out[o] = clamp8(acc[0]! * inva * 255);
      out[o + 1] = clamp8(acc[1]! * inva * 255);
      out[o + 2] = clamp8(acc[2]! * inva * 255);
      out[o + 3] = clamp8(a * 255);
    }
  }
  return { width, height, data: out };
}

const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
