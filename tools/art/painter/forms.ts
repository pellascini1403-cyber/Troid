import { Rng } from './rng';
import { blobPath, leaf, roughen, taper, wander, type Pt } from './shapes';

/** The shapes of the ruins — each returns a drawing function (`ctx`, `dx`) that fills the shape in the current fill style. A hand-made look comes from the wobble. */
export type Draw = (ctx: CanvasRenderingContext2D, dx: number) => void;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A tree trunk from `topY` to `baseY`, `rBase` thick at the foot (a flare of roots) and `rTop` at the top, a little crooked. Returns its drawing and its extent. */
export function trunk(rng: Rng, cx: number, baseY: number, topY: number, rBase: number, rTop: number): { draw: Draw; x0: number; x1: number } {
  const lean = rng.gauss() * rBase * 0.25;
  const wobL: number[] = [];
  const wobR: number[] = [];
  const n = Math.max(4, Math.round((baseY - topY) / 12));
  for (let i = 0; i <= n; i++) {
    wobL.push((rng.next() - 0.5) * rBase * 0.1);
    wobR.push((rng.next() - 0.5) * rBase * 0.1);
  }
  const branches = Array.from({ length: rng.int(1, 3) }, () => ({
    t: rng.range(0.04, 0.42),
    side: rng.chance(0.5) ? -1 : 1,
    angle: rng.range(0.4, 1.1),
    length: rBase * rng.range(2.8, 6),
    w: rBase * rng.range(0.32, 0.55),
    seed: rng.int(0, 1e6),
  }));
  const rootCount = rng.int(2, 3);
  const roots = Array.from({ length: rootCount }, (_, k) => ({ side: k % 2 === 0 ? -1 : 1, reach: rBase * rng.range(1.4, 2.4), rise: rBase * rng.range(1.3, 2.4), w: rBase * rng.range(0.35, 0.6) }));
  const draw: Draw = (ctx, dx) => {
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n; // 0 top … 1 foot
      const y = lerp(topY, baseY, t);
      const flare = t > 0.82 ? 1 + 1.1 * ((t - 0.82) / 0.18) ** 2 : 1;
      const r = lerp(rTop, rBase, t ** 1.4) * flare;
      const x = cx + dx + lean * (1 - t);
      left.push({ x: x - r + wobL[i]!, y });
      right.push({ x: x + r + wobR[i]!, y });
    }
    ctx.beginPath();
    ctx.moveTo(left[0]!.x, left[0]!.y);
    for (const p of left) ctx.lineTo(p.x, p.y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
    ctx.closePath();
    ctx.fill();
    for (const b of branches) {
      const y = lerp(topY, baseY, b.t);
      const r = lerp(rTop, rBase, b.t ** 1.4);
      const br = new Rng(b.seed);
      const pts = wander(br, cx + dx + lean * (1 - b.t) + b.side * r * 0.8, y + r, -Math.PI / 2 + b.side * b.angle, b.length, rBase * 0.25, 0.16);
      taper(ctx, pts, b.w, b.w * 0.18);
    }
    for (const r of roots) {
      const x0 = cx + dx + r.side * rBase * 0.55;
      const y0 = baseY - r.rise;
      const pts: Pt[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push({ x: x0 + r.side * r.reach * t * 0.9, y: lerp(y0, baseY + 2, t ** 0.7) });
      }
      taper(ctx, pts, r.w, r.w * 0.2);
    }
  };
  const reach = Math.max(...roots.map((r) => r.reach), ...branches.map((b) => b.length * Math.sin(b.angle))) + rBase;
  return { draw, x0: cx - reach - Math.abs(lean), x1: cx + reach + Math.abs(lean) };
}

/**
 * A crown of leaves: a mass along the top of the picture — overlapping blobs — with a fringe of leaves hanging from its lower edge. `cy` is the middle of the mass; `ry` how
 * far it hangs.
 */
export function crown(rng: Rng, cx: number, cy: number, rx: number, ry: number): { draw: Draw; box: { x0: number; y0: number; x1: number; y1: number } } {
  const n = Math.round(rx / 9) + 8;
  const blobs = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1) - 0.5;
    return { x: cx + t * rx * 2 + rng.gauss() * rx * 0.04, y: cy + Math.cos(t * Math.PI) * ry * 0.18 + rng.gauss() * ry * 0.08, rx: (rx / n) * rng.range(2.2, 4), ry: ry * rng.range(0.32, 0.6), seed: rng.int(0, 1e6) };
  });
  const fringe = Array.from({ length: Math.round(rx / 2.6) }, () => {
    const x = cx + rng.range(-rx, rx);
    const edge = Math.cos(((x - cx) / rx) * (Math.PI / 2)) ** 0.6;
    return { x, y: cy + ry * 0.3 * edge + rng.range(0, ry * 0.12), len: ry * rng.range(0.18, 0.7) * (0.4 + 0.6 * edge), wid: ry * rng.range(0.035, 0.085), a: Math.PI / 2 + rng.gauss() * 0.45 };
  });
  const draw: Draw = (ctx, dx) => {
    for (const b of blobs) {
      blobPath(ctx, b.x + dx, b.y, b.rx, b.ry, new Rng(b.seed), 8, 0.28);
      ctx.fill();
    }
    for (const l of fringe) leaf(ctx, l.x + dx, l.y, l.len, l.wid, l.a);
  };
  return { draw, box: { x0: cx - rx * 1.25, x1: cx + rx * 1.25, y0: cy - ry * 1.1, y1: cy + ry * 1.2 } };
}

