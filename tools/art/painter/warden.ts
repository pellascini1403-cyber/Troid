import { surface, writePixels, type Surface } from './canvas';
import { hex, ramp, type Rgb } from './color';
import type { Draw } from './forms';
import { DAY, shade, type Layers, type Look } from './light';
import { rune } from './props';
import { Rng } from './rng';
import { SilhouetteLayer } from './silhouette';
import { blobPath, wander } from './shapes';

/**
 * The Ink Warden (docs/PROMPT6-LOG.md S29; presentation: docs/PROMPT8-LOG.md phase F): the guardian of the Sanctum, painted. ORIGINAL and abstract on purpose — a column of ink that stands as a cloak with a hood,
 * a crest of violet light that floats over it, two shards at its sides and one pale slit where a face would be; no face, no limbs. It is the same cloak and the same hood as the stone guardians of the hall behind it
 * (`sanctum.ts`): the Warden is one of them, woken, and made of what the arena's floor is stained with. Violet is the colour of what hurts the hero (docs/GAME-SPEC-2D.md §3.4); it is also the colour of this piece.
 *
 * It comes in PARTS, because the game moves them (the pose is the simulation's state, read by the view): the body, the eye, the crest in three states (dim, awake, enraged), a shard and the pool it melts into.
 */
export interface WardenOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

const VIOLET: Rgb = hex('#9a5cff');
const VIOLET_HOT: Rgb = hex('#d3b8ff');

/** Wet ink: near black, a cold violet where the light catches it. */
const INK = ramp([
  { at: 0, colour: [0.01, 0.008, 0.025] },
  { at: 0.3, colour: [0.03, 0.024, 0.07] },
  { at: 0.6, colour: [0.1, 0.075, 0.2] },
  { at: 1, colour: [0.4, 0.31, 0.66] },
]);

/** The one light of the game, bent toward violet: ink is lit by what is round it, and the rim of a wet thing is bright. */
const INK_LOOK: Look = { ...DAY, key: [0.7, 0.52, 1.0], ambient: [0.16, 0.12, 0.34], rim: 1.0, rimColour: [0.72, 0.58, 1.0], cavity: 0.5, exposure: 1.1 };

const rgba = (c: Rgb, a: number): string => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

const lightInk = (layers: Layers): Surface => {
  const s = surface(layers.w, layers.h);
  writePixels(s, shade(layers, INK_LOOK, false));
  return s;
};

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the body

/**
 * The body, in two cells (the ink and a white flash of the same silhouette): a cloak of wet ink with its hood up, a seam of violet light down the front with a column of glyphs on it, veins of light under the surface, a hem that scallops and drips down to the floor, and
 * a dark where the face is not. 2.6 × 3.0 m, standing on the bottom edge of the picture (the game places its feet on the ground).
 */
export function wardenBody(o: WardenOptions): Surface {
  const ink = wardenInk(o);
  // two cells side by side: the ink, and the same silhouette in white — the flash of a hit (the game lays it over the ink, added)
  const out = surface(o.w * 2, o.h);
  out.ctx.drawImage(ink.canvas, 0, 0);
  const white = surface(o.w, o.h);
  white.ctx.drawImage(ink.canvas, 0, 0);
  white.ctx.globalCompositeOperation = 'source-in';
  white.ctx.fillStyle = '#fff';
  white.ctx.fillRect(0, 0, o.w, o.h);
  out.ctx.drawImage(white.canvas, o.w, 0);
  return out;
}

