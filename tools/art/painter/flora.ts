import { surface, writePixels, type Surface } from './canvas';
import { hex, mixRgb, type Rgb } from './color';
import { archRing, column, crown, vine, wallStub, type Draw } from './forms';
import { DAY, shade, type Look } from './light';
import { MOSS, STONE } from './masonry';
import { Rng } from './rng';
import { SilhouetteLayer } from './silhouette';
import { blade, blobPath, leaf, roughen, taper, wander, type Pt } from './shapes';
import { rune } from './props';

/**
 * The props of the scenery — ferns, grass, rubble, crystals, mushrooms, columns, roots, an effigy — each a small picture painted as shapes with a roundness and lit with the
 * one light of the game. They are placed by the scene of a room (`roomScene.ts`), in any layer.
 */
export interface PropOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

const CYAN: Rgb = hex('#3ee8ff');
const TEAL_LEAF = (v: number): Rgb => mixRgb(MOSS(0.2 + v * 0.5), STONE(0.3 + v * 0.3), 0.35);

function finish(layer: SilhouetteLayer, look: Look = DAY, ramp: (v: number) => Rgb = STONE): Surface {
  const s = surface(layer.w, layer.h);
  writePixels(s, shade(layer.layers(ramp, MOSS), look, false));
  return s;
}

/** A clump of ferns: fronds that arch out from one point on the ground, each with leaflets that shrink toward its tip. */
export function ferns(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const n = rng.int(6, 9);
  const baseX = w / 2;
  const baseY = h - 2;
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const spread = rng.range(0.15, 1.15);
    const len = Math.min(h * 0.95, ppm * rng.range(0.7, 1.35));
    const dirX = side * Math.sin(spread);
    const dirY = -Math.cos(spread);
    const pts: Pt[] = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      // the stem rises, then arches over
      pts.push({ x: baseX + dirX * len * t + side * len * 0.35 * t * t, y: baseY + dirY * len * t + len * 0.55 * t * t * t - len * 0.1 * t });
    }
    const draw: Draw = (ctx) => {
      taper(ctx, pts, ppm * 0.03, ppm * 0.01);
      for (let k = 2; k < pts.length; k++) {
        const p = pts[k]!;
        const q = pts[k - 1]!;
        const a = Math.atan2(p.y - q.y, p.x - q.x);
        const size = ppm * 0.26 * (1 - k / pts.length) ** 0.8 + ppm * 0.02;
        leaf(ctx, p.x, p.y, size, size * 0.2, a - 1.05);
        leaf(ctx, p.x, p.y, size, size * 0.2, a + 1.05);
      }
    };
    layer.add(draw, { x0: baseX - len * 1.3, x1: baseX + len * 1.3, y0: baseY - len * 1.1, y1: baseY + 2 }, { round: 1.2, tone: rng.range(0.22, 0.34), spread: 0.08, moss: 0.35 });
  }
  return finish(layer, DAY, TEAL_LEAF);
}

/** Tufts of grass: blades in clumps that lean a little, dark with a lit tip. */
export function grass(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const clumps = rng.int(2, 4);
  for (let c = 0; c < clumps; c++) {
    const cx = w * rng.range(0.2, 0.8);
    const n = rng.int(5, 10);
    const draw: Draw = (ctx) => {
      for (let k = 0; k < n; k++) blade(ctx, cx + rng.range(-ppm * 0.12, ppm * 0.12), h - 1, h * rng.range(0.45, 0.98), rng.range(-0.3, 0.3) * h, ppm * rng.range(0.025, 0.045));
    };
    layer.add(draw, { x0: 0, x1: w, y0: 0, y1: h }, { round: 0.8, tone: rng.range(0.2, 0.3), spread: 0.06 });
  }
  return finish(layer, DAY, TEAL_LEAF);
}

/** A pile of fallen stones: angular chunks of different sizes, mossy where they lie on each other. */
export function rubble(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const n = rng.int(6, 10);
  const stones = Array.from({ length: n }, (_, i) => {
    const t = (i + rng.range(0.2, 0.8)) / n;
    const size = ppm * rng.range(0.22, 0.6) * (1 - Math.abs(t - 0.5) * 0.9);
    return { x: w * (0.08 + 0.84 * t), size, rot: rng.range(-0.5, 0.5), seed: rng.int(0, 1e6) };
  }).sort((a, b) => b.size - a.size);
  for (const s of stones) {
    const sr = new Rng(s.seed);
    const sides = sr.int(5, 7);
    const pts: Pt[] = Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2 + s.rot;
      const r = s.size * sr.range(0.6, 1);
      return { x: s.x + Math.cos(a) * r * 1.25, y: h - s.size * 0.5 + Math.sin(a) * r * 0.75 };
    });
    const draw: Draw = (ctx) => {
      ctx.beginPath();
      pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, Math.min(h - 1, p.y)) : ctx.lineTo(p.x, Math.min(h - 1, p.y))));
      ctx.closePath();
      ctx.fill();
    };
    layer.add(draw, { x0: s.x - s.size * 1.4, x1: s.x + s.size * 1.4, y0: h - s.size * 1.6, y1: h }, { round: s.size * 0.45, tone: sr.range(0.2, 0.34), spread: 0.08, moss: 0.5 });
  }
  return finish(layer);
}

