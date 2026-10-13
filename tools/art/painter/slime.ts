import { surface, readPixels, type Surface } from './canvas';
import { clamp01, smoothstep } from './color';
import { makeField, type Field } from './field';
import { bevel, type Layers, type Look } from './light';
import { fbm } from './noise';
import { INK, INK_LOOK, VIOLET, VIOLET_HOT, lightInk, rgba } from './ink';
import { Rng } from './rng';

/**
 * THE INK SLIME (docs/PROMPT8-LOG.md phase G): a drop of the Warden's own ink that took a will of its own. ORIGINAL on purpose — not a dome with two eyes (every game has one) but a low wave of ink that crouches
 * with its hood-peak thrown back and its cloak dragging behind it, like a small cousin of the cloaked guardians of the hall: the same ink, the same cold violet rim, the same one-slit look. What is its own:
 *
 *   · the PEAK — a hooked crest at the back, the tip of a hood, that makes the silhouette lean into its lunge;
 *   · the SIGIL — a small violet diamond in a ring that burns inside its chest, a splinter of the seal's own sigil: dim while it sleeps, white-hot when it winds up;
 *   · the BRISTLE — ink spines that rise along the back as it prepares to strike: the telegraph reads in the SILHOUETTE before the colour;
 *   · two slits for eyes under a heavy brow, set low and slanted: a scowl, not a stare.
 *
 * It comes in PARTS, because the game moves them (the pose is the simulation's state, read by the view): the body in four "boiling" frames (a hand-drawn way of making ink alive: the surface never rests), its
 * white flash, the eyes, the sigil, the bristle in three states and the pool it rides in. The mass of the body stays inside the 1.1 m the game fights; only the tail drags beyond it.
 */
export interface SlimeOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

/** A top-lit variant of the ink's light: the Slime is mirrored by the way it faces, so its light comes from above and not from a side. */
const SLIME_LOOK: Look = { ...INK_LOOK, light: [0.1, -0.93, 0.36], rim: 1.15, cavity: 0.35 };

/** The metres the picture is made in: x forward of the feet (the art faces right), y up from the floor. */
type M = readonly [number, number];

/**
 * The top line of the body, from the tip of the tail to the floor in front: a hunched creature — a high back whose crest is thrown backward like the tip of a hood, a dip where the neck would be, and a low head with a brow that
 * overhangs the eyes and a blunt snout. The mass sits between −0.56 and 0.6; the tail drags to −0.99.
 */
const TOP: readonly M[] = [
  [-0.99, 0.0], [-0.86, 0.04], [-0.74, 0.11], [-0.65, 0.26], [-0.59, 0.5], [-0.53, 0.74], [-0.46, 0.91], [-0.38, 0.99], [-0.3, 0.94], [-0.22, 0.83],
  [-0.12, 0.69], [-0.02, 0.58], [0.08, 0.53], [0.18, 0.55], [0.28, 0.62], [0.38, 0.64], [0.48, 0.57], [0.55, 0.45], [0.59, 0.31], [0.6, 0.16], [0.58, 0.0],
];
/** Where the sigil burns inside the chest, and where the two slits sit (metres from the feet). */
export const SLIME_SIGIL: M = [-0.12, 0.38];
export const SLIME_EYES: M = [0.27, 0.45];