function wardenInk(o: WardenOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const foot = h - 1;
  const hem = foot - 0.3 * u;
  const topY = 0.12 * u;
  const H = hem - topY;
  // half the width of the cloak (m) at each height (0 at the hem … 1 at the tip of the hood): narrow for a column of ink — it is not wider than the body the game fights (0.8 m a side) except at the hem
  const stops: ReadonlyArray<readonly [number, number]> = [[0, 0.98], [0.08, 0.9], [0.4, 0.68], [0.6, 0.8], [0.68, 0.5], [0.76, 0.6], [0.9, 0.5], [0.96, 0.26]];
  const half = (t: number): number => {
    if (t >= 0.96) return 0.26 * Math.sqrt(Math.max(0, 1 - ((t - 0.96) / 0.04) ** 2));
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, w0] = stops[i]!;
      const [t1, w1] = stops[i + 1]!;
      if (t <= t1) {
        const k = (t - t0) / (t1 - t0);
        return w0 + (w1 - w0) * (k * k * (3 - 2 * k));
      }
    }
    return 0;
  };
  // the hem is a ragged edge of ink running down: tongues of different lengths, each ending in a thread that thins to nothing — not feet
  const tongues: Array<{ x: number; len: number; wd: number }> = [];
  for (let x = -0.9; x <= 0.9; x += rng.range(0.14, 0.26)) tongues.push({ x: cx + x * u, len: rng.range(0.04, 0.28) * u, wd: rng.range(0.08, 0.15) * u });
  const hemY = (x: number): number => {
    let y = hem;
    for (const t of tongues) {
      const d = Math.abs(x - t.x);
      if (d < t.wd) y = Math.max(y, hem + t.len * (1 - (d / t.wd) ** 2));
    }
    return y + Math.sin((x - cx) / (0.09 * u) + seed) * 0.012 * u;
  };
  const cloak: Draw = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(cx - 0.98 * u, hemY(cx - 0.98 * u));
    for (let i = 0; i <= 90; i++) ctx.lineTo(cx - half(i / 90) * u, hem - H * (i / 90));
    for (let i = 90; i >= 0; i--) ctx.lineTo(cx + half(i / 90) * u, hem - H * (i / 90));
    for (let x = cx + 0.98 * u; x >= cx - 0.98 * u; x -= 1.5) ctx.lineTo(x, hemY(x));
    ctx.closePath();
    ctx.fill();
  };
  layer.add(cloak, { x0: cx - 1.05 * u, x1: cx + 1.05 * u, y0: topY, y1: hem + 0.32 * u }, { round: 0.9 * u, tone: 0.34, spread: 0.14, fade: [0.14, -0.05], flutes: { count: 5, depth: 0.12 * u } });
  // threads of ink that run on from the longest tongues to the floor
  const threads: Draw = (ctx) => {
    for (const t of tongues) {
      if (t.len < 0.2 * u) continue;
      const top = hem + t.len * 0.8;
      const bottom = foot - rng.range(0, 0.04) * u;
      const wd = Math.max(0.8, u * 0.022);
      ctx.beginPath();
      ctx.moveTo(t.x - wd, top);
      ctx.quadraticCurveTo(t.x - wd * 0.3, (top + bottom) / 2, t.x, bottom);
      ctx.quadraticCurveTo(t.x + wd * 0.3, (top + bottom) / 2, t.x + wd, top);
      ctx.closePath();
      ctx.fill();
    }
  };
  layer.add(threads, { x0: cx - 1.1 * u, x1: cx + 1.1 * u, y0: hem, y1: foot }, { round: 0.03 * u, tone: 0.14, spread: 0.04 });
  // the dark of the hood: the face that is not there
  const faceY = hem - H * 0.83;
  layer.add((ctx) => { ctx.beginPath(); ctx.ellipse(cx, faceY, 0.3 * u, 0.5 * u, 0, 0, Math.PI * 2); ctx.fill(); }, { x0: cx - 0.34 * u, x1: cx + 0.34 * u, y0: faceY - 0.54 * u, y1: faceY + 0.54 * u }, { round: 0.06 * u, tone: 0.0, spread: 0 });
  // the seam of light down the front, with its glyphs, and the veins that run under the surface
  const seam: Draw = (ctx) => {
    ctx.fillRect(cx - Math.max(0.8, u * 0.018), faceY + 0.52 * u, Math.max(1.6, u * 0.036), hem - (faceY + 0.52 * u) - 0.05 * u);
  };
  layer.glow(seam, { x0: cx - 0.2 * u, x1: cx + 0.2 * u, y0: faceY, y1: hem }, VIOLET, 0.55, u * 0.05);
  const glyphs: Draw = (ctx) => {
    const r2 = new Rng(seed + 11);
    ctx.strokeStyle = '#fff';
    for (const y of [0.5, 0.78, 1.06, 1.34, 1.62]) rune(ctx, cx, hem - y * u, u * 0.17, r2);
  };
  layer.glow(glyphs, { x0: cx - 0.3 * u, x1: cx + 0.3 * u, y0: hem - 1.8 * u, y1: hem - 0.3 * u }, VIOLET, 0.5, u * 0.04);
  const veins: Draw = (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.1, u * 0.02);
    for (let i = 0; i < 9; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const y0 = hem - rng.range(0.7, 2.0) * u;
      const pts = wander(rng, cx + side * rng.range(0.06, 0.18) * u, y0, side > 0 ? -0.35 : Math.PI + 0.35, rng.range(0.4, 0.8) * u, u * 0.07, 0.4);
      ctx.beginPath();
      pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  };
  layer.glow(veins, { x0: cx - 1.0 * u, x1: cx + 1.0 * u, y0: topY, y1: hem }, VIOLET, 0.4, u * 0.04);
  // a gleam along the shoulder and the hood: the wet of the ink, where the light comes from
  const gleam: Draw = (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.4, u * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx - 0.52 * u, hem - H * 0.72);
    ctx.bezierCurveTo(cx - 0.62 * u, hem - H * 0.8, cx - 0.5 * u, hem - H * 0.92, cx - 0.2 * u, hem - H * 0.97);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 0.92 * u, hem - H * 0.58);
    ctx.quadraticCurveTo(cx - 0.84 * u, hem - H * 0.7, cx - 0.62 * u, hem - H * 0.71);
    ctx.stroke();
  };
  layer.glow(gleam, { x0: cx - 1.0 * u, x1: cx, y0: topY, y1: hem - H * 0.4 }, VIOLET_HOT, 0.28, u * 0.03);
  // the edge of the cloak catches the light of the crest and the aura: a thin line of violet all round it
  const outline: Draw = (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.2, u * 0.022);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const x = cx - half(i / 90) * u;
      const y = hem - H * (i / 90);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const x = cx + half(i / 90) * u;
      const y = hem - H * (i / 90);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  layer.glow(outline, { x0: cx - 1.1 * u, x1: cx + 1.1 * u, y0: topY, y1: hem }, VIOLET, 0.3, u * 0.025);
  return lightInk(layer.layers(INK, INK));
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the eye

