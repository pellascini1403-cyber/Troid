import type { Draw } from './forms';
import type { Form } from './motifs';
import { Rng } from './rng';
import { taper, wander, type Pt } from './shapes';
import type { Box } from './silhouette';

/**
 * THE TREES THAT CARRY SPHERES (docs/PROMPT23-LOG.md §3, §7): the figure of the reference image of the second half — a thin, crooked tree that stands on its own roots like legs, forks high and holds a great sphere of red light in the fork, with crooked twigs that
 * clasp it. Painted as every other motif of the zones is — a drawing function and a box in pixels of the strip, y down — in two parts so that a layer can put the sphere BETWEEN them: `back` (the legs, the trunk and the branches), then each sphere
 * (`orbs`: where and how big), then `front` (the twigs that clasp a sphere, in front of it). The light of a sphere is drawn by `orbLight`: a disc with veins cut out of it, so the sphere shines and the cracks in it are dark.
 */
export interface Orb {
  x: number;
  y: number;
  r: number;
}

export interface OrbTree {
  /** The legs, the trunk and the branches. */
  back: Form;
  /** The twigs that clasp the spheres: in front of them. */
  front: Form;
  orbs: readonly Orb[];
  box: Box;
}

export interface OrbTreeSpec {
  /** Where each sphere hangs: in the fork (the big one), on the trunk (a smaller one growing out of its side) or at the foot (a great one the legs stand around). `r` is its radius in px. */
  orbs: ReadonlyArray<{ at: 'fork' | 'mid' | 'base'; r: number }>;
  /** How many root-legs it stands on (2 – 4). */
  legs: number;
  /** How thick the trunk is at its foot, px. */
  thick: number;
}

const offset = (pts: readonly Pt[], dx: number): Pt[] => pts.map((p) => ({ x: p.x + dx, y: p.y }));

/** A crooked curve from a to b through a control point: `n` points, a little noise. */
function curve(rng: Rng, a: Pt, c: Pt, b: Pt, n: number, noise: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const edge = i === 0 || i === n ? 0 : 1;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x + rng.gauss() * noise * edge, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y + rng.gauss() * noise * edge });
  }
  return out;
}

const along = (pts: readonly Pt[], t: number): Pt => pts[Math.min(pts.length - 1, Math.max(0, Math.round(t * (pts.length - 1))))]!;

