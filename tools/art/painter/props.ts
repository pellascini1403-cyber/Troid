import { surface, readPixels, writePixels, type Surface } from './canvas';
import { clamp01, smoothstep, type Rgb } from './color';
import { fbm, noise2 } from './noise';
import { bevel, DAY, shade, type Layers, type Look } from './light';
import { alphaOf } from './ground';
import { makeField } from './field';
import { Rng } from './rng';
import { blade, blobPath, leaf, roughen, taper, wander, wrapX, type Pt } from './shapes';
import { MOSS, STONE } from './masonry';

/** Pieces that stand on their own — platforms, doors, edges of blocks. Each makes lit pixels from a mask drawn in white and a recipe for its colour. */

/** Lights the layers of a piece, the same way for all. */
export function lit(layers: Layers, wrap = false, look: Look = DAY): Surface {
  const s = surface(layers.w, layers.h);
  writePixels(s, shade(layers, look, wrap));
  return s;
}

const periodic = (w: number, h: number, cells: number): { cx: number; cy: number } => ({ cx: Math.max(1, Math.round(cells)), cy: Math.max(1, Math.round((cells * h) / w)) });

// ------------------------------------------------------------------------------------------------------------------------------ platforms

export interface PlatformOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
  /** Pixels above the surface line (where the moss stands) and the thickness of the beam, px. */
  rise: number;
  body: number;
  /** `body`: periodic along x. `end`: one end, a frayed beam (it faces left; the right one is its mirror). */
  kind: 'body' | 'end';
}

/** An ancient timber platform: planks bound with moss, roots hanging below. */
export function platform(o: PlatformOptions): Layers {
  const { w, h, ppm, seed, rise, body } = o;
  const rng = new Rng(seed);
  const mask = surface(w, h);
  const ctx = mask.ctx;
  ctx.fillStyle = '#fff';
  const periodicX = o.kind === 'body';
  const top = rise;
  const cells = Math.max(1, Math.round(w / (ppm * 1.2)));
  const lowEdge = (x: number): number => top + body + (fbm((x / w) * cells, 0.5, seed + 1, { octaves: 3, px: periodicX ? cells : 0, py: 1 }) - 0.5) * ppm * 0.09;
  const left = o.kind === 'end' ? ppm * 0.09 : 0;
  ctx.beginPath();
  ctx.moveTo(left, top);
  for (let x = left; x <= w; x += 2) ctx.lineTo(x, top + (noise2(x * 0.3, 1.7, seed + 2) - 0.5) * ppm * 0.02);
  ctx.lineTo(w, lowEdge(w));
  for (let x = w; x >= left; x -= 2) ctx.lineTo(x, lowEdge(x));
  ctx.closePath();
  ctx.fill();
  if (o.kind === 'end') {
    // the beam breaks off: a ragged end
    ctx.globalCompositeOperation = 'destination-out';
    const pts: Pt[] = roughen([{ x: left, y: top - 2 }, { x: left + ppm * 0.04, y: top + body / 2 }, { x: left, y: top + body + 2 }], rng, ppm * 0.035, ppm * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, top - 4);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.lineTo(0, top + body + 4);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // roots and rope hanging from the underside
  const hang = Math.round(w / (ppm * 0.6));
  for (let i = 0; i < hang; i++) {
    const x = o.kind === 'end' ? rng.range(left + ppm * 0.05, w) : rng.range(0, w);
    const pts = wander(rng, x, lowEdge(x) - 2, Math.PI / 2 + rng.gauss() * 0.25, ppm * rng.range(0.12, 0.28), ppm * 0.03, 0.25);
    const w0 = ppm * rng.range(0.03, 0.06);
    const draw = (dx: number): void => taper(ctx, pts.map((p) => ({ x: p.x + dx, y: p.y })), w0, w0 * 0.2);
    if (periodicX) wrapX(w, draw);
    else draw(0);
  }
  // moss on top
  const lumps = Math.round(w / (ppm * 0.45));
  for (let k = 0; k < lumps; k++) {
    const x = rng.range(left, w);
    const r = ppm * rng.range(0.04, 0.09);
    const paint = (dx: number): void => {
      blobPath(ctx, x + dx, top + r * 0.1, r * 1.6, r, rng, 5, 0.3);
      ctx.fill();
    };
    if (periodicX) wrapX(w, paint);
    else paint(0);
  }
  const alpha = alphaOf(mask);
  const height = bevel(alpha, ppm * 0.06, periodicX);
  const grainCells = periodic(w, h, w / (ppm * 0.9));
  const albedo = new Float32Array(w * h * 3);
  const hf = makeField(w, h);
  const plankW = ppm * 0.72;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const grain = fbm((x / w) * grainCells.cx * 4, (y / h) * grainCells.cy * 0.5, seed + 3, { octaves: 3, px: periodicX ? grainCells.cx * 4 : 0, py: 0 });
      const plank = Math.floor(x / plankW);
      const jx = x - plank * plankW;
      const plankTone = (((plank * 2654435761) >>> 0) % 1000) / 1000;
      let v = 0.27 + 0.1 * (plankTone - 0.5) + 0.14 * (grain - 0.5) + 0.12 * (1 - smoothstep(0, ppm * 0.05, y - top));
      let hgt = height.d[i]! * ppm * 0.035 + (grain - 0.5) * 1.6;
      if (jx < 2 && o.kind === 'body') {
        v *= 0.4; // the gap between two planks
        hgt -= 1.5;
      }
      const depth = y - top;
      const mossy = (1 - smoothstep(0, ppm * 0.07, depth)) * smoothstep(0.35, 0.65, fbm((x / w) * grainCells.cx * 2, 0.3, seed + 5, { octaves: 3, px: periodicX ? grainCells.cx * 2 : 0, py: 1 }));
      let c: Rgb = STONE(clamp01(v));
      if (mossy > 0) {
        const mc = MOSS(0.45 + 0.4 * grain);
        c = [c[0] + (mc[0] - c[0]) * mossy, c[1] + (mc[1] - c[1]) * mossy, c[2] + (mc[2] - c[2]) * mossy];
      }
      albedo[i * 3] = c[0];
      albedo[i * 3 + 1] = c[1];
      albedo[i * 3 + 2] = c[2];
      hf.d[i] = hgt;
    }
  }
  return { w, h, albedo, height: hf, alpha };
}