/** Catmull–Rom through the points, `n` samples per segment. */
function spline(pts: readonly M[], n: number): M[] {
  const out: M[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** The body's top line at a moment of its boil (0..1 round a loop): the surface of ink never rests, so each point rides a slow wave of its own. */
function boiled(phase: number, seed: number): M[] {
  const a = phase * Math.PI * 2;
  return TOP.map(([x, y], i): M => {
    if (i === 0 || i === TOP.length - 1) return [x, y];
    const wave = Math.sin(a + i * 0.93 + seed * 0.7);
    const wave2 = Math.sin(a * 2 + i * 1.7 + seed);
    const k = 0.35 + 0.65 * (y / 0.97);
    return [x + 0.006 * wave2 * k, y + (0.014 * wave + 0.006 * wave2) * k];
  });
}

/** The hem on the floor: a scalloped edge a hand's breadth above it, so the pool shows between the lobes. */
const hem = (x: number, seed: number): number => 0.016 + 0.013 * (0.5 + 0.5 * Math.sin(x * 37 + seed)) + 0.006 * Math.sin(x * 91 + seed * 3);

interface Frame {
  cx: number;
  foot: number;
  u: number;
}
const px = (f: Frame, m: M): [number, number] => [f.cx + m[0] * f.u, f.foot - m[1] * f.u];

/** The silhouette of the body at a moment of its boil, filled in white into a context. */
function fillBody(ctx: CanvasRenderingContext2D, f: Frame, phase: number, seed: number): void {
  const top = spline(boiled(phase, seed), 8);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  top.forEach((m, i) => {
    const [x, y] = px(f, m);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  const last = top[top.length - 1]!;
  const first = top[0]!;
  for (let x = last[0]; x >= first[0]; x -= 0.012) {
    const [qx, qy] = px(f, [x, Math.min(hem(x, seed), 0.02 + Math.max(0, x - first[0]) * 0.1)]);
    ctx.lineTo(qx, qy);
  }
  ctx.closePath();
  ctx.fill();
}

/** The alpha of a surface as a field (0..1). */
function alphaOf(s: Surface): Field {
  const img = readPixels(s);
  const f = makeField(s.w, s.h);
  for (let i = 0; i < f.d.length; i++) f.d[i] = img.data[i * 4 + 3]! / 255;
  return f;
}

/**
 * The layers of a shape lit like a rounded thing: its alpha, a height that rises from its edge, an albedo of ink with a little life in it, and (for the body) a faint violet from inside, where the sigil burns.
 */
function inkLayers(alpha: Field, o: { seed: number; phase: number; u: number; round: number; lift: number; sigil?: M; cx: number; foot: number }): Layers {
  const { w, h } = alpha;
  const { u } = o;
  const height = bevel(alpha, o.round * u);
  const albedo = new Float32Array(w * h * 3);
  const emissive = new Float32Array(w * h * 3);
  const a = o.phase * Math.PI * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alpha.d[i]! < 0.01) continue;
      // the surface of the ink is rippled by a slow noise that travels round a circle in noise space: the loop closes
      const n = fbm(x * 0.05 + Math.cos(a) * 1.4, y * 0.05 + Math.sin(a) * 1.4, o.seed, { octaves: 3 });
      height.d[i] = height.d[i]! * o.lift * u + (n - 0.5) * 0.045 * u * smoothstep(0, 0.15 * u, height.d[i]! * o.lift * u);
      const [r, g, b] = INK(clamp01(0.16 + 0.34 * n));
      albedo[i * 3] = r;
      albedo[i * 3 + 1] = g;
      albedo[i * 3 + 2] = b;
      if (o.sigil) {
        const dx = (x - o.cx) / u - o.sigil[0];
        const dy = (o.foot - y) / u - o.sigil[1];
        const glow = 0.1 * Math.exp(-(dx * dx + dy * dy) / (0.2 * 0.2));
        emissive[i * 3] = VIOLET[0] * glow;
        emissive[i * 3 + 1] = VIOLET[1] * glow;
        emissive[i * 3 + 2] = VIOLET[2] * glow;
      }
    }
  }
  return { w, h, albedo, height, alpha, emissive };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the body

/** A small ink bubble riding the surface: a dark lens with a thread of violet round it and a highlight. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(3,2,9,0.92)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(VIOLET, 0.55);
  ctx.lineWidth = Math.max(0.8, r * 0.28);
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.fillStyle = 'rgba(235,225,255,0.8)';
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.34, Math.max(0.6, r * 0.2), 0, Math.PI * 2);
  ctx.fill();
}

/** One cell of the body: the ink at a moment of its boil, lit, with its gleams and its bubbles. */
function bodyCell(o: SlimeOptions, phase: number): Surface {
  const { w, h, ppm: u, seed } = o;
  const f: Frame = { cx: w / 2, foot: h - 1, u };
  const s = surface(w, h);
  fillBody(s.ctx, f, phase, seed);
  const alpha = alphaOf(s);
  const cell = lightInk(inkLayers(alpha, { seed, phase, u, round: 0.42, lift: 0.36, sigil: SLIME_SIGIL, cx: f.cx, foot: f.foot }), SLIME_LOOK);
  const ctx = cell.ctx;
  const a = phase * Math.PI * 2;
  // the wet of the ink: two gleams along the upper face, where the light lies
  const top = spline(boiled(phase, seed), 8);
  const along = (x0: number, x1: number, dy: number): M[] => top.filter((m) => m[0] >= x0 && m[0] <= x1).map((m): M => [m[0], m[1] - dy]);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [x0, x1, dy, wd, al] of [[-0.36, 0.06, 0.075, 0.026, 0.55], [0.14, 0.4, 0.062, 0.018, 0.42], [-0.62, -0.5, 0.05, 0.014, 0.32]] as const) {
    const pts = along(x0, x1, dy);
    if (pts.length < 2) continue;
    ctx.strokeStyle = `rgba(214,196,255,${al})`;
    ctx.lineWidth = Math.max(1.1, wd * u);
    ctx.beginPath();
    pts.forEach((m, i) => {
      const [x, y] = px(f, m);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
  // bubbles: they swell and sink through the loop, each at its own beat
  const bubbles: Array<[number, number, number, number]> = [[-0.2, 0.62, 0.05, 0], [0.04, 0.47, 0.036, 2.1], [-0.47, 0.34, 0.032, 4.2], [0.3, 0.25, 0.026, 1.1]];
  for (const [bx, by, br, ph] of bubbles) {
    const k = 0.62 + 0.38 * Math.sin(a + ph);
    if (k > 0.2) bubble(ctx, ...px(f, [bx, by]), br * u * k);
  }
  return cell;
}

/** The body: four frames side by side — the surface of the ink, boiling in a loop. 2.2 × 1.45 m a frame, standing on the bottom edge. */
export function slimeBody(o: SlimeOptions): Surface {
  const out = surface(o.w * 4, o.h);
  for (let i = 0; i < 4; i++) out.ctx.drawImage(bodyCell(o, i / 4).canvas, i * o.w, 0);
  return out;
}

/** The flash of a hit: the silhouette of the body in white (the game lays it over the ink, added). One frame, 2.2 × 1.45 m. */
export function slimeFlash(o: SlimeOptions): Surface {
  const s = surface(o.w, o.h);
  fillBody(s.ctx, { cx: o.w / 2, foot: o.h - 1, u: o.ppm }, 0, o.seed);
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the eyes

/** The eyes: two slanted slits under a brow, pale with a violet halo, painted as light for the additive layer — the game turns them up (white-hot), squints them and lets them go dark. 1.0 × 0.5 m, the slits at its middle. */
export function slimeEyes(o: SlimeOptions): Surface {
  const { w, h, ppm: u } = o;
  const s = surface(w, h);
  const ctx = s.ctx;
  const cy = h / 2;
  for (const [dx, dy] of [[-0.145, 0], [0.145, 0.014]] as const) {
    const x = w / 2 + dx * u;
    const y = cy + dy * u;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, u * 0.2);
    halo.addColorStop(0, rgba(VIOLET_HOT, 0.5));
    halo.addColorStop(0.45, rgba(VIOLET, 0.18));
    halo.addColorStop(1, rgba(VIOLET, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(x - u * 0.22, y - u * 0.22, u * 0.44, u * 0.44);
    ctx.save();
    ctx.translate(x, y);
    // the front end (right) is lower: the scowl of a brow that is pulled down
    ctx.rotate(0.26);
    ctx.fillStyle = rgba(VIOLET_HOT, 0.7);
    ctx.beginPath();
    ctx.roundRect(-0.1 * u, -0.042 * u, 0.2 * u, 0.084 * u, 0.042 * u);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,252,255,0.98)';
    ctx.beginPath();
    ctx.roundRect(-0.08 * u, -0.027 * u, 0.16 * u, 0.054 * u, 0.027 * u);
    ctx.fill();
    ctx.restore();
  }
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the sigil

/** The sigil that burns in its chest: a diamond in a ring, a splinter of the seal's own, with four ticks round the ring — light for the additive layer; the game keeps it dim while the Slime sleeps and turns it white-hot as it winds up. 0.9 × 0.9 m. */
export function slimeSigil(o: SlimeOptions): Surface {
  const { w, h, ppm: u } = o;
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const cy = h / 2;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.42);
  halo.addColorStop(0, rgba(VIOLET, 0.5));
  halo.addColorStop(0.5, rgba(VIOLET, 0.16));
  halo.addColorStop(1, rgba(VIOLET, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(VIOLET_HOT, 0.72);
  ctx.lineWidth = Math.max(1.2, u * 0.022);
  ctx.beginPath();
  ctx.arc(cx, cy, u * 0.215, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * u * 0.25, cy + Math.sin(a) * u * 0.25);
    ctx.lineTo(cx + Math.cos(a) * u * 0.32, cy + Math.sin(a) * u * 0.32);
    ctx.stroke();
  }
  const d = (x: number, y: number): [number, number] => [cx + x * u, cy + y * u];
  const facet = (a: [number, number], b: [number, number], c: [number, number], fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.lineTo(...c);
    ctx.closePath();
    ctx.fill();
  };
  const top = d(0, -0.2);
  const right = d(0.115, 0);
  const bottom = d(0, 0.2);
  const left = d(-0.115, 0);
  const mid = d(0, 0);
  facet(top, left, mid, 'rgba(160,118,255,0.95)');
  facet(top, right, mid, 'rgba(118,78,235,0.95)');
  facet(bottom, left, mid, 'rgba(78,46,170,0.95)');
  facet(bottom, right, mid, 'rgba(62,36,148,0.95)');
  ctx.strokeStyle = rgba(VIOLET_HOT, 0.9);
  ctx.lineWidth = Math.max(1.1, u * 0.02);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(...top);
  ctx.lineTo(...right);
  ctx.lineTo(...bottom);
  ctx.lineTo(...left);
  ctx.closePath();
  ctx.stroke();
  const heart = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.1);
  heart.addColorStop(0, 'rgba(255,252,255,0.95)');
  heart.addColorStop(1, 'rgba(255,252,255,0)');
  ctx.fillStyle = heart;
  ctx.fillRect(cx - u * 0.12, cy - u * 0.12, u * 0.24, u * 0.24);
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the bristle

/** Where a spine stands on the back: the x of its foot on the top line, and how long it grows in each state (some, all). */
const SPINES: ReadonlyArray<{ x: number; some: number; all: number }> = [
  { x: -0.56, some: 0.0, all: 0.13 },
  { x: -0.49, some: 0.1, all: 0.21 },
  { x: -0.42, some: 0.0, all: 0.27 },
  { x: -0.34, some: 0.11, all: 0.3 },
  { x: -0.26, some: 0.0, all: 0.25 },
  { x: -0.17, some: 0.095, all: 0.2 },
  { x: -0.07, some: 0.0, all: 0.14 },
  { x: 0.28, some: 0.08, all: 0.14 },
  { x: 0.37, some: 0.0, all: 0.1 },
];

/** A point of the top line at a given x (metres), with the heading of the line there. */
function onTop(x: number): { y: number; angle: number } {
  const line = spline(TOP, 12);
  let best = 0;
  for (let i = 1; i < line.length; i++) if (Math.abs(line[i]![0] - x) < Math.abs(line[best]![0] - x)) best = i;
  const a = line[Math.max(0, best - 1)]!;
  const b = line[Math.min(line.length - 1, best + 1)]!;
  return { y: line[best]![1], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/**
 * The bristle, in three cells — resting (a few nubs), some (it wakes) and all (it is about to strike): ink spines that rise along the back and sweep backward, with a thread of violet light at the edge and a hot tip. The game
 * lays them over the body and chooses the cell by how far the warning has built; so the telegraph is in the silhouette before it is in the colour. 2.2 × 1.45 m a cell, in the body's own frame.
 */
export function slimeSpines(o: SlimeOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const f: Frame = { cx: w / 2, foot: h - 1, u };
  const out = surface(w * 3, h);
  for (let state = 0; state < 3; state++) {
    const mask = surface(w, h);
    const ctx = mask.ctx;
    ctx.fillStyle = '#fff';
    const tips: Array<[number, number]> = [];
    const outlines: Array<Array<[number, number]>> = [];
    const rng = new Rng(seed + state);
    for (const sp of SPINES) {
      const len = state === 0 ? 0.035 + (sp.some > 0 ? 0.012 : 0) : state === 1 ? sp.some : sp.all;
      if (len <= 0) continue;
      const { y, angle } = onTop(sp.x);
      // up from the line, swept back: the more it grows the more it lies toward the tail
      const up = angle + Math.PI / 2;
      const sweep = state === 2 ? 0.62 : 0.36;
      const dir = up + sweep + rng.range(-0.08, 0.08);
      // the foot is a little inside the body, so it grows out of the ink instead of standing on it
      const [bx, by] = px(f, [sp.x - Math.cos(up) * 0.02, y - 0.02]);
      const L = len * u;
      const bw = (0.026 + len * 0.1) * u;
      const dx = Math.cos(-dir);
      const dy = Math.sin(-dir);
      const nx = -dy;
      const ny = dx;
      const tipX = bx + dx * L;
      const tipY = by + dy * L;
      ctx.beginPath();
      ctx.moveTo(bx - nx * bw, by - ny * bw);
      ctx.quadraticCurveTo(bx + dx * L * 0.55 - nx * bw * 0.35 - 0.14 * L, by + dy * L * 0.55 - ny * bw * 0.35, tipX, tipY);
      ctx.quadraticCurveTo(bx + dx * L * 0.5 + nx * bw * 0.35 - 0.1 * L, by + dy * L * 0.5 + ny * bw * 0.35, bx + nx * bw, by + ny * bw);
      ctx.closePath();
      ctx.fill();
      tips.push([tipX, tipY]);
      outlines.push([[bx - nx * bw, by - ny * bw], [bx + dx * L * 0.55 - nx * bw * 0.35 - 0.14 * L, by + dy * L * 0.55 - ny * bw * 0.35], [tipX, tipY]]);
    }
    const alpha = alphaOf(mask);
    const cell = lightInk(inkLayers(alpha, { seed: seed + 9, phase: 0, u, round: 0.05, lift: 0.5, cx: f.cx, foot: f.foot }), SLIME_LOOK);
    // the edge toward the light is a thread of violet, so a spine reads as a spine on a dark floor; and the tips take the light of the sigil: the hotter the state, the brighter
    cell.ctx.lineCap = 'round';
    cell.ctx.lineJoin = 'round';
    cell.ctx.strokeStyle = rgba(VIOLET, 0.35 + state * 0.3);
    cell.ctx.lineWidth = Math.max(1, u * 0.012);
    for (const [a, c, t] of outlines) {
      cell.ctx.beginPath();
      cell.ctx.moveTo(a[0], a[1]);
      cell.ctx.quadraticCurveTo(c[0], c[1], t[0], t[1]);
      cell.ctx.stroke();
    }
    for (const [tx, ty] of tips) {
      const r = u * (0.03 + state * 0.012);
      const g = cell.ctx.createRadialGradient(tx, ty, 0, tx, ty, r);
      g.addColorStop(0, rgba(VIOLET_HOT, 0.15 + state * 0.3));
      g.addColorStop(1, rgba(VIOLET, 0));
      cell.ctx.fillStyle = g;
      cell.ctx.fillRect(tx - r, ty - r, r * 2, r * 2);
    }
    out.ctx.drawImage(cell.canvas, state * w, 0);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the pool

/** The pool the Slime rides in and melts into when it falls: a thin lens of glossy ink on the floor with a thread of violet along its upper edge, a few feelers reaching ahead and drops of ink that fell off. 2.0 × 0.3 m, on the bottom edge. */
export function slimePool(o: SlimeOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const rng = new Rng(seed);
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const base = h - 1;
  // the lens: longest in the tail behind, with feelers in front; its height is a few centimetres
  const top = (x: number): number => {
    const t = (x + 0.95) / 1.9;
    const lens = Math.sin(clamp01(t) * Math.PI) ** 0.8;
    return base - lens * 0.12 * u * (0.8 + 0.3 * Math.sin(x * 11 + seed));
  };
  ctx.fillStyle = 'rgb(6,5,14)';
  ctx.beginPath();
  ctx.moveTo(cx - 0.95 * u, base);
  for (let x = -0.95; x <= 0.95; x += 0.02) ctx.lineTo(cx + x * u, top(x));
  ctx.lineTo(cx + 0.95 * u, base);
  ctx.closePath();
  ctx.fill();
  // feelers: thin tongues that run ahead of the body along the floor
  for (const [x, len, wd] of [[0.46, 0.4, 0.034], [0.3, 0.3, 0.026], [0.58, 0.3, 0.022]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + x * u, base);
    ctx.quadraticCurveTo(cx + (x + len * 0.5) * u, base - wd * u * 1.3, cx + (x + len) * u, base - 0.4);
    ctx.lineTo(cx + (x + len) * u, base);
    ctx.closePath();
    ctx.fill();
  }
  // gloss: a thread of violet along the upper edge and a soft sheen over it
  const gloss = ctx.createLinearGradient(0, base - 0.1 * u, 0, base);
  gloss.addColorStop(0, 'rgba(172,130,255,0.7)');
  gloss.addColorStop(0.55, 'rgba(110,80,200,0.12)');
  gloss.addColorStop(1, 'rgba(110,80,200,0)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(190,150,255,0.55)';
  ctx.lineWidth = Math.max(1, u * 0.012);
  ctx.beginPath();
  for (let x = -0.85; x <= 0.85; x += 0.02) {
    if (x === -0.85) ctx.moveTo(cx + x * u, top(x) - 0.4);
    else ctx.lineTo(cx + x * u, top(x) - 0.4);
  }
  ctx.stroke();
  // drops that fell off it
  ctx.fillStyle = 'rgb(6,5,14)';
  for (let i = 0; i < 5; i++) {
    const x = rng.range(-0.9, 0.9);
    const r = u * rng.range(0.012, 0.03);
    ctx.beginPath();
    ctx.ellipse(cx + x * u, base - r * 0.7 - 0.5, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return s;
}
