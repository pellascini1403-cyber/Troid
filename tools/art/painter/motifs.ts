import { Rng } from './rng';
import { blade, blobPath, roughen, taper, wander, type Pt } from './shapes';
import type { Box } from './silhouette';
import type { Draw } from './forms';

/**
 * The motifs of the zones past the Ruins (docs/PROMPT23-LOG.md §5): the same kind of shape as `forms.ts` — each one returns a drawing function (`ctx`, `dx`) that fills it in the current fill style, and
 * the box it covers — for the things those zones are made of: the stalactites and crystals of a mine, the beams and pipes of a foundry, the towers and bells of a spire, the ribs of a heart, the stilts
 * and mushrooms of a mire. Units are pixels of the strip they are drawn in, y down: a motif that stands has its foot at `baseY`, one that hangs has its root at `topY`.
 */
export interface Form {
  draw: Draw;
  box: Box;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Fills a polygon at an offset. */
function poly(ctx: CanvasRenderingContext2D, pts: readonly Pt[], dx: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x + dx, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x + dx, pts[i]!.y);
  ctx.closePath();
  ctx.fill();
}

/** A straight bar from (x0, y0) to (x1, y1), `t0` thick at the start and `t1` at the end. */
export function bar(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t0: number, t1 = t0): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  ctx.beginPath();
  ctx.moveTo(x0 + (nx * t0) / 2, y0 + (ny * t0) / 2);
  ctx.lineTo(x1 + (nx * t1) / 2, y1 + (ny * t1) / 2);
  ctx.lineTo(x1 - (nx * t1) / 2, y1 - (ny * t1) / 2);
  ctx.lineTo(x0 - (nx * t0) / 2, y0 - (ny * t0) / 2);
  ctx.closePath();
  ctx.fill();
}

// -------------------------------------------------------------------------------------------------------------------------------- rock and crystal

/** A stalactite hanging from `topY`: a spike that thins to its tip, a little crooked, its edges chipped. */
export function stalactite(rng: Rng, x: number, topY: number, len: number, w: number): Form {
  const lean = rng.gauss() * w * 0.25;
  const n = 9;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const half = (w / 2) * (1 - t) ** 0.85 * (1 + (rng.next() - 0.5) * 0.28);
    const cx = x + lean * t * t;
    left.push({ x: cx - half, y: topY + len * t });
    right.push({ x: cx + half * (1 + (rng.next() - 0.5) * 0.2), y: topY + len * t });
  }
  const pts = [...left, ...right.reverse()];
  return { draw: (ctx, dx) => poly(ctx, pts, dx), box: { x0: x - w, x1: x + w, y0: topY - 2, y1: topY + len + 2 } };
}

/** A stalagmite: the same, rising from `baseY`. */
export function stalagmite(rng: Rng, x: number, baseY: number, len: number, w: number): Form {
  const s = stalactite(rng, x, 0, len, w);
  return {
    draw: (ctx, dx) => {
      ctx.save();
      ctx.translate(0, baseY);
      ctx.scale(1, -1);
      s.draw(ctx, dx);
      ctx.restore();
    },
    box: { x0: x - w, x1: x + w, y0: baseY - len - 2, y1: baseY + 2 },
  };
}

/** A cluster of crystals: prisms with a point on top, the tallest in the middle, tilted a little each way. They are light as well as shape: the caller can make them shine. */
export function crystalCluster(rng: Rng, cx: number, baseY: number, h: number, w: number): Form {
  const n = rng.int(3, 6);
  const prisms: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const mid = n === 1 ? 0 : i / (n - 1) - 0.5;
    const ox = cx + mid * w * 0.9 + rng.gauss() * w * 0.04;
    const hi = h * (1 - Math.abs(mid) * 1.1) * rng.range(0.65, 1);
    const wi = w * rng.range(0.15, 0.26);
    const tilt = mid * 0.55 + rng.gauss() * 0.12;
    const dxn = Math.sin(tilt);
    const dyn = -Math.cos(tilt);
    const px = Math.cos(tilt);
    const py = Math.sin(tilt);
    const bx = ox;
    const by = baseY + rng.range(0, h * 0.04);
    const sh = 0.76 + rng.next() * 0.08;
    prisms.push([
      { x: bx - px * wi * 0.5, y: by - py * wi * 0.5 },
      { x: bx + px * wi * 0.5, y: by + py * wi * 0.5 },
      { x: bx + dxn * hi * sh + px * wi * 0.5, y: by + dyn * hi * sh + py * wi * 0.5 },
      { x: bx + dxn * hi + px * wi * 0.1, y: by + dyn * hi + py * wi * 0.1 },
      { x: bx + dxn * hi * sh - px * wi * 0.5, y: by + dyn * hi * sh - py * wi * 0.5 },
    ]);
  }
  const draw: Draw = (ctx, dx) => {
    for (const p of prisms) poly(ctx, p, dx);
  };
  return { draw, box: { x0: cx - w * 1.2, x1: cx + w * 1.2, y0: baseY - h * 1.2, y1: baseY + 4 } };
}

