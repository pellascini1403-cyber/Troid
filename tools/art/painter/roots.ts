import { surface, writePixels, type Surface } from './canvas';
import { clamp01, hex, ramp, smoothstep, type Rgb } from './color';
import { column, type Draw } from './forms';
import { DAY, shade, type Look } from './light';
import { MOSS, STONE } from './masonry';
import { rune } from './props';
import { Rng } from './rng';
import { SilhouetteLayer } from './silhouette';
import { wander, type Pt } from './shapes';

/**
 * The roots of the Root Gallery — an arch of them over the hall, curtains that hang from the dark above, a column the forest has taken, a root that crawls over the ground — and
 * the three small things that live in that room: the thorns of the ditch, the shrine where the hero rests and the vial of the fourth bottle. Each is painted as TUBES (a root is round
 * whichever way it runs: `SilhouetteLayer.tube`) and lit with the one light of the game; the bark is a darker, greener ramp than the stone, so a root reads as something that grows
 * on the ruins and not as part of them.
 */
export interface RootOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

const CYAN: Rgb = hex('#3ee8ff');
/** The muted crimson of the thorns' tips: the only warm colour of the room, kept dark and small — danger, not decoration. */
const CRIMSON: Rgb = hex('#b8384f');

/** The bark: near black in the cracks, a grey with a green cast where the light catches it. */
export const BARK = ramp([
  { at: 0.0, colour: [0.012, 0.018, 0.02] },
  { at: 0.25, colour: [0.05, 0.068, 0.07] },
  { at: 0.5, colour: [0.13, 0.165, 0.155] },
  { at: 0.75, colour: [0.28, 0.345, 0.33] },
  { at: 1.0, colour: [0.55, 0.64, 0.6] },
]);

function finish(layer: SilhouetteLayer, look: Look = DAY, tone: (v: number) => Rgb = BARK): Surface {
  const s = surface(layer.w, layer.h);
  writePixels(s, shade(layer.layers(tone, MOSS), look, false));
  return s;
}

/** A cubic Bézier as a polyline of `n + 1` points. */
function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

/** A polyline pushed sideways by a wave that is nothing at either end: strands that braid around each other. */
function braid(path: readonly Pt[], amp: number, freq: number, phase: number): Pt[] {
  const n = path.length;
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(n - 1, i + 1)]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = i / (n - 1);
    const off = Math.sin(Math.PI * t) * Math.sin(phase + freq * Math.PI * 2 * t) * amp;
    return { x: p.x - ((b.y - a.y) / l) * off, y: p.y + ((b.x - a.x) / l) * off };
  });
}

const at = (path: readonly Pt[], t: number): Pt => path[Math.min(path.length - 1, Math.max(0, Math.round(t * (path.length - 1))))]!;