/** A column: a shaft that tapers a little, a plinth at its foot, and either a capital (whole) or a broken, jagged top (broken). */
export function column(rng: Rng, cx: number, baseY: number, topY: number, r: number, state: 'whole' | 'broken'): { draw: Draw; box: { x0: number; y0: number; x1: number; y1: number } } {
  const jag = roughen(
    [
      { x: cx - r * 0.92, y: topY + r * rng.range(0.1, 0.6) },
      { x: cx - r * 0.3, y: topY - r * rng.range(0.1, 0.5) },
      { x: cx + r * 0.25, y: topY + r * rng.range(0.0, 0.7) },
      { x: cx + r * 0.9, y: topY + r * rng.range(0.1, 0.5) },
    ],
    rng,
    r * 0.16,
    r * 0.3,
  );
  const bites = Array.from({ length: rng.int(3, 7) }, () => ({ x: (rng.chance(0.5) ? -1 : 1) * r * rng.range(0.85, 1.05), y: rng.range(topY + r, baseY - r * 1.2), r: r * rng.range(0.1, 0.3), seed: rng.int(0, 1e6) }));
  const draw: Draw = (ctx, dx) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx - r, baseY - r * 0.55);
    if (state === 'broken') {
      ctx.lineTo(cx + dx - r * 0.92, jag[0]!.y);
      for (const p of jag) ctx.lineTo(p.x + dx, p.y);
      ctx.lineTo(cx + dx + r * 0.95, baseY - r * 0.55);
    } else {
      ctx.lineTo(cx + dx - r * 0.9, topY + r * 0.9);
      ctx.lineTo(cx + dx + r * 0.9, topY + r * 0.9);
      ctx.lineTo(cx + dx + r, baseY - r * 0.55);
    }
    ctx.closePath();
    ctx.fill();
    // the plinth, and the capital
    ctx.fillRect(cx + dx - r * 1.3, baseY - r * 0.6, r * 2.6, r * 0.6);
    ctx.fillRect(cx + dx - r * 1.1, baseY - r * 0.75, r * 2.2, r * 0.18);
    if (state === 'whole') {
      ctx.fillRect(cx + dx - r * 1.35, topY, r * 2.7, r * 0.45);
      ctx.fillRect(cx + dx - r * 1.05, topY + r * 0.4, r * 2.1, r * 0.35);
    }
    // time has bitten chunks out of the edges, and a band or two out of the shaft
    ctx.globalCompositeOperation = 'destination-out';
    for (const b of bites) {
      blobPath(ctx, cx + dx + b.x, b.y, b.r, b.r * 1.3, new Rng(b.seed), 5, 0.35);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  return { draw, box: { x0: cx - r * 1.5, x1: cx + r * 1.5, y0: topY - r, y1: baseY } };
}

/** A segment of an arch: the ring between two circles, from angle `a0` to `a1` (radians, 0 = right, π = left, the top is π/2 going up in the picture). */
export function archRing(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): Draw {
  return (ctx, dx) => {
    ctx.beginPath();
    ctx.arc(cx + dx, cy, rOuter, -a1, -a0);
    ctx.arc(cx + dx, cy, rInner, -a0, -a1, true);
    ctx.closePath();
    ctx.fill();
  };
}

/** A vine: a wandering strand that tapers, with leaves along it. */
export function vine(rng: Rng, x: number, y: number, length: number, thick: number): { draw: Draw; box: { x0: number; y0: number; x1: number; y1: number } } {
  const pts = wander(rng, x, y, Math.PI / 2 + rng.gauss() * 0.15, length, Math.max(6, length / 24), 0.18);
  const leaves = pts.filter((_, i) => i % 2 === 1).map((p) => ({ p, a: (rng.next() < 0.5 ? 1 : -1) * rng.range(0.4, 1.2) + Math.PI / 2, len: thick * rng.range(2.5, 5) }));
  const draw: Draw = (ctx, dx) => {
    taper(ctx, pts.map((p) => ({ x: p.x + dx, y: p.y })), thick, thick * 0.3);
    for (const l of leaves) leaf(ctx, l.p.x + dx, l.p.y, l.len, l.len * 0.34, l.a);
  };
  const xs = pts.map((p) => p.x);
  return { draw, box: { x0: Math.min(...xs) - thick * 6, x1: Math.max(...xs) + thick * 6, y0: y - thick, y1: y + length + thick * 6 } };
}

/** A stub of wall with a jagged top and, now and then, an arched window: the rubble of a hall. */
export function wallStub(rng: Rng, x0: number, baseY: number, width: number, height: number): { draw: Draw; box: { x0: number; y0: number; x1: number; y1: number } } {
  const top: Pt[] = [{ x: x0, y: baseY - height * rng.range(0.6, 1) }];
  const n = Math.max(3, Math.round(width / 26));
  for (let i = 1; i <= n; i++) top.push({ x: x0 + (width * i) / n, y: baseY - height * rng.range(0.45, 1) });
  const jag = roughen(top, rng, height * 0.05, 18);
  const win = rng.chance(0.65) ? { x: x0 + width * rng.range(0.3, 0.7), w: width * rng.range(0.12, 0.2), y: baseY - height * rng.range(0.35, 0.6) } : null;
  const draw: Draw = (ctx, dx) => {
    ctx.beginPath();
    ctx.moveTo(x0 + dx, baseY);
    for (const p of jag) ctx.lineTo(p.x + dx, p.y);
    ctx.lineTo(x0 + width + dx, baseY);
    ctx.closePath();
    ctx.fill();
    if (win) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(win.x + dx - win.w / 2, win.y + win.w * 2);
      ctx.lineTo(win.x + dx - win.w / 2, win.y);
      ctx.arc(win.x + dx, win.y, win.w / 2, Math.PI, 0);
      ctx.lineTo(win.x + dx + win.w / 2, win.y + win.w * 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  };
  return { draw, box: { x0: x0 - 4, x1: x0 + width + 4, y0: baseY - height - 8, y1: baseY } };
}
