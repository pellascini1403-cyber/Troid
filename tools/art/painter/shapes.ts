import type { Rng } from './rng';

/** Paths the painter draws with: organic outlines, tapered strokes, blades, leaves. They draw into a 2D context with whatever fill the caller has set. */
export interface Pt {
  x: number;
  y: number;
}

/** A closed lumpy outline around (cx, cy): `lumps` bumps of relative size `rough`. */
export function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rng: Rng, lumps = 8, rough = 0.22): void {
  const n = Math.max(6, lumps * 2);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (rng.next() - 0.5) * 2 * rough;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  smoothClosed(ctx, pts);
}

/** A smooth closed curve through the midpoints of a polygon's sides. */
export function smoothClosed(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(a.x, a.y, mx, my);
  }
  const a = pts[0]!;
  const b = pts[1]!;
  ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  ctx.closePath();
}

/** Subdivides a polyline and pushes each new point sideways by noise: a straight edge becomes a hand-cut one. */
export function roughen(pts: readonly Pt[], rng: Rng, amp: number, step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    const nx = -(b.y - a.y) / (len || 1);
    const ny = (b.x - a.x) / (len || 1);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const off = k === 0 ? 0 : (rng.next() - 0.5) * 2 * amp;
      out.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off });
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** A polyline that wanders: `turn` is how much the heading may change per step (radians). */
export function wander(rng: Rng, x: number, y: number, angle: number, length: number, step: number, turn: number): Pt[] {
  const pts: Pt[] = [{ x, y }];
  let a = angle;
  for (let d = 0; d < length; d += step) {
    a += rng.gauss() * turn;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push({ x, y });
  }
  return pts;
}

/** Fills a stroke that tapers from `w0` to `w1` along `pts`. */
export function taper(ctx: CanvasRenderingContext2D, pts: readonly Pt[], w0: number, w1: number): void {
  if (pts.length < 2) return;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[Math.min(n - 1, i + 1)]!;
    const o = pts[Math.max(0, i - 1)]!;
    const dx = q.x - o.x;
    const dy = q.y - o.y;
    const l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push({ x: p.x - (dy / l) * w, y: p.y + (dx / l) * w });
    right.push({ x: p.x + (dy / l) * w, y: p.y - (dx / l) * w });
  }
  ctx.beginPath();
  ctx.moveTo(left[0]!.x, left[0]!.y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
  ctx.closePath();
  ctx.fill();
  // round the thick end
  const w = w0 / 2;
  if (w > 0.6) {
    ctx.beginPath();
    ctx.arc(pts[0]!.x, pts[0]!.y, w, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A blade of grass: a curved spike from (x, y) of height `h`, leaning by `lean` (px at the tip), `w` wide at the foot. */
export function blade(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, lean: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.3 + lean * 0.15, y - h * 0.6, x + lean, y - h);
  ctx.quadraticCurveTo(x + w * 0.3 + lean * 0.35, y - h * 0.55, x + w / 2, y);
  ctx.closePath();
  ctx.fill();
}

/** A pointed leaf of length `len` and width `wid`, pointing at `angle`, with its base at (x, y). */
export function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draws `paint` at the three horizontal offsets that make a periodic picture: what leaves one edge enters at the other. */
export function wrapX(w: number, paint: (dx: number) => void): void {
  paint(0);
  paint(-w);
  paint(w);
}