/** A cluster of crystals that give out cold light: faceted prisms leaning out from one point, each glowing from within. */
export function crystals(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const lean = (i - (n - 1) / 2) * 0.22 + rng.range(-0.1, 0.1);
    const len = h * rng.range(0.4, 0.9);
    const wd = ppm * rng.range(0.1, 0.2);
    const bx = w / 2 + (i - (n - 1) / 2) * ppm * 0.14;
    const by = h - 3;
    const tipX = bx + Math.sin(lean) * len;
    const tipY = by - Math.cos(lean) * len;
    const nx = Math.cos(lean);
    const ny = Math.sin(lean);
    const draw: Draw = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(bx - nx * wd, by - ny * wd);
      ctx.lineTo(bx - nx * wd * 0.9 + (tipX - bx) * 0.8, by - ny * wd * 0.9 + (tipY - by) * 0.8);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(bx + nx * wd * 0.9 + (tipX - bx) * 0.8, by + ny * wd * 0.9 + (tipY - by) * 0.8);
      ctx.lineTo(bx + nx * wd, by + ny * wd);
      ctx.closePath();
      ctx.fill();
    };
    const box = { x0: Math.min(bx, tipX) - wd * 2, x1: Math.max(bx, tipX) + wd * 2, y0: tipY - 2, y1: by + 2 };
    layer.add(draw, box, { round: wd * 0.6, tone: 0.55, spread: 0.1 });
    layer.glow(draw, box, CYAN, 0.55, ppm * 0.12);
  }
  return finish(layer);
}

/** Mushrooms with a faint cold glow in their caps. */
export function mushrooms(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const x = w * (0.15 + 0.7 * ((i + rng.range(0.2, 0.8)) / n));
    const stem = h * rng.range(0.3, 0.7);
    const cap = ppm * rng.range(0.12, 0.26);
    const stemDraw: Draw = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(x - ppm * 0.04, h - 1);
      ctx.quadraticCurveTo(x - ppm * 0.02, h - stem * 0.5, x - ppm * 0.03, h - stem);
      ctx.lineTo(x + ppm * 0.03, h - stem);
      ctx.quadraticCurveTo(x + ppm * 0.03, h - stem * 0.5, x + ppm * 0.05, h - 1);
      ctx.closePath();
      ctx.fill();
    };
    const capDraw: Draw = (ctx) => {
      ctx.beginPath();
      ctx.ellipse(x, h - stem, cap, cap * 0.55, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    };
    layer.add(stemDraw, { x0: x - ppm, x1: x + ppm, y0: h - stem - 2, y1: h }, { round: ppm * 0.03, tone: 0.34, spread: 0.05 });
    layer.add(capDraw, { x0: x - cap - 2, x1: x + cap + 2, y0: h - stem - cap, y1: h - stem + 2 }, { round: cap * 0.5, tone: 0.28, spread: 0.06 });
    layer.glow(capDraw, { x0: x - cap - 2, x1: x + cap + 2, y0: h - stem - cap, y1: h - stem + 2 }, CYAN, 0.32, ppm * 0.09);
  }
  return finish(layer);
}

/** A column standing in the ruins in front of the backdrop: whole or broken, fluted, mossy, ivy on it. */
export function columnProp(o: PropOptions & { state: 'whole' | 'broken'; heightM: number }): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const r = ppm * 0.42;
  const c = column(rng, w / 2, h - 2, h - 2 - ppm * o.heightM, r, o.state);
  layer.add(c.draw, c.box, { round: r * 0.75, tone: rng.range(0.28, 0.36), spread: 0.08, moss: 0.55, fade: [0.04, -0.03], flutes: { count: 8, depth: r * 0.07 } });
  if (rng.chance(0.8)) {
    const v = vine(rng, w / 2 + rng.range(-r, r), h - 2 - ppm * o.heightM + r, ppm * rng.range(1, 2.4), ppm * 0.05);
    layer.add(v.draw, v.box, { round: 1.5, tone: 0.2, spread: 0.04, moss: 0.4 });
  }
  return finish(layer);
}