/** The eye: one pale slit with a violet halo, painted as light for the additive layer — the game turns it up and down with what the Warden is doing. 1.2 × 0.5 m, the slit at its middle. */
export function wardenEye(o: WardenOptions): Surface {
  const { w, h, ppm: u } = o;
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const cy = h / 2;
  // the halo is an ellipse that ends INSIDE the picture: what is drawn over the world must not touch the edges of its canvas
  const rx = w * 0.47;
  const ry = h * 0.45;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  halo.addColorStop(0, 'rgba(190,150,255,0.55)');
  halo.addColorStop(0.4, 'rgba(150,100,255,0.2)');
  halo.addColorStop(1, 'rgba(150,100,255,0)');
  ctx.save();
  ctx.translate(0, cy);
  ctx.scale(1, ry / rx);
  ctx.translate(0, -cy);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h * (rx / ry));
  ctx.restore();
  ctx.fillStyle = 'rgba(255,252,255,0.98)';
  ctx.beginPath();
  ctx.roundRect(cx - 0.34 * u, cy - 0.035 * u, 0.68 * u, 0.07 * u, 0.035 * u);
  ctx.fill();
  ctx.fillStyle = rgba(VIOLET_HOT, 0.6);
  ctx.beginPath();
  ctx.roundRect(cx - 0.42 * u, cy - 0.06 * u, 0.84 * u, 0.12 * u, 0.06 * u);
  ctx.fill();
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the crest