// ------------------------------------------------------------------------------------------------------------------------------ edges

export interface EdgeOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
  /** Pixels of the piece outside the edge it dresses (to its left, for an `edge-l`). */
  reach: number;
  style: 'stone' | 'earth';
}

/** The side of a block that faces the air: a ragged edge with chips, moss and hanging roots, periodic down its length, fading out inward into the fill. It faces left. */
export function edge(o: EdgeOptions): Layers {
  const { w, h, ppm, seed, reach } = o;
  const rng = new Rng(seed);
  const mask = surface(w, h);
  const ctx = mask.ctx;
  ctx.fillStyle = '#fff';
  const cells = Math.max(1, Math.round(h / (ppm * 0.7)));
  const x0 = (y: number): number => reach + (fbm(0.5, (y / h) * cells, seed + 1, { octaves: 3, px: 1, py: cells }) - 0.5) * ppm * 0.16;
  ctx.beginPath();
  ctx.moveTo(w, 0);
  for (let y = 0; y <= h; y += 2) ctx.lineTo(x0(y), y);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // chips: little bites out of the edge, and moss lumps and roots that hang over it
  const chips = Math.round(h / (ppm * 0.35));
  for (let k = 0; k < chips; k++) {
    const y = rng.range(0, h);
    const r = ppm * rng.range(0.03, 0.07);
    const bite = rng.chance(0.5);
    for (const dy of [-h, 0, h]) {
      ctx.globalCompositeOperation = bite ? 'destination-out' : 'source-over';
      blobPath(ctx, x0(y) + (bite ? 0 : -r * 0.3), y + dy, r, r * 1.2, rng, 5, 0.3);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  const roots = Math.round(h / (ppm * 0.9));
  for (let k = 0; k < roots; k++) {
    const y = rng.range(0, h);
    const pts = wander(rng, x0(y) + ppm * 0.02, y, Math.PI * (0.5 + rng.range(-0.1, 0.1)), ppm * rng.range(0.25, 0.7), ppm * 0.04, 0.22);
    const w0 = ppm * rng.range(0.03, 0.055);
    for (const dy of [-h, 0, h]) taper(ctx, pts.map((p) => ({ x: p.x - ppm * 0.04, y: p.y + dy })), w0, w0 * 0.2);
  }
  const alpha = alphaOf(mask);
  // fade the inner side out so the piece melts into the fill
  const fadeFrom = reach + ppm * 0.1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = 1 - smoothstep(fadeFrom, w, x);
      alpha.d[y * w + x] = alpha.d[y * w + x]! * (x > fadeFrom ? k : 1);
    }
  }
  const height = bevel(alpha, ppm * 0.07, true);
  const albedo = new Float32Array(w * h * 3);
  const hf = makeField(w, h);
  const g = periodic(w, h, h / (ppm * 0.5));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const n = fbm((x / w) * 2, (y / h) * g.cx, seed + 4, { octaves: 4, px: 2, py: g.cx });
      const m = fbm((x / w) * 2, (y / h) * g.cx * 0.5, seed + 6, { octaves: 3, px: 2, py: Math.max(1, Math.round(g.cx * 0.5)) });
      const v = (o.style === 'stone' ? 0.3 : 0.2) + 0.2 * (n - 0.5);
      let c: Rgb = STONE(clamp01(v));
      const mossy = smoothstep(0.5, 0.72, m) * (1 - smoothstep(reach, reach + ppm * 0.25, x));
      if (mossy > 0) {
        const mc = MOSS(0.4 + 0.5 * n);
        c = [c[0] + (mc[0] - c[0]) * mossy, c[1] + (mc[1] - c[1]) * mossy, c[2] + (mc[2] - c[2]) * mossy];
      }
      albedo[i * 3] = c[0];
      albedo[i * 3 + 1] = c[1];
      albedo[i * 3 + 2] = c[2];
      hf.d[i] = height.d[i]! * ppm * 0.05 + (n - 0.5) * 2;
    }
  }
  return { w, h, albedo, height: hf, alpha };
}