/** A mass of rock standing on `baseY`: a jagged outline of crags, one or two of them tall, with a spur or two on the flanks. */
export function rockMass(rng: Rng, cx: number, baseY: number, w: number, h: number): Form {
  const pts: Pt[] = [{ x: cx - w / 2, y: baseY + 3 }];
  const n = Math.max(5, Math.round(w / (h * 0.2)));
  const peaks = Array.from({ length: rng.int(1, 2) }, () => rng.range(0.25, 0.75));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const shape = Math.sin(t * Math.PI) ** 0.6;
    const peak = peaks.reduce((m, p) => Math.max(m, 1 - Math.abs(t - p) * 2.2), 0);
    const up = clamp01c(0.25 + 0.45 * peak + 0.3 * rng.next());
    pts.push({ x: cx - w / 2 + w * t + (rng.next() - 0.5) * (w / n) * 0.6, y: baseY - h * up * shape });
  }
  pts.push({ x: cx + w / 2, y: baseY + 3 });
  const rough = roughen(pts, rng, h * 0.045, Math.max(6, h * 0.08));
  return { draw: (ctx, dx) => poly(ctx, rough, dx), box: { x0: cx - w * 0.6, x1: cx + w * 0.6, y0: baseY - h - 6, y1: baseY + 4 } };
}