/**
 * The crest, in three cells side by side — dim (it waits), awake, and enraged: a faceted diamond of violet light with a white-hot heart inside a ring; the third adds a second ring that is broken and sparks that
 * leave it. Painted as light (it floats over the column). Each cell is 1.5 × 1.8 m, the diamond at its middle.
 */
export function wardenCrest(o: WardenOptions): Surface {
  const { w: W, h, ppm: u } = o;
  const cell = W / 3;
  const out = surface(W, h);
  const ctx = out.ctx;
  for (let state = 0; state < 3; state++) {
    const cx = state * cell + cell / 2;
    const cy = h / 2;
    const k = [0.45, 1, 1][state]!; // how bright
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.72);
    halo.addColorStop(0, rgba(VIOLET, [0.3, 0.5, 0.62][state]!));
    halo.addColorStop(0.5, rgba(VIOLET, [0.1, 0.18, 0.26][state]!));
    halo.addColorStop(1, rgba(VIOLET, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(state * cell, 0, cell, h);
    // the ring
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(VIOLET_HOT, 0.3 + 0.5 * k);
    ctx.lineWidth = Math.max(1.4, u * 0.03);
    ctx.beginPath();
    ctx.arc(cx, cy, u * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    if (state === 2) {
      ctx.lineWidth = Math.max(1.2, u * 0.022);
      for (let a = 0; a < 3; a++) {
        const a0 = (a / 3) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, u * 0.64, a0, a0 + Math.PI * 2 * 0.24);
        ctx.stroke();
      }
    }
    // the diamond: four facets, each lit differently
    const top: [number, number] = [cx, cy - 0.55 * u];
    const right: [number, number] = [cx + 0.31 * u, cy];
    const bottom: [number, number] = [cx, cy + 0.55 * u];
    const left: [number, number] = [cx - 0.31 * u, cy];
    const facet = (a: [number, number], b: [number, number], c: [number, number], col: Rgb, al: number): void => {
      ctx.fillStyle = rgba(col, al);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fill();
    };
    const middle: [number, number] = [cx, cy];
    facet(top, left, middle, [0.62, 0.45, 1], 0.5 + 0.4 * k);
    facet(top, right, middle, [0.46, 0.3, 0.9], 0.45 + 0.4 * k);
    facet(bottom, left, middle, [0.3, 0.18, 0.66], 0.4 + 0.4 * k);
    facet(bottom, right, middle, [0.24, 0.14, 0.56], 0.4 + 0.4 * k);
    ctx.strokeStyle = rgba([0.8, 0.68, 1], 0.55 + 0.4 * k);
    ctx.lineWidth = Math.max(1.3, u * 0.028);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.lineTo(right[0], right[1]);
    ctx.lineTo(bottom[0], bottom[1]);
    ctx.lineTo(left[0], left[1]);
    ctx.closePath();
    ctx.stroke();
    // the heart
    const heart = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.24);
    heart.addColorStop(0, `rgba(255,252,255,${0.4 + 0.6 * k})`);
    heart.addColorStop(1, 'rgba(255,252,255,0)');
    ctx.fillStyle = heart;
    ctx.fillRect(cx - u * 0.3, cy - u * 0.3, u * 0.6, u * 0.6);
    if (state === 2) {
      ctx.fillStyle = rgba(VIOLET_HOT, 0.95);
      const r = new Rng(7);
      for (let i = 0; i < 7; i++) {
        const a = r.range(0, Math.PI * 2);
        const d = u * r.range(0.62, 0.8);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(0.9, u * r.range(0.012, 0.03)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the shard

/** A shard that hangs at the Warden's side and rises when it winds up: a rhombus of ink with an edge of violet light and a bright seed. 0.6 × 1.0 m, painted lit. */
export function wardenShard(o: WardenOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const cy = h / 2;
  const rhombus: Draw = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.36 * u);
    ctx.lineTo(cx + 0.19 * u, cy);
    ctx.lineTo(cx, cy + 0.36 * u);
    ctx.lineTo(cx - 0.19 * u, cy);
    ctx.closePath();
    ctx.fill();
  };
  layer.add(rhombus, { x0: cx - 0.2 * u, x1: cx + 0.2 * u, y0: cy - 0.38 * u, y1: cy + 0.38 * u }, { round: 0.1 * u, tone: 0.22, spread: 0.06 });
  const seedLight: Draw = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.15 * u);
    ctx.lineTo(cx + 0.065 * u, cy);
    ctx.lineTo(cx, cy + 0.15 * u);
    ctx.lineTo(cx - 0.065 * u, cy);
    ctx.closePath();
    ctx.fill();
  };
  layer.glow(seedLight, { x0: cx - 0.3 * u, x1: cx + 0.3 * u, y0: cy - 0.4 * u, y1: cy + 0.4 * u }, VIOLET_HOT, 1.2, u * 0.1);
  const edge: Draw = (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.2, u * 0.03);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.36 * u);
    ctx.lineTo(cx + 0.19 * u, cy);
    ctx.lineTo(cx, cy + 0.36 * u);
    ctx.lineTo(cx - 0.19 * u, cy);
    ctx.closePath();
    ctx.stroke();
  };
  layer.glow(edge, { x0: cx - 0.3 * u, x1: cx + 0.3 * u, y0: cy - 0.4 * u, y1: cy + 0.4 * u }, VIOLET, 0.75, u * 0.05);
  return lightInk(layer.layers(INK, INK));
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the pool