// ------------------------------------------------------------------------------------------------------------------------------ the door of a gate

/**
 * Original runes: abstract marks of a few strokes — rings, dots, spirals, nested diamonds, waves — never a letter of any alphabet, and none that a person could read as a word.
 */
export function rune(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rng: Rng): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, size * 0.1);
  ctx.beginPath();
  const kind = rng.int(0, 4);
  const r = size * 0.42;
  if (kind === 0) {
    // a broken ring and a dot
    ctx.arc(x, y, r, 0.6, Math.PI * 2 - 0.9);
    ctx.moveTo(x + r * 0.15, y);
    ctx.arc(x, y, 0.5, 0, Math.PI * 2);
  } else if (kind === 1) {
    // two nested diamonds, the inner open
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.moveTo(x, y - r * 0.5);
    ctx.lineTo(x + r * 0.5, y);
    ctx.lineTo(x, y + r * 0.5);
  } else if (kind === 2) {
    // a spiral
    for (let a = 0; a < Math.PI * 4; a += 0.25) {
      const rr = (a / (Math.PI * 4)) * r;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  } else if (kind === 3) {
    // three waves
    for (const dy of [-0.34, 0, 0.34]) {
      ctx.moveTo(x - r, y + dy * size);
      ctx.bezierCurveTo(x - r * 0.4, y + dy * size - size * 0.2, x + r * 0.4, y + dy * size + size * 0.2, x + r, y + dy * size);
    }
  } else {
    // a ring split by a short bar that does not touch it
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r * 0.45, y - r * 0.1);
    ctx.lineTo(x + r * 0.45, y + r * 0.35);
  }
  ctx.stroke();
  ctx.restore();
}

export interface DoorOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
  part: 'body' | 'top' | 'bottom';
  /** The colour of the light in the seal. */
  glow: Rgb;
}

/** A door of the ruins: a monolith of dark stone cut by a seam of ink-light and carved with runes. `body` repeats up the door (periodic in y). */
export function door(o: DoorOptions, stoneLayers: Layers): Layers {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const seam = surface(w, h);
  const sctx = seam.ctx;
  sctx.fillStyle = '#fff';
  sctx.strokeStyle = '#fff';
  const cx = w / 2;
  const seamW = Math.max(3, ppm * 0.07);
  if (o.part === 'body') {
    // the seam runs the whole height of the cell, a little wavering, and rungs of runes cross it
    sctx.beginPath();
    sctx.rect(cx - seamW / 2, 0, seamW, h);
    sctx.fill();
    const rungs = Math.max(1, Math.round(h / (ppm * 0.8)));
    for (let i = 0; i < rungs; i++) {
      const y = ((i + 0.5) / rungs) * h;
      rune(sctx, cx - ppm * 0.3, y, ppm * 0.22, rng);
      rune(sctx, cx + ppm * 0.3, y, ppm * 0.22, rng);
    }
  } else if (o.part === 'top') {
    // a ring with ticks: the seal of the guardian
    sctx.lineWidth = Math.max(2, ppm * 0.045);
    sctx.beginPath();
    sctx.arc(cx, h * 0.55, Math.min(w, h) * 0.3, 0, Math.PI * 2);
    sctx.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      sctx.beginPath();
      sctx.moveTo(cx + Math.cos(a) * Math.min(w, h) * 0.34, h * 0.55 + Math.sin(a) * Math.min(w, h) * 0.34);
      sctx.lineTo(cx + Math.cos(a) * Math.min(w, h) * 0.42, h * 0.55 + Math.sin(a) * Math.min(w, h) * 0.42);
      sctx.stroke();
    }
    sctx.beginPath();
    sctx.rect(cx - seamW / 2, h * 0.55, seamW, h * 0.45);
    sctx.fill();
  } else {
    sctx.beginPath();
    sctx.rect(cx - seamW / 2, 0, seamW, h * 0.4);
    sctx.fill();
  }
  const seamMask = alphaOf(seam);
  // the glow around the seam: its mask blurred
  const soft = alphaOf(blurredCopy(seam, ppm * 0.18));
  const { albedo, height, emissive } = stoneLayers;
  const em = emissive ?? new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const m = seamMask.d[i]!;
    const s = soft.d[i]!;
    // the seam is cut into the stone and full of light
    height.d[i] = height.d[i]! - 2.4 * m;
    for (let c = 0; c < 3; c++) {
      albedo[i * 3 + c] = albedo[i * 3 + c]! * (1 - 0.6 * m);
      em[i * 3 + c] = em[i * 3 + c]! + o.glow[c]! * (0.95 * m + 0.35 * s);
    }
  }
  return { w, h, albedo, height, emissive: em };
}

function blurredCopy(s: Surface, px: number): Surface {
  const out = surface(s.w, s.h);
  out.ctx.filter = `blur(${px}px)`;
  out.ctx.drawImage(s.canvas, 0, 0);
  out.ctx.filter = 'none';
  return out;
}

export { readPixels, leaf, blade };