const clamp01c = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A mass of rock that hangs from the top: the ceiling of a cave, its lower edge in teeth. */
export function ceilingMass(rng: Rng, cx: number, topY: number, w: number, h: number): Form {
  const pts: Pt[] = [{ x: cx - w / 2, y: topY - 3 }];
  const n = Math.max(4, Math.round(w / (h * 0.5)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const shape = Math.sin(t * Math.PI) ** 0.6;
    pts.push({ x: cx - w / 2 + w * t, y: topY + h * (0.3 + 0.7 * rng.next()) * shape });
  }
  pts.push({ x: cx + w / 2, y: topY - 3 });
  const rough = roughen(pts, rng, h * 0.07, Math.max(8, h * 0.12));
  return { draw: (ctx, dx) => poly(ctx, rough, dx), box: { x0: cx - w * 0.6, x1: cx + w * 0.6, y0: topY - 6, y1: topY + h + 6 } };
}

// -------------------------------------------------------------------------------------------------------------------------------- timber and iron

/** A frame of timber: two posts, a lintel across them and a brace at each corner, a little out of true — the mouth of a gallery. `broken` drops a post and tilts the lintel. */
export function timberFrame(rng: Rng, cx: number, baseY: number, w: number, h: number, beam: number, broken = false): Form {
  const tilt = broken ? rng.range(0.05, 0.1) * (rng.chance(0.5) ? 1 : -1) : rng.gauss() * 0.01;
  const lh = h * rng.range(0.92, 1);
  const brace = Math.min(w * 0.22, h * 0.25);
  const draw: Draw = (ctx, dx) => {
    const l = cx + dx - w / 2;
    const r = cx + dx + w / 2;
    const top = baseY - lh;
    ctx.fillRect(l - beam / 2, top + beam * 0.2, beam, lh - beam * 0.2 + 2);
    if (!broken) ctx.fillRect(r - beam / 2, top + beam * 0.2, beam, lh - beam * 0.2 + 2);
    else ctx.fillRect(r - beam / 2, baseY - lh * 0.45, beam, lh * 0.45 + 2);
    ctx.save();
    ctx.translate(cx + dx, top);
    ctx.rotate(tilt);
    ctx.fillRect(-w / 2 - beam * 0.8, -beam * 0.45, w + beam * 1.6, beam * 1.1);
    ctx.restore();
    bar(ctx, l, top + beam * 0.5 + brace, l + brace, top + beam * 0.5, beam * 0.55);
    if (!broken) bar(ctx, r, top + beam * 0.5 + brace, r - brace, top + beam * 0.5, beam * 0.55);
    // a footing under each post
    ctx.fillRect(l - beam * 0.9, baseY - beam * 0.35, beam * 1.8, beam * 0.5);
    ctx.fillRect(r - beam * 0.9, baseY - beam * 0.35, beam * 1.8, beam * 0.5);
  };
  return { draw, box: { x0: cx - w / 2 - beam * 2, x1: cx + w / 2 + beam * 2, y0: baseY - lh - beam * 2, y1: baseY + 2 } };
}

/** A post of timber from `y0` down to `y1`: a beam whose end is cut on a slant, with a few cuts across it — a stilt, a prop. */
export function postOf(rng: Rng, x: number, y0: number, y1: number, thick: number): Form {
  const lean = rng.gauss() * thick * 0.25;
  const slant = thick * rng.range(0.2, 1.4) * (rng.chance(0.5) ? 1 : -1);
  const cuts = Array.from({ length: rng.int(1, 3) }, () => rng.range(0.15, 0.85));
  const draw: Draw = (ctx, dx) => {
    const top = Math.min(y0, y1);
    const bot = Math.max(y0, y1);
    ctx.beginPath();
    ctx.moveTo(x + dx - thick / 2, bot + 2);
    ctx.lineTo(x + dx - thick / 2 + lean, top + (slant > 0 ? slant : 0));
    ctx.lineTo(x + dx + lean, top - thick * 0.15);
    ctx.lineTo(x + dx + thick / 2 + lean, top + (slant < 0 ? -slant : 0));
    ctx.lineTo(x + dx + thick * 0.52, bot + 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (const c of cuts) ctx.fillRect(x + dx - thick, lerp(top, bot, c), thick * 2, Math.max(1, thick * 0.07));
    ctx.globalCompositeOperation = 'source-over';
  };
  return { draw, box: { x0: x - thick - Math.abs(lean), x1: x + thick + Math.abs(lean), y0: Math.min(y0, y1) - 4, y1: Math.max(y0, y1) + 4 } };
}

/** A vertical pipe with flanges along it, and at the foot or the head an elbow that turns into a horizontal run (`turn`: −1 left, 1 right, 0 none). */
export function pipe(rng: Rng, x: number, y0: number, y1: number, r: number, turn: -1 | 0 | 1 = 0, run = 0): Form {
  const flanges = Math.max(1, Math.round(Math.abs(y1 - y0) / (r * 9)));
  const offs = Array.from({ length: flanges }, (_, i) => (i + 0.5 + (rng.next() - 0.5) * 0.4) / flanges);
  const draw: Draw = (ctx, dx) => {
    const top = Math.min(y0, y1);
    const bot = Math.max(y0, y1);
    ctx.fillRect(x + dx - r, top, r * 2, bot - top);
    for (const o of offs) {
      ctx.fillRect(x + dx - r * 1.4, lerp(top, bot, o) - r * 0.35, r * 2.8, r * 0.7);
    }
    if (turn !== 0 && run > 0) {
      const ty = y0 < y1 ? top + r : bot - r;
      ctx.beginPath();
      ctx.arc(x + dx + turn * r * 2, ty, r * 2, turn === 1 ? Math.PI : 0, turn === 1 ? Math.PI * 1.5 : Math.PI * 1.5, turn === -1);
      ctx.arc(x + dx + turn * r * 2, ty, r, turn === 1 ? Math.PI * 1.5 : Math.PI * 1.5, turn === 1 ? Math.PI : 0, turn === 1);
      ctx.closePath();
      ctx.fill();
      const x0 = x + dx + turn * r * 2;
      ctx.fillRect(Math.min(x0, x0 + turn * run), ty - r * 2 - r, Math.abs(run), r * 2);
    }
  };
  return { draw, box: { x0: x - r * 1.6 - (turn === -1 ? run + r * 2 : 0), x1: x + r * 1.6 + (turn === 1 ? run + r * 2 : 0), y0: Math.min(y0, y1) - r * 4, y1: Math.max(y0, y1) + r * 2 } };
}

/** A horizontal run of pipe from `x0` to `x1` at `y`, with flanges and a bracket down to the floor every so often. */
export function pipeRun(rng: Rng, x0: number, x1: number, y: number, r: number, floorY: number | null = null): Form {
  const n = Math.max(2, Math.round((x1 - x0) / (r * 11)));
  const flanges = Array.from({ length: n }, (_, i) => x0 + ((i + 0.5 + (rng.next() - 0.5) * 0.3) / n) * (x1 - x0));
  const draw: Draw = (ctx, dx) => {
    ctx.fillRect(x0 + dx, y - r, x1 - x0, r * 2);
    for (const f of flanges) ctx.fillRect(f + dx - r * 0.35, y - r * 1.4, r * 0.7, r * 2.8);
    if (floorY !== null) for (let i = 1; i < n; i += 2) ctx.fillRect(flanges[i]! + dx - r * 0.4, y + r, r * 0.8, floorY - y - r);
  };
  return { draw, box: { x0: x0 - 2, x1: x1 + 2, y0: y - r * 1.6, y1: floorY ?? y + r * 1.6 } };
}

/** A chimney: a tapered shaft with bands and a flared rim. */
export function chimney(rng: Rng, cx: number, baseY: number, h: number, wb: number, wt: number): Form {
  const bands = Array.from({ length: rng.int(2, 4) }, () => rng.range(0.15, 0.8));
  const draw: Draw = (ctx, dx) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx - wb / 2, baseY + 2);
    ctx.lineTo(cx + dx - wt / 2, baseY - h);
    ctx.lineTo(cx + dx + wt / 2, baseY - h);
    ctx.lineTo(cx + dx + wb / 2, baseY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx + dx - wt * 0.68, baseY - h - wt * 0.12, wt * 1.36, wt * 0.3);
    for (const b of bands) {
      const t = b;
      const wy = lerp(wt, wb, t);
      ctx.fillRect(cx + dx - wy * 0.54, baseY - h + h * t, wy * 1.08, Math.max(2, wt * 0.1));
    }
  };
  return { draw, box: { x0: cx - wb, x1: cx + wb, y0: baseY - h - wt * 0.3, y1: baseY + 3 } };
}