/** The pool the Warden melts into when it falls, and lies in while it sleeps: a long flat puddle of ink, glossy, with a thread of violet along its upper edge and a few bubbles. 4.6 × 0.8 m, on the bottom edge. */
export function wardenPool(o: WardenOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const rng = new Rng(seed);
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const base = h - 1;
  const top = (t: number): number => base - Math.sin(t * Math.PI) ** 0.7 * h * 0.42 * (0.85 + 0.3 * Math.sin(t * 13 + seed));
  ctx.fillStyle = 'rgb(7,6,16)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.49, base);
  for (let i = 0; i <= 48; i++) ctx.lineTo(cx - w * 0.49 + (i / 48) * w * 0.98, top(i / 48));
  ctx.lineTo(cx + w * 0.49, base);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const bx = cx + rng.range(-0.38, 0.38) * w;
    const r = u * rng.range(0.05, 0.12);
    ctx.beginPath();
    ctx.ellipse(bx, base - h * 0.34 - r * 0.4, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const gloss = ctx.createLinearGradient(0, base - h * 0.5, 0, base);
  gloss.addColorStop(0, 'rgba(170,130,255,0.7)');
  gloss.addColorStop(0.5, 'rgba(110,80,200,0.14)');
  gloss.addColorStop(1, 'rgba(110,80,200,0)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(175,135,255,0.55)';
  ctx.lineWidth = Math.max(1, u * 0.014);
  ctx.beginPath();
  for (let i = 4; i <= 44; i++) {
    const x = cx - w * 0.49 + (i / 48) * w * 0.98;
    if (i === 4) ctx.moveTo(x, top(i / 48) - 0.5);
    else ctx.lineTo(x, top(i / 48) - 0.5);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgb(7,6,16)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    blobPath(ctx, cx + rng.range(-0.48, 0.48) * w, base - 1.5, u * rng.range(0.03, 0.07), u * rng.range(0.012, 0.026), rng, 5, 0.2);
    ctx.fill();
  }
  return s;
}