export function orbTree(rng: Rng, cx: number, baseY: number, h: number, spec: OrbTreeSpec): OrbTree {
  const th = spec.thick;
  const lean = rng.gauss() * h * 0.06;
  const hips: Pt = { x: cx, y: baseY - h * 0.2 };
  const forkAt: Pt = { x: cx + lean, y: baseY - h * 0.62 };
  const trunkPts = curve(rng, hips, { x: cx - lean * 1.6, y: baseY - h * 0.42 }, forkAt, 9, th * 0.18);
  const legs: Array<{ pts: Pt[]; toe: Pt[] }> = [];
  for (let i = 0; i < spec.legs; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const reach = th * rng.range(2.6, 4.6) * (1 + Math.floor(i / 2) * 0.55);
    const foot: Pt = { x: cx + side * reach, y: baseY };
    const knee: Pt = { x: cx + side * reach * 0.35, y: baseY - h * rng.range(0.07, 0.14) };
    legs.push({ pts: curve(rng, hips, knee, foot, 8, th * 0.12), toe: [foot, { x: foot.x + side * th * 1.6, y: baseY - th * 0.1 }, { x: foot.x + side * th * 2.6, y: baseY }] });
  }
  const orbs: Orb[] = spec.orbs.map((o) => {
    if (o.at === 'fork') return { x: forkAt.x + lean * 0.2, y: forkAt.y - o.r * 0.5, r: o.r };
    if (o.at === 'mid') {
      const p = along(trunkPts, 0.5);
      const side = rng.chance(0.5) ? -1 : 1;
      return { x: p.x + side * o.r * 0.78, y: p.y, r: o.r };
    }
    return { x: cx + (rng.chance(0.5) ? -1 : 1) * o.r * 0.3, y: baseY - o.r * 0.95, r: o.r };
  });
  // the branches fan out of the fork, around the sphere that sits in it
  const branchCount = 3 + (spec.orbs.length > 1 ? 1 : 0);
  const branches: Array<{ pts: Pt[]; twigs: Pt[][] }> = [];
  for (let i = 0; i < branchCount; i++) {
    const a = -Math.PI / 2 + (i - (branchCount - 1) / 2) * (0.62 + rng.range(0, 0.24));
    const len = h * rng.range(0.24, 0.42);
    const pts = wander(rng, forkAt.x, forkAt.y, a, len, Math.max(3, th * 0.6), 0.2);
    const twigs: Pt[][] = [];
    for (const t of [rng.range(0.3, 0.5), rng.range(0.6, 0.85)]) {
      if (!rng.chance(0.75)) continue;
      const p = along(pts, t);
      twigs.push(wander(rng, p.x, p.y, a + (rng.chance(0.5) ? -1 : 1) * rng.range(0.55, 1), len * rng.range(0.25, 0.4), Math.max(3, th * 0.5), 0.3));
    }
    branches.push({ pts, twigs });
  }
  // the twigs that clasp each sphere: crooked claws that rise from its rim
  const claws: Pt[][] = [];
  for (const o of orbs) {
    const n = rng.int(4, 6);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI + ((k + rng.range(0.1, 0.9)) / n) * Math.PI * (o.r > th * 4 ? 1.15 : 1);
      const from: Pt = { x: o.x + Math.cos(a) * o.r * 0.97, y: o.y + Math.sin(a) * o.r * 0.97 };
      const away = a + (rng.chance(0.5) ? -0.5 : 0.5);
      const mid: Pt = { x: from.x + Math.cos(away) * o.r * 0.22, y: from.y + Math.sin(away) * o.r * 0.22 };
      const tip: Pt = { x: from.x + Math.cos(a) * o.r * rng.range(0.25, 0.5) + Math.cos(away) * o.r * 0.1, y: from.y + Math.sin(a) * o.r * rng.range(0.25, 0.5) + Math.sin(away) * o.r * 0.1 };
      claws.push([from, mid, tip]);
    }
  }
  const all: Pt[] = [...trunkPts, ...legs.flatMap((l) => [...l.pts, ...l.toe]), ...branches.flatMap((b) => [...b.pts, ...b.twigs.flat()]), ...claws.flat(), ...orbs.flatMap((o) => [{ x: o.x - o.r, y: o.y - o.r }, { x: o.x + o.r, y: o.y + o.r }])];
  const box: Box = { x0: Math.min(...all.map((p) => p.x)) - th, x1: Math.max(...all.map((p) => p.x)) + th, y0: Math.min(...all.map((p) => p.y)) - th, y1: baseY + th };
  const backDraw: Draw = (ctx, dx) => {
    for (const l of legs) {
      taper(ctx, offset(l.pts, dx), th * 0.62, th * 1.0);
      taper(ctx, offset(l.toe, dx), th * 0.5, 1.5);
    }
    taper(ctx, offset(trunkPts, dx), th * 1.05, th * 0.62);
    for (const b of branches) {
      taper(ctx, offset(b.pts, dx), th * 0.62, 1.5);
      for (const t of b.twigs) taper(ctx, offset(t, dx), th * 0.26, 1);
    }
  };
  const frontDraw: Draw = (ctx, dx) => {
    for (const c of claws) taper(ctx, offset(c, dx), Math.max(1.5, th * 0.3), 1);
  };
  return { back: { draw: backDraw, box }, front: { draw: frontDraw, box }, orbs, box };
}

/** The disc of a sphere (to be a body of the layer: it is shaded as a ball). */
export const orbDisc = (o: Orb): Draw => (ctx, dx) => {
  ctx.beginPath();
  ctx.arc(o.x + dx, o.y, o.r, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * The light of a sphere: the disc, with the claws that clasp it and a few veins cut out of it (`destination-out`), so what shines is the sphere and what is dark is what crosses it. `rng` is the sphere's own: the same veins every time.
 */
export function orbLight(rng: Rng, o: Orb, claws: Draw | null, veins = 4): Draw {
  const cuts: Pt[][] = [];
  for (let i = 0; i < veins; i++) {
    const a = rng.range(0, Math.PI * 2);
    const start: Pt = { x: o.x + Math.cos(a) * o.r * rng.range(0.55, 0.98), y: o.y + Math.sin(a) * o.r * rng.range(0.55, 0.98) };
    cuts.push(wander(rng, start.x, start.y, a + Math.PI + rng.gauss() * 0.6, o.r * rng.range(0.4, 0.8), Math.max(2, o.r * 0.12), 0.45));
  }
  return (ctx, dx) => {
    ctx.beginPath();
    ctx.arc(o.x + dx, o.y, o.r * 0.99, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.4, o.r * 0.045);
    for (const c of cuts) {
      ctx.beginPath();
      ctx.moveTo(c[0]!.x + dx, c[0]!.y);
      for (const p of c) ctx.lineTo(p.x + dx, p.y);
      ctx.stroke();
    }
    claws?.(ctx, dx);
    ctx.restore();
  };
}

/** The rim of a sphere: a ring just inside its edge, lighter than the body (the light is brightest at its limb). */
export const orbRim = (o: Orb): Draw => (ctx, dx) => {
  ctx.save();
  ctx.lineWidth = Math.max(1.5, o.r * 0.11);
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(o.x + dx, o.y, o.r * 0.9, Math.PI * 0.95, Math.PI * 2.05);
  ctx.stroke();
  ctx.restore();
};