/** A tank: a drum with a domed top, a belt or two and legs under it. */
export function tank(rng: Rng, cx: number, baseY: number, w: number, h: number, legs = 0): Form {
  const belts = Array.from({ length: rng.int(1, 3) }, () => rng.range(0.2, 0.85));
  const draw: Draw = (ctx, dx) => {
    const top = baseY - legs - h;
    ctx.beginPath();
    ctx.moveTo(cx + dx - w / 2, baseY - legs);
    ctx.lineTo(cx + dx - w / 2, top + w * 0.22);
    ctx.ellipse(cx + dx, top + w * 0.22, w / 2, w * 0.22, 0, Math.PI, 0);
    ctx.lineTo(cx + dx + w / 2, baseY - legs);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx + dx - w * 0.08, top - w * 0.12, w * 0.16, w * 0.16);
    for (const b of belts) ctx.fillRect(cx + dx - w * 0.54, top + h * b, w * 1.08, Math.max(2, w * 0.05));
    if (legs > 0) {
      ctx.fillRect(cx + dx - w * 0.42, baseY - legs, w * 0.09, legs + 2);
      ctx.fillRect(cx + dx + w * 0.33, baseY - legs, w * 0.09, legs + 2);
    }
  };
  return { draw, box: { x0: cx - w * 0.6, x1: cx + w * 0.6, y0: baseY - legs - h - w * 0.2, y1: baseY + 3 } };
}

/** A truss: two chords and a zigzag between them, with a post at each end — a gantry, a catwalk, the underside of a bridge. */
export function gantry(_rng: Rng, x0: number, x1: number, topY: number, depth: number, chord: number, posts = true, footY: number | null = null): Form {
  const cells = Math.max(2, Math.round((x1 - x0) / (depth * 0.95)));
  const dxc = (x1 - x0) / cells;
  const draw: Draw = (ctx, dx) => {
    ctx.fillRect(x0 + dx, topY, x1 - x0, chord);
    ctx.fillRect(x0 + dx, topY + depth - chord, x1 - x0, chord);
    for (let i = 0; i < cells; i++) {
      const a = x0 + dx + i * dxc;
      if (i % 2 === 0) bar(ctx, a, topY + chord, a + dxc, topY + depth - chord, chord * 0.6);
      else bar(ctx, a, topY + depth - chord, a + dxc, topY + chord, chord * 0.6);
    }
    if (posts) {
      ctx.fillRect(x0 + dx, topY, chord * 1.2, (footY ?? topY + depth) - topY);
      ctx.fillRect(x1 + dx - chord * 1.2, topY, chord * 1.2, (footY ?? topY + depth) - topY);
    }
  };
  return { draw, box: { x0: x0 - 2, x1: x1 + 2, y0: topY - 2, y1: (footY ?? topY + depth) + 2 } };
}