/** A standing stone with runes cut into it that glow cold. */
export function runeStone(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const sw = w * 0.5;
  const top = h * 0.08;
  const pts = roughen(
    [
      { x: w / 2 - sw / 2, y: h - 2 },
      { x: w / 2 - sw * 0.46, y: top + h * 0.1 },
      { x: w / 2 - sw * 0.1, y: top },
      { x: w / 2 + sw * 0.4, y: top + h * 0.06 },
      { x: w / 2 + sw / 2, y: h - 2 },
    ],
    rng,
    ppm * 0.03,
    ppm * 0.2,
  );
  const draw: Draw = (ctx) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  };
  layer.add(draw, { x0: w / 2 - sw, x1: w / 2 + sw, y0: 0, y1: h }, { round: sw * 0.18, tone: 0.3, spread: 0.07, moss: 0.4, fade: [0.04, -0.03] });
  const runes: Draw = (ctx) => {
    const rr = new Rng(seed + 3);
    ctx.strokeStyle = '#fff';
    const rows = 4;
    for (let k = 0; k < rows; k++) rune(ctx, w / 2, top + h * (0.2 + (0.62 * k) / rows), ppm * 0.3, rr);
  };
  layer.glow(runes, { x0: w / 2 - ppm * 0.4, x1: w / 2 + ppm * 0.4, y0: top, y1: h }, CYAN, 0.8, ppm * 0.08);
  return finish(layer);
}

/** Roots hanging from above: bundles that wander down and thin to nothing, over a knot at the top. */
export function hangingRoots(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const n = rng.int(5, 9);
  for (let i = 0; i < n; i++) {
    const x = w * (0.12 + 0.76 * ((i + rng.range(0.1, 0.9)) / n));
    const pts = wander(rng, x, 0, Math.PI / 2 + rng.gauss() * 0.12, h * rng.range(0.4, 0.98), ppm * 0.06, 0.2);
    const w0 = ppm * rng.range(0.05, 0.12);
    const draw: Draw = (ctx) => taper(ctx, pts, w0, w0 * 0.15);
    layer.add(draw, { x0: Math.min(...pts.map((p) => p.x)) - w0, x1: Math.max(...pts.map((p) => p.x)) + w0, y0: 0, y1: h }, { round: w0 * 0.5, tone: rng.range(0.14, 0.24), spread: 0.06, moss: 0.2 });
  }
  const knot: Draw = (ctx) => {
    const r2 = new Rng(seed + 9);
    blobPath(ctx, w / 2, 0, w * 0.42, ppm * 0.16, r2, 8, 0.3);
    ctx.fill();
  };
  layer.add(knot, { x0: 0, x1: w, y0: 0, y1: ppm * 0.4 }, { round: ppm * 0.08, tone: 0.18, spread: 0.06 });
  return finish(layer);
}

/** The effigy of a guardian: a hooded figure of stone on a plinth, its hands on the hilt of a great sword planted before it. Faceless: a dark hood with two points of cold light. */
export function effigy(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const base = h - 2;
  const plinth: Draw = (ctx) => {
    ctx.fillRect(cx - ppm * 0.62, base - ppm * 0.34, ppm * 1.24, ppm * 0.34);
    ctx.fillRect(cx - ppm * 0.5, base - ppm * 0.5, ppm * 1, ppm * 0.18);
  };
  layer.add(plinth, { x0: cx - ppm * 0.7, x1: cx + ppm * 0.7, y0: base - ppm * 0.55, y1: base }, { round: ppm * 0.1, tone: 0.3, spread: 0.05, moss: 0.4 });
  const body: Draw = (ctx) => {
    const top = base - h * 0.92;
    ctx.beginPath();
    // the cloak: a bell from the shoulders to the plinth
    ctx.moveTo(cx - ppm * 0.42, base - ppm * 0.5);
    ctx.bezierCurveTo(cx - ppm * 0.44, base - h * 0.5, cx - ppm * 0.4, top + h * 0.2, cx - ppm * 0.22, top + h * 0.12);
    ctx.bezierCurveTo(cx - ppm * 0.2, top + h * 0.02, cx - ppm * 0.14, top, cx, top);
    ctx.bezierCurveTo(cx + ppm * 0.14, top, cx + ppm * 0.2, top + h * 0.02, cx + ppm * 0.22, top + h * 0.12);
    ctx.bezierCurveTo(cx + ppm * 0.4, top + h * 0.2, cx + ppm * 0.44, base - h * 0.5, cx + ppm * 0.42, base - ppm * 0.5);
    ctx.closePath();
    ctx.fill();
    // the sword: a long blade planted before it, the guard and the hilt under the hands
    ctx.fillRect(cx - ppm * 0.035, top + h * 0.33, ppm * 0.07, base - ppm * 0.5 - (top + h * 0.33));
    ctx.fillRect(cx - ppm * 0.22, top + h * 0.33, ppm * 0.44, ppm * 0.06);
  };
  layer.add(body, { x0: cx - ppm * 0.6, x1: cx + ppm * 0.6, y0: 0, y1: base }, { round: ppm * 0.3, tone: 0.24, spread: 0.06, moss: 0.35, fade: [0.05, -0.02] });
  const eyes: Draw = (ctx) => {
    const top = base - h * 0.92;
    ctx.beginPath();
    ctx.arc(cx - ppm * 0.055, top + h * 0.075, ppm * 0.022, 0, Math.PI * 2);
    ctx.arc(cx + ppm * 0.055, top + h * 0.075, ppm * 0.022, 0, Math.PI * 2);
    ctx.fill();
  };
  layer.glow(eyes, { x0: cx - ppm * 0.2, x1: cx + ppm * 0.2, y0: base - h * 0.92, y1: base - h * 0.8 }, CYAN, 0.9, ppm * 0.05);
  return finish(layer);
}