/** Points of light along the roots: the cyan the whole slice uses for what is alive with energy. */
function nodules(layer: SilhouetteLayer, spots: ReadonlyArray<{ x: number; y: number; r: number }>, ppm: number, intensity = 0.85): void {
  if (spots.length === 0) return;
  const draw: Draw = (ctx) => {
    ctx.beginPath();
    for (const s of spots) {
      ctx.moveTo(s.x + s.r, s.y);
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  layer.glow(draw, { x0: 0, y0: 0, x1: layer.w, y1: layer.h }, CYAN, intensity, ppm * 0.09);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the arch

/** An arch made of roots, bigger than a room: two buttressed trunks of braided roots that meet over the hall, with branches, knots and roots hanging from its underside. For a layer behind the action. */
export function rootArch(o: RootOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const foot = h - 3;
  const apexX = w / 2;
  const apexY = h * 0.17;
  const strands: Array<{ path: Pt[]; r0: number; phase: number; tone: number }> = [];
  for (const side of [-1, 1] as const) {
    const n = 10;
    for (let k = 0; k < n; k++) {
      const u = (k + rng.range(0.1, 0.9)) / n;
      const bx = apexX + side * (w * (0.29 + 0.13 * u) + rng.range(-0.25, 0.25) * ppm);
      const base: Pt = { x: bx, y: foot };
      const c1: Pt = { x: bx - side * ppm * rng.range(-0.3, 1.1), y: foot - h * rng.range(0.4, 0.64) };
      const c2: Pt = { x: apexX + side * w * rng.range(0.08, 0.24), y: apexY - h * rng.range(0, 0.06) };
      const end: Pt = { x: apexX - side * w * rng.range(0, 0.1), y: apexY + h * rng.range(0, 0.1) };
      const path = braid(bezier(base, c1, c2, end, 80), ppm * rng.range(0.15, 0.55), rng.range(1.0, 3.2), rng.range(0, 6.28));
      strands.push({ path, r0: ppm * rng.range(0.2, 0.62), phase: rng.range(0, 6.28), tone: rng.range(0.27, 0.5) });
    }
  }
  // the order they are painted in is the order they lie in: the thin ones behind, the thick in front
  strands.sort((a, b) => a.r0 - b.r0);
  const spots: Array<{ x: number; y: number; r: number }> = [];
  const radiusOf = (s: { r0: number; phase: number }) => (t: number): number => s.r0 * (1 - 0.58 * t) * (1 + 0.1 * Math.sin(t * 21 + s.phase));
  for (const s of strands) {
    layer.tube(s.path, radiusOf(s), { tone: s.tone, spread: 0.1, moss: 0.5, grain: 1.2, fade: [0.04, -0.08] });
    if (rng.chance(0.55)) {
      const p = at(s.path, rng.range(0.15, 0.85));
      spots.push({ x: p.x, y: p.y, r: rng.range(1.5, 3) });
    }
  }
  // knots: a swelling on a few of the thick strands, where a branch left
  for (let i = 0; i < 7; i++) {
    const s = strands[rng.int(strands.length / 2, strands.length - 1)]!;
    const t0 = rng.range(0.12, 0.85);
    const i0 = Math.max(0, Math.round(t0 * (s.path.length - 1)) - 4);
    const part = s.path.slice(i0, i0 + 9);
    const rr = radiusOf(s)(t0);
    layer.tube(part, (t) => rr * (1.02 + 0.26 * Math.sin(Math.PI * t)), { tone: s.tone + 0.03, spread: 0.1, moss: 0.5, grain: 1.2 });
  }
  // branches that leave the trunks, outward and down, and thin to nothing
  for (let i = 0; i < 11; i++) {
    const s = strands[rng.int(strands.length / 2, strands.length - 1)]!;
    const t0 = rng.range(0.2, 0.8);
    const idx = Math.round(t0 * (s.path.length - 1));
    const a = s.path[Math.max(0, idx - 1)]!;
    const b = s.path[Math.min(s.path.length - 1, idx + 1)]!;
    const heading = Math.atan2(b.y - a.y, b.x - a.x) + (rng.chance(0.5) ? 1 : -1) * rng.range(0.7, 1.4);
    const p = s.path[idx]!;
    const path = wander(rng, p.x, p.y, heading, ppm * rng.range(1.2, 3.2), ppm * 0.09, 0.2);
    const r0 = ppm * rng.range(0.09, 0.17);
    layer.tube(path, (t) => r0 * (1 - 0.86 * t), { tone: rng.range(0.3, 0.46), spread: 0.08, moss: 0.35, grain: 0.8 });
  }
  // roots that hang from the underside of the arch, thinning to nothing
  for (let i = 0; i < 18; i++) {
    const s = strands[rng.int(strands.length / 2, strands.length - 1)]!;
    const p = at(s.path, rng.range(0.3, 0.92));
    const path = wander(rng, p.x, p.y + 2, Math.PI / 2 + rng.gauss() * 0.16, ppm * rng.range(1.2, 4.6), ppm * 0.08, 0.13);
    const r0 = ppm * rng.range(0.045, 0.12);
    layer.tube(path, (t) => r0 * (1 - 0.88 * t), { tone: rng.range(0.22, 0.34), spread: 0.06, moss: 0.2, grain: 0.6 });
    if (rng.chance(0.3)) {
      const e = path[path.length - 1]!;
      spots.push({ x: e.x, y: e.y, r: rng.range(1.2, 2.2) });
    }
  }
  // the buttresses creep out over the ground
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < 4; k++) {
      const s = strands[rng.int(0, strands.length - 1)]!;
      const p = s.path[0]!;
      const path = wander(rng, p.x + rng.range(-1, 1) * ppm * 0.3, foot - 2, side > 0 ? -0.08 : Math.PI + 0.08, ppm * rng.range(1.2, 3.4), ppm * 0.1, 0.1);
      const r0 = ppm * rng.range(0.16, 0.34);
      layer.tube(path, (t) => r0 * (1 - 0.85 * t), { tone: rng.range(0.26, 0.42), spread: 0.08, moss: 0.5, grain: 1.1 });
    }
  }
  nodules(layer, spots, ppm);
  return finish(layer);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the curtain

/**
 * A curtain of roots hanging from the dark above: a few thick bundles with a crowd of thin strands among them, all of different lengths. `dark` makes it the foreground's (almost
 * black, a little out of focus, never lower than the hero's head); without it, it is the scenery's (mossy, with the odd point of light).
 */
export function rootCurtain(o: RootOptions & { dark?: boolean }): Surface {
  const { w, h, ppm, seed, dark } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const spots: Array<{ x: number; y: number; r: number }> = [];
  const paint = (x: number, len: number, r0: number, tone: number, glowChance: number): void => {
    const path = wander(rng, x, -4, Math.PI / 2 + rng.gauss() * 0.06, len, ppm * 0.1, 0.07);
    layer.tube(path, (t) => r0 * (1 - 0.9 * t ** 0.8) * (1 + 0.08 * Math.sin(t * 17)), { tone: tone + rng.range(-0.02, 0.03), spread: dark ? 0.02 : 0.07, moss: dark ? 0 : 0.3, grain: dark ? 0 : 0.8 });
    if (!dark && rng.chance(glowChance)) {
      const e = at(path, rng.range(0.55, 0.95));
      spots.push({ x: e.x, y: e.y, r: rng.range(1.2, 2.4) });
    }
  };
  const bundles = Math.max(2, Math.round(w / (ppm * 1.8)));
  for (let i = 0; i < bundles; i++) {
    const cx = w * ((i + rng.range(0.25, 0.75)) / bundles);
    const len = h * rng.range(0.5, 1);
    for (let k = 0; k < 4; k++) paint(cx + rng.range(-1, 1) * ppm * 0.14, len * rng.range(0.7, 1), ppm * rng.range(0.14, 0.3), dark ? 0.035 : 0.17, 0.5);
  }
  const strands = Math.round(w / (ppm * 0.28));
  for (let i = 0; i < strands; i++) paint(rng.range(0.03, 0.97) * w, h * rng.range(0.18, 0.85), ppm * rng.range(0.035, 0.09), dark ? 0.03 : 0.14, 0.25);
  nodules(layer, spots, ppm, 0.8);
  if (!dark) return finish(layer);
  const lit = finish(layer, { ...DAY, ambient: [0.1, 0.15, 0.2], key: [0.26, 0.4, 0.5], rim: 0.4, bump: 0.6 });
  const soft = surface(w, h);
  soft.ctx.filter = 'blur(1.3px)';
  soft.ctx.drawImage(lit.canvas, 0, 0);
  return soft;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the column

/** A column of the old gallery that the roots have taken: a few thick strands wind round it, one spills over its broken top and others creep out of its foot — the stone stays visible. For the layer behind the action. */
export function rootPillar(o: RootOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const foot = h - 3;
  const r = ppm * 0.5;
  const top = h * 0.22;
  const c = column(rng, cx, foot, top, r, 'broken');
  layer.add(c.draw, c.box, { round: r * 0.75, tone: 0.42, spread: 0.07, moss: 0.55, fade: [0.05, -0.05], flutes: { count: 7, depth: r * 0.08 } });
  const spots: Array<{ x: number; y: number; r: number }> = [];
  const rootTone = (): number => rng.range(0.16, 0.26);
  // the roots that run down the shaft, wavering
  for (let k = 0; k < 3; k++) {
    const x = cx + (k - 1) * r * 0.62 + rng.range(-0.08, 0.08) * r;
    const path = braid(bezier({ x: cx + (k - 1) * r * 0.3, y: top + r * 0.1 }, { x, y: top + (foot - top) * 0.3 }, { x, y: top + (foot - top) * 0.68 }, { x: x + rng.range(-0.25, 0.25) * r, y: foot - r * 0.5 }, 40), ppm * 0.05, rng.range(1.2, 2.4), rng.range(0, 6.28));
    const r0 = ppm * rng.range(0.07, 0.11);
    layer.tube(path, (t) => r0 * (1.15 - 0.45 * t), { tone: rootTone(), spread: 0.06, moss: 0.3, grain: 1 });
  }
  // the strands that wind round it: each is one pass across the front, climbing from one edge to the other and going behind
  const passes = 5;
  for (let k = 0; k < passes; k++) {
    const slant = k % 2 === 0 ? 1 : -1;
    const y0 = top + r * 1.7 + ((foot - top - r * 3.4) * k) / (passes - 1);
    const R = r * 1.06;
    const pts: Pt[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = -Math.PI / 2 + (i / 28) * Math.PI;
      pts.push({ x: cx + slant * Math.sin(a) * R, y: y0 + (i / 28) * ppm * 0.62 + Math.cos(a) * ppm * 0.1 });
    }
    const r0 = ppm * rng.range(0.085, 0.125);
    layer.tube(pts, (t) => r0 * (0.8 + 0.4 * Math.sin(t * Math.PI)), { tone: rootTone(), spread: 0.07, moss: 0.3, grain: 1 });
    if (rng.chance(0.5)) {
      const p = at(pts, rng.range(0.3, 0.7));
      spots.push({ x: p.x, y: p.y, r: rng.range(1.3, 2.3) });
    }
  }
  // a root that spills over the broken top and hangs down one side
  const side = rng.chance(0.5) ? -1 : 1;
  const over = bezier({ x: cx - side * r * 0.5, y: top + r * 0.5 }, { x: cx - side * r * 0.2, y: top - r * 0.7 }, { x: cx + side * r * 1.7, y: top - r * 0.2 }, { x: cx + side * r * 1.25, y: top + r * 4.2 }, 44);
  const r1 = ppm * 0.17;
  layer.tube(over, (t) => r1 * (1 - 0.82 * t), { tone: 0.24, spread: 0.07, moss: 0.4, grain: 1.2 });
  // and the ones that creep out of its foot
  for (const sd of [-1, 1] as const) {
    const out = wander(rng, cx + sd * r * 0.8, foot - 3, sd > 0 ? -0.06 : Math.PI + 0.06, ppm * rng.range(0.7, 1.1), ppm * 0.08, 0.12);
    const r0 = ppm * rng.range(0.15, 0.22);
    layer.tube(out, (t) => r0 * (1 - 0.82 * t), { tone: 0.26, spread: 0.07, moss: 0.4, grain: 1.1 });
  }
  nodules(layer, spots, ppm, 0.8);
  return finish(layer);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the root on the ground

/** A root that comes out of the ground, arches over it and goes back in, with a smaller one beside it: something to step over, and the line that breaks a flat floor. */
export function rootCrawl(o: RootOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const base = h - 1;
  const spots: Array<{ x: number; y: number; r: number }> = [];
  const loop = (x0: number, x1: number, rise: number, r0: number, tone: number): void => {
    const path = braid(bezier({ x: x0, y: base + 2 }, { x: x0 + (x1 - x0) * 0.1, y: base - rise * 1.25 }, { x: x1 - (x1 - x0) * 0.1, y: base - rise * 1.25 }, { x: x1, y: base + 2 }, 40), ppm * 0.03, 2, rng.range(0, 6));
    layer.tube(path, (t) => r0 * (0.9 + 0.35 * Math.sin(t * Math.PI)) * (1 + 0.06 * Math.sin(t * 25)), { tone, spread: 0.08, moss: 0.55, grain: 1 });
    if (rng.chance(0.7)) {
      const p = at(path, rng.range(0.3, 0.7));
      spots.push({ x: p.x, y: p.y - r0 * 0.4, r: rng.range(1.4, 2.4) });
    }
  };
  loop(w * 0.06, w * 0.62, h * 0.82, ppm * 0.17, 0.22);
  loop(w * 0.5, w * 0.94, h * 0.5, ppm * 0.12, 0.26);
  loop(w * 0.3, w * 0.5, h * 0.3, ppm * 0.07, 0.3);
  nodules(layer, spots, ppm, 0.7);
  return finish(layer);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the thorns

/**
 * The thorns of the ditch (the hazard `spikes`): a PERIODIC strip, `cols` cells of `ppm / 2` px, so a long zone shows no seam. Black, curved, rooted in a mat of roots, their tips a muted
 * crimson — the one warm thing in the room, small, so that the danger is read before it is understood.
 */
export function thorns(o: RootOptions & { cols: number }): Surface {
  const { w, h, ppm, seed, cols } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const base = h - 2;
  const tips: Array<{ x: number; y: number }> = [];
  const total = Math.round((w / ppm) * 18);
  // the mat: a root along the foot, wavering, seamless
  for (const dx of [0, -w, w]) {
    const mat: Pt[] = [];
    for (let x = -4; x <= w + 4; x += 3) mat.push({ x: x + dx, y: base - ppm * 0.05 + Math.sin((x / w) * Math.PI * 2 * cols * 1.5) * ppm * 0.02 });
    layer.tube(mat, () => ppm * 0.075, { tone: 0.14, spread: 0.05, moss: 0.2, grain: 0.6 });
  }
  // embers in the mat at the foot: a few specks of the same muted crimson, so that the bed is read as hot ground even where the tips are hidden by other thorns
  const embers: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < Math.round((w / ppm) * 3); i++) embers.push({ x: rng.range(0.04, 0.96) * w, y: base - ppm * rng.range(0.02, 0.1) });
  const thorns: Array<{ x: number; height: number; lean: number; bw: number; seed: number }> = [];
  for (let i = 0; i < total; i++) {
    const x = ((i + rng.range(0.15, 0.85)) / total) * w;
    // two short ones for every tall one: a bed of thorns is uneven
    const tall = rng.chance(0.38);
    thorns.push({ x, height: ppm * (tall ? rng.range(0.55, 0.7) : rng.range(0.26, 0.46)), lean: ppm * rng.range(-0.13, 0.13), bw: ppm * rng.range(0.07, 0.115), seed: rng.int(0, 1e6) });
  }
  thorns.sort((a, b) => a.height - b.height);
  for (const t of thorns) {
    for (const dx of [0, -w, w]) {
      const path = bezier({ x: t.x + dx, y: base }, { x: t.x + dx + t.lean * 0.1, y: base - t.height * 0.4 }, { x: t.x + dx + t.lean * 0.7, y: base - t.height * 0.75 }, { x: t.x + dx + t.lean, y: base - t.height }, 24);
      layer.tube(path, (u) => Math.max(0.5, t.bw * (1 - u) ** 0.9), { tone: 0.12 + rng.range(0, 0.07), spread: 0.04, grain: 0.4, round: 0.95 });
      if (dx === 0 && t.x > 0 && t.x < w) tips.push({ x: t.x + t.lean, y: base - t.height + ppm * 0.03 });
    }
  }
  // the tips glow, muted
  const draw: Draw = (ctx) => {
    ctx.beginPath();
    for (const p of tips) {
      ctx.moveTo(p.x + 3, p.y);
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  layer.glow(draw, { x0: 0, y0: 0, x1: w, y1: h }, CRIMSON, 1, ppm * 0.075);
  const sparks: Draw = (ctx) => {
    ctx.beginPath();
    for (const e of embers) {
      ctx.moveTo(e.x + 2, e.y);
      ctx.arc(e.x, e.y, 2, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  layer.glow(sparks, { x0: 0, y0: 0, x1: w, y1: h }, CRIMSON, 0.7, ppm * 0.05);
  return finish(layer, DAY);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the shrine

/**
 * The shrine where the hero rests (the interactive `rest`): a dais of two steps, a stone altar that flares into a cup with a ring of runes, roots that rise from the ground and close
 * round the cup like fingers, and over it a crystal. TWO cells side by side: the first is how it waits (the crystal dim), the second how it looks when it is the hero's checkpoint
 * (the crystal burning, with a halo): the game shows the second over the first.
 */
export function shrine(o: RootOptions): Surface {
  const { w: W, h, ppm: density, seed } = o;
  // the shrine is drawn a quarter larger than its density says (the same pixels per metre): it is the landmark of the room, and must be seen from afar
  const ppm = density * 1.25;
  const cell = W / 2;
  const out = surface(W, h);
  for (let state = 0; state < 2; state++) {
    const rng = new Rng(seed);
    const layer = new SilhouetteLayer(cell, h, seed, false);
    const cx = cell / 2;
    const foot = h - 2;
    const lit = state === 1;
    // the dais
    const steps: Draw = (ctx) => {
      ctx.fillRect(cx - ppm * 0.82, foot - ppm * 0.17, ppm * 1.64, ppm * 0.17);
      ctx.fillRect(cx - ppm * 0.6, foot - ppm * 0.34, ppm * 1.2, ppm * 0.17);
    };
    layer.add(steps, { x0: cx - ppm * 0.84, x1: cx + ppm * 0.84, y0: foot - ppm * 0.36, y1: foot }, { round: ppm * 0.09, tone: 0.5, spread: 0.06, moss: 0.5 });
    // the altar: a stout waist that flares into a cup
    const altar: Draw = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(cx - ppm * 0.34, foot - ppm * 0.34);
      ctx.bezierCurveTo(cx - ppm * 0.3, foot - ppm * 0.6, cx - ppm * 0.2, foot - ppm * 0.8, cx - ppm * 0.22, foot - ppm * 1.06);
      ctx.bezierCurveTo(cx - ppm * 0.3, foot - ppm * 1.14, cx - ppm * 0.44, foot - ppm * 1.2, cx - ppm * 0.46, foot - ppm * 1.36);
      ctx.lineTo(cx + ppm * 0.46, foot - ppm * 1.36);
      ctx.bezierCurveTo(cx + ppm * 0.44, foot - ppm * 1.2, cx + ppm * 0.3, foot - ppm * 1.14, cx + ppm * 0.22, foot - ppm * 1.06);
      ctx.bezierCurveTo(cx + ppm * 0.2, foot - ppm * 0.8, cx + ppm * 0.3, foot - ppm * 0.6, cx + ppm * 0.34, foot - ppm * 0.34);
      ctx.closePath();
      ctx.fill();
    };
    layer.add(altar, { x0: cx - ppm * 0.5, x1: cx + ppm * 0.5, y0: foot - ppm * 1.4, y1: foot - ppm * 0.34 }, { round: ppm * 0.26, tone: 0.55, spread: 0.06, moss: 0.35, fade: [0.06, -0.05] });
    // the ring of runes on its waist, lit while it is lit
    const runes: Draw = (ctx) => {
      const r2 = new Rng(seed + 3);
      for (const [dx, dy] of [[-0.05, 0.52], [0.06, 0.76], [-0.03, 0.97]] as const) rune(ctx, cx + dx * ppm, foot - dy * ppm, ppm * 0.16, r2);
    };
    layer.glow(runes, { x0: cx - ppm * 0.3, x1: cx + ppm * 0.3, y0: foot - ppm * 1.1, y1: foot - ppm * 0.42 }, CYAN, lit ? 1.0 : 0.5, ppm * 0.035);
    // the roots: they rise from the ground at either side, bend in and close round the cup
    const spots: Array<{ x: number; y: number; r: number }> = [];
    for (const side of [-1, 1] as const) {
      for (let k = 0; k < 3; k++) {
        const reach = ppm * (1.15 - k * 0.2) + rng.range(-0.05, 0.05) * ppm;
        const path = braid(
          bezier(
            { x: cx + side * reach, y: foot - 2 },
            { x: cx + side * (reach + ppm * 0.18), y: foot - ppm * (0.55 + k * 0.1) },
            { x: cx + side * ppm * (0.62 - k * 0.1), y: foot - ppm * (1.0 + k * 0.07) },
            { x: cx + side * ppm * (0.16 + k * 0.1), y: foot - ppm * (1.5 + k * 0.1) },
            34,
          ),
          ppm * 0.03,
          rng.range(1.5, 2.5),
          rng.range(0, 6.28),
        );
        const r0 = ppm * (0.11 - k * 0.018);
        layer.tube(path, (t) => r0 * (1.1 - 0.82 * t), { tone: rng.range(0.3, 0.42), spread: 0.07, moss: 0.4, grain: 1.1 });
        if (rng.chance(0.75)) {
          const p = at(path, rng.range(0.3, 0.8));
          spots.push({ x: p.x, y: p.y, r: 1.9 });
        }
      }
    }
    nodules(layer, spots, ppm, lit ? 1.0 : 0.55);
    // the crystal over the cup, with two shards that hang with it
    const crystalY = foot - ppm * 2.05;
    const crystal: Draw = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(cx, crystalY - ppm * 0.34);
      ctx.lineTo(cx + ppm * 0.19, crystalY);
      ctx.lineTo(cx, crystalY + ppm * 0.34);
      ctx.lineTo(cx - ppm * 0.19, crystalY);
      ctx.closePath();
      for (const [dx, dy, k] of [[-0.46, 0.18, 0.5], [0.5, 0.06, 0.42]] as const) {
        ctx.moveTo(cx + dx * ppm, crystalY + dy * ppm - ppm * 0.17 * k * 2);
        ctx.lineTo(cx + dx * ppm + ppm * 0.07 * k * 2, crystalY + dy * ppm);
        ctx.lineTo(cx + dx * ppm, crystalY + dy * ppm + ppm * 0.17 * k * 2);
        ctx.lineTo(cx + dx * ppm - ppm * 0.07 * k * 2, crystalY + dy * ppm);
        ctx.closePath();
      }
      ctx.fill();
    };
    const box = { x0: cx - ppm * 0.6, x1: cx + ppm * 0.6, y0: crystalY - ppm * 0.4, y1: crystalY + ppm * 0.5 };
    layer.add(crystal, box, { round: ppm * 0.1, tone: lit ? 0.75 : 0.42, spread: 0.04 });
    // the halo reaches far past the crystal: it is read over the whole cell, or its edge would show as a box
    layer.glow(crystal, { x0: 0, y0: 0, x1: cell, y1: h }, CYAN, lit ? 1.2 : 0.42, lit ? ppm * 0.42 : ppm * 0.2);
    const cellSurface = finish(layer, DAY, STONE);
    out.ctx.drawImage(cellSurface.canvas, state * cell, 0);
    if (lit) {
      // a pool of light on the ground under it, so that a shrine that is the checkpoint is told from afar
      const pool = out.ctx.createRadialGradient(state * cell + cx, foot - ppm * 0.05, 0, state * cell + cx, foot - ppm * 0.05, ppm * 1.5);
      pool.addColorStop(0, 'rgba(120,235,255,0.34)');
      pool.addColorStop(1, 'rgba(120,235,255,0)');
      out.ctx.save();
      out.ctx.translate(0, foot - ppm * 0.05);
      out.ctx.scale(1, 0.18);
      out.ctx.translate(0, -(foot - ppm * 0.05));
      out.ctx.fillStyle = pool;
      out.ctx.fillRect(state * cell, 0, cell, h * 6);
      out.ctx.restore();
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the vial

/**
 * The fourth bottle (the pickup that gives a bottle slot): the vial of the HUD, painted as light — it is drawn additively over the hall, so what is dark in it is not there. A glass
 * of cold cyan with its liquid burning, a white cork and a soft halo.
 */
export function vial(o: RootOptions): Surface {
  const { w, h, ppm } = o;
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const cy = h * 0.56;
  const k = ppm / 96;
  // the halo
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
  halo.addColorStop(0, 'rgba(90,230,255,0.42)');
  halo.addColorStop(0.55, 'rgba(60,200,255,0.12)');
  halo.addColorStop(1, 'rgba(60,200,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  // the glass: a neck, shoulders and a round body (the outline of the HUD's vial)
  const glass = new Path2D();
  const X = (v: number): number => cx + v * ppm;
  const Y = (v: number): number => cy + v * ppm;
  glass.moveTo(X(-0.06), Y(-0.27));
  glass.lineTo(X(0.06), Y(-0.27));
  glass.lineTo(X(0.06), Y(-0.15));
  glass.bezierCurveTo(X(0.2), Y(-0.1), X(0.2), Y(0.04), X(0.2), Y(0.17));
  glass.bezierCurveTo(X(0.2), Y(0.28), X(0.12), Y(0.31), X(0), Y(0.31));
  glass.bezierCurveTo(X(-0.12), Y(0.31), X(-0.2), Y(0.28), X(-0.2), Y(0.17));
  glass.bezierCurveTo(X(-0.2), Y(0.04), X(-0.2), Y(-0.1), X(-0.06), Y(-0.15));
  glass.closePath();
  ctx.save();
  ctx.fillStyle = 'rgba(120,225,255,0.2)';
  ctx.fill(glass);
  // the liquid: burning at the bottom, paler toward its surface
  ctx.clip(glass);
  const liquid = ctx.createLinearGradient(0, Y(-0.02), 0, Y(0.31));
  liquid.addColorStop(0, 'rgba(120,235,255,0.75)');
  liquid.addColorStop(1, 'rgba(40,190,255,1)');
  ctx.fillStyle = liquid;
  ctx.fillRect(X(-0.25), Y(0.0), ppm * 0.5, ppm * 0.4);
  ctx.fillStyle = 'rgba(230,255,255,0.9)';
  ctx.fillRect(X(-0.25), Y(-0.01), ppm * 0.5, Math.max(1, 1.5 * k));
  ctx.restore();
  // the outline, a highlight down the left and the cork
  ctx.lineWidth = Math.max(1, 3 * k);
  ctx.strokeStyle = 'rgba(190,245,255,0.95)';
  ctx.stroke(glass);
  ctx.beginPath();
  ctx.lineWidth = Math.max(1, 2.4 * k);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.moveTo(X(-0.14), Y(0.04));
  ctx.quadraticCurveTo(X(-0.15), Y(0.2), X(-0.09), Y(0.25));
  ctx.stroke();
  ctx.fillStyle = 'rgba(245,255,255,0.97)';
  ctx.fillRect(X(-0.075), Y(-0.34), ppm * 0.15, ppm * 0.075);
  ctx.fillStyle = 'rgba(160,220,240,0.9)';
  ctx.fillRect(X(-0.075), Y(-0.29), ppm * 0.15, ppm * 0.025);
  // a few motes of light rising from it
  ctx.fillStyle = 'rgba(210,252,255,0.9)';
  for (const [mx, my, mr] of [[0.0, -0.46, 1.6], [0.12, -0.52, 1.1], [-0.1, -0.58, 1.2]] as const) {
    ctx.beginPath();
    ctx.arc(X(mx), Y(my) + (clamp01(0.2 + smoothstep(0, 1, mr)) - 0.2), Math.max(0.8, mr * k), 0, Math.PI * 2);
    ctx.fill();
  }
  return s;
}