/** An I-beam standing on `baseY` up to `topY`: a web with a flange at each end and a row of rivets. */
export function girder(_rng: Rng, cx: number, baseY: number, topY: number, w: number): Form {
  const rivets = Math.max(2, Math.round((baseY - topY) / (w * 0.6)));
  const draw: Draw = (ctx, dx) => {
    ctx.fillRect(cx + dx - w * 0.15, topY, w * 0.3, baseY - topY);
    ctx.fillRect(cx + dx - w / 2, topY, w, w * 0.2);
    ctx.fillRect(cx + dx - w * 0.6, baseY - w * 0.28, w * 1.2, w * 0.28);
    ctx.fillRect(cx + dx - w * 0.5, baseY - w * 0.5, w, w * 0.22);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 1; i < rivets; i++) {
      ctx.beginPath();
      ctx.arc(cx + dx, lerp(topY + w * 0.3, baseY - w * 0.6, i / rivets), Math.max(1, w * 0.045), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  return { draw, box: { x0: cx - w * 0.7, x1: cx + w * 0.7, y0: topY - 2, y1: baseY + 2 } };
}

/** A chain hanging from (x, y): links alternate between a ring seen face-on and one seen edge-on. */
export function chain(rng: Rng, x: number, y: number, len: number, link: number, hook = false): Form {
  const sway = rng.gauss() * link * 0.4;
  const n = Math.max(2, Math.floor(len / (link * 1.5)));
  const draw: Draw = (ctx, dx) => {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const cx = x + dx + sway * Math.sin(t * Math.PI);
      const cy = y + i * link * 1.5 + link * 0.8;
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, link * 0.6, link * 0.85, 0, 0, Math.PI * 2);
        ctx.ellipse(cx, cy, link * 0.3, link * 0.55, 0, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
      } else {
        ctx.fillRect(cx - link * 0.17, cy - link * 0.85, link * 0.34, link * 1.7);
      }
    }
    if (hook) {
      const cx = x + dx + sway * Math.sin(Math.PI);
      const cy = y + n * link * 1.5 + link * 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy + link * 1.2, link * 1.1, Math.PI * 1.15, Math.PI * 0.35, false);
      ctx.arc(cx, cy + link * 1.2, link * 0.55, Math.PI * 0.35, Math.PI * 1.15, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - link * 0.2, cy - link * 0.2, link * 0.4, link * 1.2);
    }
  };
  return { draw, box: { x0: x - link * 2, x1: x + link * 2, y0: y - 2, y1: y + n * link * 1.5 + (hook ? link * 4 : link * 2) } };
}