/** A colossal arch and its two broken piers, for the layers behind the action: bigger than a room. */
export function ruinedArch(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const foot = h - 2;
  const r = ppm * 0.9;
  const span = (w - r * 6) / 2;
  const left = r * 2 + 0;
  const right = w - r * 2;
  const hgt = h * 0.78;
  const l = column(rng, left, foot, foot - hgt, r, 'whole');
  const rr = column(rng, right, foot, foot - hgt * 0.72, r, 'broken');
  layer.add(l.draw, l.box, { round: r * 0.75, tone: 0.2, spread: 0.07, moss: 0.5, fade: [0.03, -0.02], flutes: { count: 9, depth: r * 0.06 } });
  layer.add(rr.draw, rr.box, { round: r * 0.75, tone: 0.2, spread: 0.07, moss: 0.5, fade: [0.03, -0.02], flutes: { count: 9, depth: r * 0.06 } });
  const top = foot - hgt + r * 0.5;
  layer.add(archRing((left + right) / 2, top + span * 0.12, span + r, span - r * 0.5, 0.35, Math.PI - 0.08), { x0: left - r, x1: right + r, y0: top - span * 1.2, y1: top + span * 0.4 }, { round: r * 0.5, tone: 0.18, spread: 0.06, moss: 0.45 });
  const wall = wallStub(rng, left + r * 2, foot, (right - left) / 2 - r * 3, ppm * 1.4);
  layer.add(wall.draw, wall.box, { round: ppm * 0.2, tone: 0.16, spread: 0.06, moss: 0.5 });
  const v = vine(rng, left, top + r, ppm * 3, ppm * 0.09);
  layer.add(v.draw, v.box, { round: 2, tone: 0.12, spread: 0.04 });
  const c = crown(rng, (left + right) / 2, top - span * 0.7, ppm * 2.6, ppm * 1.2);
  layer.add(c.draw, c.box, { round: ppm * 0.3, tone: 0.1, spread: 0.04 });
  return finish(layer, DAY);
}

export type { Pt };

/** Leaves close to the eye: a dark mass that hangs from the top of the picture, almost black, a little out of focus. In front of everything, never over the hero's band. */
export function foreLeaves(o: PropOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const c = crown(rng, w / 2, h * 0.05, w * 0.46, h * 0.62);
  layer.add(c.draw, c.box, { round: ppm * 0.3, tone: 0.03, spread: 0.02 });
  for (let i = 0; i < 3; i++) {
    const v = vine(rng, w * rng.range(0.2, 0.8), h * 0.3, h * rng.range(0.4, 0.8), ppm * 0.12);
    layer.add(v.draw, v.box, { round: 2, tone: 0.025, spread: 0.01 });
  }
  const dim: Look = { ...DAY, ambient: [0.12, 0.17, 0.24], key: [0.3, 0.45, 0.55], rim: 0.45, bump: 0.6 };
  const lit = finish(layer, dim);
  const soft = surface(w, h);
  soft.ctx.filter = 'blur(1.4px)';
  soft.ctx.drawImage(lit.canvas, 0, 0);
  return soft;
}