/** A gear: a toothed wheel with a hub and spokes (a hole between them). */
export function gear(rng: Rng, cx: number, cy: number, r: number, teeth: number): Form {
  const spin = rng.range(0, Math.PI);
  const draw: Draw = (ctx, dx) => {
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = spin + (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.84;
      const a2 = a + (Math.PI * 2) / (teeth * 4);
      ctx.lineTo(cx + dx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      ctx.lineTo(cx + dx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 5; i++) {
      const a = spin + (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + dx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
      ctx.arc(cx + dx, cy, r * 0.68, a + 0.18, a + (Math.PI * 2) / 5 - 0.18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  return { draw, box: { x0: cx - r - 2, x1: cx + r + 2, y0: cy - r - 2, y1: cy + r + 2 } };
}

// -------------------------------------------------------------------------------------------------------------------------------- stone of a spire

/** A tower: a body with setbacks, narrower tier by tier, slits for windows and a spire on top. */
export function tower(rng: Rng, cx: number, baseY: number, h: number, w: number): Form {
  const tiers = rng.int(2, 3);
  const draw: Draw = (ctx, dx) => {
    let y = baseY;
    let ww = w;
    let remaining = h * 0.78;
    for (let i = 0; i < tiers; i++) {
      const th = i === tiers - 1 ? remaining : remaining * rng.range(0.4, 0.55);
      ctx.fillRect(cx + dx - ww / 2, y - th, ww, th + 2);
      ctx.fillRect(cx + dx - ww * 0.56, y - th - ww * 0.06, ww * 1.12, ww * 0.1);
      y -= th;
      remaining -= th;
      ww *= 0.78;
    }
    ctx.beginPath();
    ctx.moveTo(cx + dx - ww * 0.62, y);
    ctx.lineTo(cx + dx + rng.gauss() * ww * 0.03, y - h * 0.22);
    ctx.lineTo(cx + dx + ww * 0.62, y);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    const slits = Math.max(2, Math.round(h / (w * 0.9)));
    for (let i = 0; i < slits; i++) {
      const sy = baseY - h * 0.08 - (i / slits) * h * 0.66;
      ctx.beginPath();
      ctx.moveTo(cx + dx - w * 0.05, sy);
      ctx.lineTo(cx + dx - w * 0.05, sy - w * 0.22);
      ctx.arc(cx + dx, sy - w * 0.22, w * 0.05, Math.PI, 0);
      ctx.lineTo(cx + dx + w * 0.05, sy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  return { draw, box: { x0: cx - w * 0.7, x1: cx + w * 0.7, y0: baseY - h - 4, y1: baseY + 3 } };
}

/** A thin spire with a base and little notches up its edges. */
export function pinnacle(rng: Rng, cx: number, baseY: number, h: number, w: number): Form {
  const notches = Math.max(3, Math.round(h / (w * 1.3)));
  const draw: Draw = (ctx, dx) => {
    ctx.fillRect(cx + dx - w * 0.6, baseY - w * 0.5, w * 1.2, w * 0.5 + 2);
    ctx.beginPath();
    ctx.moveTo(cx + dx - w / 2, baseY - w * 0.4);
    ctx.lineTo(cx + dx + rng.gauss() * w * 0.04, baseY - h);
    ctx.lineTo(cx + dx + w / 2, baseY - w * 0.4);
    ctx.closePath();
    ctx.fill();
    for (let i = 1; i <= notches; i++) {
      const t = i / (notches + 1);
      const y = lerp(baseY - w * 0.4, baseY - h, t);
      const half = (w / 2) * (1 - t);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx + s * half * 0.6, y);
        ctx.lineTo(cx + dx + s * (half + w * 0.28), y - w * 0.18);
        ctx.lineTo(cx + dx + s * half * 0.6, y - w * 0.35);
        ctx.closePath();
        ctx.fill();
      }
    }
  };
  return { draw, box: { x0: cx - w, x1: cx + w, y0: baseY - h - 4, y1: baseY + 3 } };
}

/** A bell hung from a yoke at `topY`: a dome that flares into a lip, a clapper below. */
export function bell(_rng: Rng, cx: number, topY: number, r: number): Form {
  const draw: Draw = (ctx, dx) => {
    ctx.fillRect(cx + dx - r * 0.95, topY, r * 1.9, r * 0.2);
    ctx.fillRect(cx + dx - r * 0.1, topY + r * 0.15, r * 0.2, r * 0.3);
    ctx.beginPath();
    ctx.moveTo(cx + dx - r * 0.3, topY + r * 0.4);
    ctx.bezierCurveTo(cx + dx - r * 0.45, topY + r * 1.1, cx + dx - r * 0.5, topY + r * 1.45, cx + dx - r * 1.0, topY + r * 1.85);
    ctx.lineTo(cx + dx + r * 1.0, topY + r * 1.85);
    ctx.bezierCurveTo(cx + dx + r * 0.5, topY + r * 1.45, cx + dx + r * 0.45, topY + r * 1.1, cx + dx + r * 0.3, topY + r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx + dx - r * 1.05, topY + r * 1.82, r * 2.1, r * 0.14);
    ctx.beginPath();
    ctx.arc(cx + dx, topY + r * 2.05, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  };
  return { draw, box: { x0: cx - r * 1.1, x1: cx + r * 1.1, y0: topY - 2, y1: topY + r * 2.3 } };
}

/** An arcade: `n` pointed arches between piers, with a cornice over them — the cloister of a spire. */
export function arcade(_rng: Rng, x0: number, baseY: number, n: number, span: number, h: number, pier: number): Form {
  const draw: Draw = (ctx, dx) => {
    const top = baseY - h;
    for (let i = 0; i <= n; i++) ctx.fillRect(x0 + dx + i * span - pier / 2, top + pier, pier, h - pier + 2);
    for (let i = 0; i < n; i++) {
      const a = x0 + dx + i * span;
      ctx.beginPath();
      ctx.moveTo(a + pier / 2, top + pier * 2.2);
      ctx.quadraticCurveTo(a + pier / 2, top + pier * 0.2, a + span / 2, top - pier * 0.2);
      ctx.quadraticCurveTo(a + span - pier / 2, top + pier * 0.2, a + span - pier / 2, top + pier * 2.2);
      ctx.lineTo(a + span - pier / 2, top + pier * 1.2);
      ctx.quadraticCurveTo(a + span - pier / 2, top - pier * 0.5, a + span / 2, top - pier * 1.1);
      ctx.quadraticCurveTo(a + pier / 2, top - pier * 0.5, a + pier / 2, top + pier * 1.2);
      ctx.closePath();
      ctx.fill();
      // the spandrel above the arch is wall
      ctx.fillRect(a, top - pier * 1.1, span, pier * 0.5);
    }
    ctx.fillRect(x0 + dx - pier * 0.8, top - pier * 1.4, n * span + pier * 1.6, pier * 0.5);
  };
  return { draw, box: { x0: x0 - pier * 2, x1: x0 + n * span + pier * 2, y0: baseY - h - pier * 2, y1: baseY + 3 } };
}

/** A flying buttress: an arc of stone from a pier to the wall it holds up. */
export function buttress(_rng: Rng, x0: number, baseY: number, x1: number, topY: number, thick: number): Form {
  const draw: Draw = (ctx, dx) => {
    ctx.fillRect(x0 + dx - thick * 0.7, topY + thick, thick * 1.4, baseY - topY - thick + 2);
    ctx.beginPath();
    ctx.moveTo(x0 + dx, topY + thick * 2.2);
    ctx.quadraticCurveTo((x0 + x1) / 2 + dx, topY - thick * 1.1, x1 + dx, topY + thick * 0.2);
    ctx.lineTo(x1 + dx, topY + thick * 1.2);
    ctx.quadraticCurveTo((x0 + x1) / 2 + dx, topY + thick * 0.2, x0 + dx + thick * 0.7, topY + thick * 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x0 + dx - thick * 0.9, topY + thick * 0.4, thick * 1.8, thick * 0.6);
  };
  return { draw, box: { x0: x0 - thick * 2, x1: x1 + thick, y0: topY - thick * 2, y1: baseY + 2 } };
}

// -------------------------------------------------------------------------------------------------------------------------------- the living things

/** A rib: an arch of bone-like stalk that comes out of the ground and curls over, thicker at its foot. */
export function rib(_rng: Rng, cx: number, baseY: number, rx: number, ry: number, thick: number, lean = 0): Form {
  const draw: Draw = (ctx, dx) => {
    ctx.save();
    ctx.translate(cx + dx, baseY);
    ctx.rotate(lean);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, 0);
    ctx.ellipse(0, 0, rx - thick, Math.max(1, ry - thick * 0.8), 0, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
    // a knuckle at each foot
    ctx.beginPath();
    ctx.ellipse(-rx + thick / 2, -thick * 0.2, thick * 0.85, thick * 0.95, 0, 0, Math.PI * 2);
    ctx.ellipse(rx - thick / 2, -thick * 0.2, thick * 0.85, thick * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  return { draw, box: { x0: cx - rx - thick * 2 - Math.abs(Math.sin(lean)) * ry, x1: cx + rx + thick * 2 + Math.abs(Math.sin(lean)) * ry, y0: baseY - ry - rx * 0.3 - thick, y1: baseY + thick * 2 } };
}

/** A strand that wanders from a root — a vein, a tendril, a hanging root — as a path (for `SilhouetteLayer.tube`) and as a flat shape. */
export function strand(rng: Rng, x: number, y: number, len: number, angle: number, turn: number): Pt[] {
  return wander(rng, x, y, angle, len, Math.max(5, len / 28), turn);
}

/** A cluster of reeds: slim blades from one foot, leaning every way. */
export function reeds(rng: Rng, cx: number, baseY: number, count: number, h: number, w: number): Form {
  const blades = Array.from({ length: count }, () => ({ x: cx + rng.gauss() * w, h: h * rng.range(0.45, 1), lean: rng.gauss() * h * 0.22, w: Math.max(2, h * rng.range(0.025, 0.05)) }));
  const draw: Draw = (ctx, dx) => {
    for (const b of blades) blade(ctx, b.x + dx, baseY + 1, b.h, b.lean, b.w);
  };
  return { draw, box: { x0: cx - w * 3 - h * 0.4, x1: cx + w * 3 + h * 0.4, y0: baseY - h - 4, y1: baseY + 3 } };
}

/** A giant mushroom: a curved stalk and a cap that is wider than it is tall. `underY` is where the underside of the cap is, for a light under it. */
export function mushroom(rng: Rng, cx: number, baseY: number, h: number, capR: number): Form & { cap: Form } {
  const bend = rng.gauss() * capR * 0.15;
  const stalkW = capR * rng.range(0.24, 0.34);
  const capY = baseY - h;
  const cap: Draw = (ctx, dx) => {
    ctx.beginPath();
    ctx.ellipse(cx + dx + bend, capY, capR, capR * 0.55, 0, Math.PI, 0);
    ctx.quadraticCurveTo(cx + dx + bend + capR * 0.55, capY + capR * 0.18, cx + dx + bend, capY + capR * 0.12);
    ctx.quadraticCurveTo(cx + dx + bend - capR * 0.55, capY + capR * 0.18, cx + dx + bend - capR, capY);
    ctx.closePath();
    ctx.fill();
  };
  const draw: Draw = (ctx, dx) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx - stalkW * 0.7, baseY + 2);
    ctx.quadraticCurveTo(cx + dx - stalkW * 0.35 + bend * 0.2, baseY - h * 0.5, cx + dx + bend - stalkW * 0.4, capY);
    ctx.lineTo(cx + dx + bend + stalkW * 0.4, capY);
    ctx.quadraticCurveTo(cx + dx + stalkW * 0.35 + bend * 0.2, baseY - h * 0.5, cx + dx + stalkW * 0.7, baseY + 2);
    ctx.closePath();
    ctx.fill();
    cap(ctx, dx);
  };
  const box = { x0: cx - capR * 1.1 + bend, x1: cx + capR * 1.1 + bend, y0: capY - capR * 0.6, y1: baseY + 3 };
  const under: Draw = (ctx, dx) => {
    const g = ctx.createRadialGradient(cx + dx + bend, capY + capR * 0.1, 0, cx + dx + bend, capY + capR * 0.1, capR);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx + dx + bend, capY + capR * 0.08, capR * 0.95, capR * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  return { draw, box, cap: { draw: under, box: { x0: box.x0, x1: box.x1, y0: capY - capR * 0.3, y1: capY + capR * 0.5 } } };
}

/** A post with a lantern hung from an arm: the lantern is a small cage with a point on top, and it gives the light (`lamp` is its box, to make it shine). */
export function lanternPost(rng: Rng, x: number, baseY: number, h: number, arm: number): Form & { lamp: Form } {
  const side = rng.chance(0.5) ? -1 : 1;
  const thick = Math.max(3, h * 0.045);
  const lampX = x + side * arm;
  const lampY = baseY - h * 0.82;
  const sz = Math.max(5, h * 0.055);
  const lampDraw: Draw = (ctx, dx) => {
    ctx.beginPath();
    ctx.moveTo(lampX + dx - sz * 0.5, lampY + sz);
    ctx.lineTo(lampX + dx - sz * 0.5, lampY + sz * 0.2);
    ctx.lineTo(lampX + dx, lampY - sz * 0.15);
    ctx.lineTo(lampX + dx + sz * 0.5, lampY + sz * 0.2);
    ctx.lineTo(lampX + dx + sz * 0.5, lampY + sz);
    ctx.closePath();
    ctx.fill();
  };
  const draw: Draw = (ctx, dx) => {
    ctx.fillRect(x + dx - thick / 2, baseY - h, thick, h + 2);
    ctx.fillRect(Math.min(x, lampX) + dx - thick * 0.3, baseY - h * 0.9, Math.abs(lampX - x) + thick * 0.6, thick * 0.7);
    ctx.fillRect(lampX + dx - 1, baseY - h * 0.9, 2, lampY - (baseY - h * 0.9));
    lampDraw(ctx, dx);
    // a brace under the arm
    bar(ctx, x + dx, baseY - h * 0.7, x + dx + side * arm * 0.5, baseY - h * 0.88, thick * 0.55);
  };
  const box = { x0: Math.min(x, lampX) - sz, x1: Math.max(x, lampX) + sz, y0: baseY - h - 2, y1: baseY + 2 };
  return { draw, box, lamp: { draw: softCore(lampX, lampY + sz * 0.55, sz * 0.8), box: { x0: lampX - sz, x1: lampX + sz, y0: lampY - sz * 0.3, y1: lampY + sz * 1.3 } } };
}

/** A drape of moss or cloth hanging from `topY`: a ragged curtain that is wide at its root. */
export function drape(rng: Rng, x: number, topY: number, len: number, w: number): Form {
  const n = Math.max(3, Math.round(w / 9));
  const strips = Array.from({ length: n }, (_, i) => ({ x: x - w / 2 + (w * (i + rng.next() * 0.6)) / n, l: len * rng.range(0.35, 1) * (1 - Math.abs(i / (n - 1) - 0.5) * 0.5), ww: (w / n) * rng.range(0.7, 1.5), seed: rng.int(0, 1e6) }));
  const draw: Draw = (ctx, dx) => {
    ctx.fillRect(x - w / 2 + dx, topY - 3, w, len * 0.12);
    for (const s of strips) {
      const r = new Rng(s.seed);
      const pts = wander(r, s.x + dx, topY + len * 0.05, Math.PI / 2 + r.gauss() * 0.12, s.l, Math.max(5, s.l / 14), 0.1);
      taper(ctx, pts, s.ww, s.ww * 0.15);
    }
  };
  return { draw, box: { x0: x - w * 0.7, x1: x + w * 0.7, y0: topY - 4, y1: topY + len + 8 } };
}

/** A soft round core of light: white that fades to nothing at its rim (what `SilhouetteLayer.glow` reads is the alpha, so the light has no hard edge). */
export function softCore(cx: number, cy: number, r: number): Draw {
  return (ctx, dx) => {
    const g = ctx.createRadialGradient(cx + dx, cy, 0, cx + dx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
}

/** A lump with a glow in it — a cyst, a lamp, a fruit of the dark: a blob with a soft light inside (`core`, the part that shines). */
export function bulb(rng: Rng, cx: number, cy: number, rx: number, ry: number): Form & { core: Form } {
  const seed = rng.int(0, 1e6);
  const draw: Draw = (ctx, dx) => {
    blobPath(ctx, cx + dx, cy, rx, ry, new Rng(seed), 7, 0.14);
    ctx.fill();
  };
  const box = { x0: cx - rx * 1.2, x1: cx + rx * 1.2, y0: cy - ry * 1.2, y1: cy + ry * 1.2 };
  return { draw, box, core: { draw: softCore(cx, cy, Math.max(rx, ry) * 0.75), box } };
}
