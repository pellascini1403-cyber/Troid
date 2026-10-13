import { readPixels, surface, writePixels, type Surface } from './canvas';
import { clamp01, smoothstep } from './color';
import { fbm } from './noise';
import { Rng } from './rng';
import { blobPath } from './shapes';

/**
 * THE LIGHT OF THE GAME (docs/PROMPT8-LOG.md phase H): the shapes every effect is made of and the short sequences of the big moments, painted as WHITE MASKS — alpha is the light, colour is added at runtime from the palette slot
 * (cyan for the hero, violet for the enemies, black for ink), so one picture serves both and the identity stays "black, white, cyan, violet" whatever is in the image. Everything here is made with the browser's own canvas
 * (additive layers, gradients, blurs), deterministic (a seed in, the same pixels out), and meant to be read at the size of a phone: bold shapes, a hot core, a clean edge, and a halo that is only a halo.
 *
 * SHAPES are one picture each and are used by particles and by flashes; SEQUENCES are a few frames played over an effect's life (the slash sweeps, the impact bursts, the column of ink rises).
 */
export interface VfxOptions {
  w: number;
  h: number;
  seed: number;
}

const TAU = Math.PI * 2;

/** Adds white light to a surface (`lighter`: where lights meet they sum, which is what light does). */
function light(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  draw();
  ctx.restore();
}

/** A soft round light: alpha `a` at the centre falling off through `stops` (radius fractions) to nothing at `r`. */
function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a = 1, stops: ReadonlyArray<readonly [number, number]> = [[0, 1], [0.12, 0.85], [0.3, 0.45], [0.55, 0.14], [0.8, 0.03], [1, 0]]): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255,255,255,${(alpha * a).toFixed(4)})`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A copy of a surface, blurred (the halo of a bright thing: drawn under the sharp one). */
function blurred(s: Surface, px: number): Surface {
  const out = surface(s.w, s.h);
  out.ctx.filter = `blur(${px}px)`;
  out.ctx.drawImage(s.canvas, 0, 0);
  out.ctx.filter = 'none';
  return out;
}

/** Lays `halo` blurred `px` under what is on `s`, `amount` strong: the sharp edge stays sharp and a soft light surrounds it. */
function withHalo(s: Surface, px: number, amount: number, again?: { px: number; amount: number }): Surface {
  const out = surface(s.w, s.h);
  light(out.ctx, () => {
    out.ctx.globalAlpha = amount;
    out.ctx.drawImage(blurred(s, px).canvas, 0, 0);
    if (again) {
      out.ctx.globalAlpha = again.amount;
      out.ctx.drawImage(blurred(s, again.px).canvas, 0, 0);
    }
    out.ctx.globalAlpha = 1;
    out.ctx.drawImage(s.canvas, 0, 0);
  });
  return out;
}

/** A ray: a long thin kite from `(x, y)` along `angle`, bright at the root and gone at the tip. */
function ray(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, from: number, to: number, halfWidth: number, a = 1): void {
  if (to <= from) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(from, 0, to, 0);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.45, `rgba(255,255,255,${a * 0.55})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(from, -halfWidth);
  ctx.lineTo(to, 0);
  ctx.lineTo(from, halfWidth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the shapes

/** A soft round light: glows, motes, flashes. 96 × 96. */
export function shapeGlow(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  light(s.ctx, () => {
    glowAt(s.ctx, o.w / 2, o.h / 2, Math.min(o.w, o.h) / 2, 1, [[0, 1], [0.06, 0.92], [0.16, 0.7], [0.3, 0.42], [0.46, 0.2], [0.64, 0.075], [0.82, 0.018], [1, 0]]);
  });
  return s;
}

/** A four-point flare: a hot core, two long thin rays and two short faint ones, a halo. 64 × 64. */
export function shapeSpark(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const cx = o.w / 2;
  const cy = o.h / 2;
  const r = Math.min(o.w, o.h) / 2;
  light(s.ctx, () => {
    glowAt(s.ctx, cx, cy, r * 0.55, 0.32, [[0, 1], [0.4, 0.35], [1, 0]]);
    for (let k = 0; k < 4; k++) ray(s.ctx, cx, cy, (k * Math.PI) / 2, r * 0.04, r * 0.98, r * 0.075, 0.95);
    for (let k = 0; k < 4; k++) ray(s.ctx, cx, cy, (k * Math.PI) / 2 + Math.PI / 4, r * 0.04, r * 0.5, r * 0.04, 0.42);
    glowAt(s.ctx, cx, cy, r * 0.26, 1, [[0, 1], [0.35, 0.9], [1, 0]]);
  });
  return s;
}

/** A sliver of crystal drawn along +x (the game turns it along its velocity): the tail is nothing, the tip is a point, a bright edge runs down the middle. 96 × 32. */
export function shapeShard(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const { w, h } = o;
  light(s.ctx, () => {
    const g = s.ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    s.ctx.fillStyle = g;
    s.ctx.beginPath();
    s.ctx.moveTo(0, h * 0.5);
    s.ctx.lineTo(w * 0.5, h * 0.2);
    s.ctx.lineTo(w * 0.7, h * 0.16);
    s.ctx.lineTo(w, h * 0.5);
    s.ctx.lineTo(w * 0.7, h * 0.84);
    s.ctx.lineTo(w * 0.5, h * 0.8);
    s.ctx.closePath();
    s.ctx.fill();
    // the bright arris down the middle
    const e = s.ctx.createLinearGradient(w * 0.15, 0, w, 0);
    e.addColorStop(0, 'rgba(255,255,255,0)');
    e.addColorStop(1, 'rgba(255,255,255,1)');
    s.ctx.strokeStyle = e;
    s.ctx.lineWidth = Math.max(1, h * 0.07);
    s.ctx.beginPath();
    s.ctx.moveTo(w * 0.15, h * 0.5);
    s.ctx.lineTo(w * 0.97, h * 0.5);
    s.ctx.stroke();
  });
  return s;
}

/** A ring of energy: a thin bright band with a soft edge, brighter in some arcs, with a few ticks outside it. 128 × 128. */
export function shapeRing(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const cx = o.w / 2;
  const cy = o.h / 2;
  const R = o.w * 0.4;
  const rng = new Rng(o.seed);
  light(s.ctx, () => {
    const g = s.ctx.createRadialGradient(cx, cy, R - o.w * 0.1, cx, cy, R + o.w * 0.1);
    for (const [at, a] of [[0, 0], [0.3, 0.1], [0.46, 0.5], [0.5, 0.82], [0.54, 0.4], [0.72, 0.07], [1, 0]] as const) g.addColorStop(at, `rgba(255,255,255,${a})`);
    s.ctx.fillStyle = g;
    s.ctx.fillRect(0, 0, o.w, o.h);
    // brighter arcs: where the band is hot
    s.ctx.lineCap = 'round';
    s.ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    s.ctx.lineWidth = Math.max(1.4, o.w * 0.016);
    for (let k = 0; k < 4; k++) {
      const a0 = rng.range(0, TAU);
      s.ctx.beginPath();
      s.ctx.arc(cx, cy, R, a0, a0 + rng.range(0.4, 0.9));
      s.ctx.stroke();
    }
    // ticks outside the band
    s.ctx.lineWidth = Math.max(1, o.w * 0.01);
    s.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 9; k++) {
      const a = rng.range(0, TAU);
      const r0 = R + o.w * 0.045;
      s.ctx.beginPath();
      s.ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      s.ctx.lineTo(cx + Math.cos(a) * (r0 + o.w * rng.range(0.02, 0.05)), cy + Math.sin(a) * (r0 + o.w * rng.range(0.02, 0.05)));
      s.ctx.stroke();
    }
  });
  return s;
}

/** A rune: a ring with a second ring inside it and glyph marks between them, for the floor of a place that awakens. 128 × 128. */
export function shapeRune(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const cx = o.w / 2;
  const cy = o.h / 2;
  const R = o.w * 0.42;
  const rng = new Rng(o.seed);
  light(s.ctx, () => {
    s.ctx.lineCap = 'round';
    s.ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    s.ctx.lineWidth = Math.max(1.4, o.w * 0.014);
    s.ctx.beginPath();
    s.ctx.arc(cx, cy, R, 0, TAU);
    s.ctx.stroke();
    s.ctx.lineWidth = Math.max(1, o.w * 0.009);
    s.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    s.ctx.beginPath();
    s.ctx.arc(cx, cy, R * 0.8, 0, TAU);
    s.ctx.stroke();
    // twelve marks between the rings: bars, dots and broken arcs, none of them a letter
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const r0 = R * 0.84;
      const r1 = R * 0.97;
      s.ctx.strokeStyle = `rgba(255,255,255,${k % 3 === 0 ? 0.95 : 0.6})`;
      s.ctx.lineWidth = Math.max(1, o.w * (k % 3 === 0 ? 0.014 : 0.008));
      if (k % 4 === 1) {
        s.ctx.beginPath();
        s.ctx.arc(cx, cy, (r0 + r1) / 2, a - 0.1, a + 0.1);
        s.ctx.stroke();
      } else if (k % 4 === 3) {
        s.ctx.beginPath();
        s.ctx.arc(cx + Math.cos(a) * (r0 + r1) / 2, cy + Math.sin(a) * (r0 + r1) / 2, Math.max(1, o.w * 0.011), 0, TAU);
        s.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        s.ctx.fill();
      } else {
        s.ctx.beginPath();
        s.ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        s.ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        s.ctx.stroke();
      }
    }
    // a diamond at the heart
    s.ctx.fillStyle = 'rgba(255,255,255,0.8)';
    s.ctx.beginPath();
    s.ctx.moveTo(cx, cy - R * 0.2);
    s.ctx.lineTo(cx + R * 0.11, cy);
    s.ctx.lineTo(cx, cy + R * 0.2);
    s.ctx.lineTo(cx - R * 0.11, cy);
    s.ctx.closePath();
    s.ctx.fill();
    glowAt(s.ctx, cx, cy, R * 0.45, 0.35, [[0, 1], [1, 0]]);
    void rng;
  });
  return withHalo(s, 3, 0.55);
}

/** Smoke: a soft cloud with an uneven edge, thin where it ends. 96 × 96. */
export function shapeDust(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const img = readPixels(s);
  const r = Math.min(o.w, o.h) / 2;
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      const dx = (x - o.w / 2) / r;
      const dy = (y - o.h / 2) / r;
      const d = Math.hypot(dx, dy);
      const n = fbm(x * 0.07, y * 0.07, o.seed, { octaves: 4 });
      const window = smoothstep(1, 0.25, d);
      const a = clamp01((n - 0.22) * 1.9) * window * 0.85;
      const i = (y * o.w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  writePixels(s, img);
  return s;
}

/** A splash of ink: a firm blob with a few drops thrown off it. 64 × 64. */
export function shapeInk(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const rng = new Rng(o.seed);
  const ctx = s.ctx;
  ctx.fillStyle = '#fff';
  blobPath(ctx, o.w / 2, o.h / 2, o.w * 0.3, o.h * 0.3, rng, 8, 0.18);
  ctx.fill();
  for (let k = 0; k < 4; k++) {
    const a = rng.range(0, TAU);
    const d = o.w * rng.range(0.34, 0.42);
    ctx.beginPath();
    ctx.arc(o.w / 2 + Math.cos(a) * d, o.h / 2 + Math.sin(a) * d, o.w * rng.range(0.03, 0.06), 0, TAU);
    ctx.fill();
  }
  // a thin edge of light on the side that faces the light: not tinted away because the mask is only alpha, so it is just a slightly softer rim
  const img = readPixels(s);
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      const i = (y * o.w + x) * 4;
      const a = img.data[i + 3]! / 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  writePixels(s, img);
  return s;
}

/** A streak of speed along +x: pointed at both ends, hottest near its right end, with two fainter lines at its sides. 192 × 48. */
export function shapeStreak(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const { w, h } = o;
  light(s.ctx, () => {
    const g = s.ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.8, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    s.ctx.fillStyle = g;
    s.ctx.beginPath();
    s.ctx.moveTo(0, h / 2);
    s.ctx.quadraticCurveTo(w * 0.55, h * 0.18, w, h / 2);
    s.ctx.quadraticCurveTo(w * 0.55, h * 0.82, 0, h / 2);
    s.ctx.fill();
    // the hot line down the middle
    const c = s.ctx.createLinearGradient(w * 0.1, 0, w, 0);
    c.addColorStop(0, 'rgba(255,255,255,0)');
    c.addColorStop(0.75, 'rgba(255,255,255,1)');
    c.addColorStop(1, 'rgba(255,255,255,0)');
    s.ctx.strokeStyle = c;
    s.ctx.lineWidth = Math.max(1.2, h * 0.055);
    s.ctx.beginPath();
    s.ctx.moveTo(w * 0.1, h / 2);
    s.ctx.lineTo(w, h / 2);
    s.ctx.stroke();
    s.ctx.lineWidth = Math.max(1, h * 0.03);
    s.ctx.globalAlpha = 0.5;
    for (const dy of [-0.2, 0.2]) {
      s.ctx.beginPath();
      s.ctx.moveTo(w * 0.35, h * (0.5 + dy));
      s.ctx.lineTo(w * 0.92, h * (0.5 + dy * 0.6));
      s.ctx.stroke();
    }
    s.ctx.globalAlpha = 1;
    glowAt(s.ctx, w * 0.84, h / 2, h * 0.5, 0.55, [[0, 1], [1, 0]]);
  });
  return s;
}

/** A chevron pointing along +x with a soft edge: the marks that flow along the floor to say which way a blow will travel. 64 × 48. */
export function shapeChevron(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const { w, h } = o;
  const body = surface(w, h);
  body.ctx.fillStyle = '#fff';
  body.ctx.beginPath();
  body.ctx.moveTo(w * 0.1, h * 0.08);
  body.ctx.lineTo(w * 0.42, h * 0.08);
  body.ctx.lineTo(w * 0.9, h * 0.5);
  body.ctx.lineTo(w * 0.42, h * 0.92);
  body.ctx.lineTo(w * 0.1, h * 0.92);
  body.ctx.lineTo(w * 0.48, h * 0.5);
  body.ctx.closePath();
  body.ctx.fill();
  // brighter toward the point
  body.ctx.globalCompositeOperation = 'destination-in';
  const g = body.ctx.createLinearGradient(w * 0.1, 0, w * 0.9, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  body.ctx.fillStyle = g;
  body.ctx.fillRect(0, 0, w, h);
  light(s.ctx, () => s.ctx.drawImage(withHalo(body, 3, 0.5).canvas, 0, 0));
  return s;
}

/**
 * The sword's crescent, bowing to +x: the outer edge is hot and clean, the inner edge falls away into the dark, the tips are points, and a few lines of speed run on from them. (The same crescent the game
 * has always fitted to the blow: an ellipse with another carved out of its left side — painted.) 256 × 192.
 */
export function shapeArc(o: VfxOptions): Surface {
  const s = surface(o.w, o.h);
  const { w, h } = o;
  const body = surface(w, h);
  // the crescent: outer ellipse minus an inner one
  body.ctx.fillStyle = '#fff';
  body.ctx.beginPath();
  body.ctx.ellipse(w * 0.406, h / 2, w * 0.578, h * 0.479, 0, 0, TAU);
  body.ctx.fill();
  body.ctx.globalCompositeOperation = 'destination-out';
  body.ctx.beginPath();
  body.ctx.ellipse(w * 0.242, h / 2, w * 0.586, h * 0.49, 0, 0, TAU);
  body.ctx.fill();
  // brightness: from the tail (left, dim) to the bow (right, hot)...
  body.ctx.globalCompositeOperation = 'destination-in';
  const g = body.ctx.createLinearGradient(w * 0.25, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.3)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  body.ctx.fillStyle = g;
  body.ctx.fillRect(0, 0, w, h);
  // ...and across the thickness: hot on the outer edge, falling away toward the inner one (an elliptical gradient round the centre of the carved-out ellipse)
  body.ctx.save();
  body.ctx.translate(w * 0.242, h / 2);
  body.ctx.scale(1, 0.49 / 0.586);
  const across = body.ctx.createRadialGradient(0, 0, w * 0.586 * 0.98, 0, 0, w * 0.586 + w * 0.2);
  across.addColorStop(0, 'rgba(255,255,255,0.12)');
  across.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  across.addColorStop(1, 'rgba(255,255,255,1)');
  body.ctx.fillStyle = across;
  body.ctx.fillRect(-w, -w, w * 2, w * 2);
  body.ctx.restore();
  light(s.ctx, () => {
    s.ctx.drawImage(withHalo(body, 5, 0.5).canvas, 0, 0);
    // the hot outer edge
    s.ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    s.ctx.lineWidth = Math.max(1.5, h * 0.016);
    s.ctx.beginPath();
    s.ctx.ellipse(w * 0.406, h / 2, w * 0.578 - 1.5, h * 0.479 - 1.5, 0, -1.25, 1.25);
    s.ctx.stroke();
  });
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the sequences

/** Frames side by side: `n` cells of `w × h`, each painted by `draw(ctx, i, t)` with `t` going from 0 to 1 over the sequence. */
function sequence(o: VfxOptions, n: number, draw: (ctx: CanvasRenderingContext2D, i: number, t: number) => void): Surface {
  const out = surface(o.w * n, o.h);
  for (let i = 0; i < n; i++) {
    const cell = surface(o.w, o.h);
    // (the last frame is at 94 % of the way, not at the end: a sequence whose last picture is empty is a mistake the check rightly reports, and the effect is gone by then anyway)
    draw(cell.ctx, i, n > 1 ? (i / (n - 1)) * 0.94 : 0);
    out.ctx.drawImage(cell.canvas, i * o.w, 0);
  }
  return out;
}

/**
 * Leaves a margin of transparency round every picture, so that nothing of what is drawn can be cut off by the edge of its frame (and `assets:check` has nothing to say about it): the piece is made `margin` pixels smaller on
 * every side and set in its frame. A picture that stands on its floor (`floor: true`) keeps its foot on the bottom edge.
 */
export function padded(o: VfxOptions, margin: number, make: (inner: VfxOptions) => Surface, opts: { floor?: boolean } = {}): Surface {
  const inner: VfxOptions = { ...o, w: o.w - margin * 2, h: o.h - margin * (opts.floor ? 1 : 2) };
  const made = make(inner);
  const frames = Math.max(1, Math.round(made.w / inner.w));
  const out = surface(o.w * frames, o.h);
  for (let i = 0; i < frames; i++) out.ctx.drawImage(made.canvas, i * inner.w, 0, inner.w, inner.h, i * o.w + margin, margin, inner.w, inner.h);
  return out;
}

/** The part of a sequence's picture a function paints into a cell of its own, then given a halo: so that every frame is lit the same way. */
function lit(o: VfxOptions, paint: (ctx: CanvasRenderingContext2D) => void, halo: { px: number; amount: number } | null): Surface {
  const s = surface(o.w, o.h);
  paint(s.ctx);
  return halo ? withHalo(s, halo.px, halo.amount) : s;
}

/** Where the head and the tail of the slash are, in degrees round the blade's arc (down is positive), and how bright, at each of the six frames: the head runs the arc, the tail lags and then catches up as the light dies. */
const SWEEP = {
  head: [-42, -2, 40, 76, 76, 76],
  tail: [-76, -76, -74, -64, -34, 22],
  alpha: [0.9, 1, 1, 1, 0.72, 0.34],
} as const;

/**
 * The sword's slash as it SWEEPS (six frames): a crescent that grows from a thin bright head along the arc, a tail that follows and fades, a hot edge, and a few lines of speed that run on behind. The head travels from the top
 * to the bottom of the arc; the game turns and flips it for the finisher (which rises), the air blow and the crouch thrust. The two layers are painted apart so the game can tint the body cyan and the edge white-hot.
 * 192 × 160 a frame, the arc an ellipse centred on (33 %, 50 %) of the picture and bowing to +x (it is drawn in a space where that ellipse is a circle, so the gradients that run along it are true).
 */
export function seqSlash(o: VfxOptions, layer: 'body' | 'edge'): Surface {
  const frames = 6;
  const Rx = o.w * 0.54;
  const Ry = o.h * 0.38;
  const squash = Ry / Rx;
  const cx = o.w * 0.33;
  const cy = o.h * 0.5;
  const rad = (d: number): number => (d * Math.PI) / 180;
  return sequence(o, frames, (ctx, i) => {
    const head = rad(SWEEP.head[i]!);
    const tail = rad(SWEEP.tail[i]!);
    const A = SWEEP.alpha[i]!;
    const span = head - tail;
    const R = Rx;
    // the blade is thicker at its head and thins to a point at its tail
    const thick = (u: number): number => Rx * 0.27 * Math.pow(u, 0.7) * (1 - Math.pow(u, 12) * 0.8);
    const pointAt = (u: number, k: number): [number, number] => {
      const a = tail + span * u;
      const r = R + thick(u) * k;
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    /** Draws in the space where the ellipse is a circle, centred on its centre. */
    const inCircle = (target: CanvasRenderingContext2D, draw: (c: CanvasRenderingContext2D) => void): void => {
      target.save();
      target.translate(cx, cy);
      target.scale(1, squash);
      draw(target);
      target.restore();
    };
    const mask = (): Surface => {
      const s = surface(o.w, o.h);
      inCircle(s.ctx, (c) => {
        c.fillStyle = '#fff';
        c.beginPath();
        for (let k = 0; k <= 56; k++) {
          const [x, y] = pointAt(k / 56, 0.55);
          if (k === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        for (let k = 56; k >= 0; k--) {
          const [x, y] = pointAt(k / 56, -0.45);
          c.lineTo(x, y);
        }
        c.closePath();
        c.fill();
      });
      return s;
    };
    /** The brightness along the blade: nothing at the tail, full at the head — a conic gradient, so it follows the arc. */
    const along = (c: CanvasRenderingContext2D, from: number, mid: number): CanvasGradient => {
      const g = c.createConicGradient(tail, 0, 0);
      const f = Math.max(0.0001, span / TAU);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(Math.min(0.9999, f * 0.55), `rgba(255,255,255,${mid})`);
      g.addColorStop(Math.min(0.9999, f), `rgba(255,255,255,${from})`);
      g.addColorStop(Math.min(1, f + 0.0001), 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      return g;
    };
    if (layer === 'body') {
      const m = mask();
      // the brightness along the blade, then across it: hot outside, falling away inside
      m.ctx.globalCompositeOperation = 'destination-in';
      inCircle(m.ctx, (c) => {
        c.fillStyle = along(c, 1, 0.45);
        c.fillRect(-o.w * 2, -o.w * 2, o.w * 4, o.w * 4);
      });
      inCircle(m.ctx, (c) => {
        const across = c.createRadialGradient(0, 0, R - Rx * 0.12, 0, 0, R + Rx * 0.16);
        across.addColorStop(0, 'rgba(255,255,255,0.12)');
        across.addColorStop(0.55, 'rgba(255,255,255,0.72)');
        across.addColorStop(1, 'rgba(255,255,255,1)');
        c.fillStyle = across;
        c.fillRect(-o.w * 2, -o.w * 2, o.w * 4, o.w * 4);
      });
      const halo = withHalo(m, 5, 0.6);
      light(ctx, () => {
        ctx.globalAlpha = A;
        ctx.drawImage(halo.canvas, 0, 0);
      });
      return;
    }
    // the edge: a thin hot line along the outside of the blade, a flare at its head, and lines of speed behind it
    const e = surface(o.w, o.h);
    const rng = new Rng(o.seed + i);
    inCircle(e.ctx, (c) => {
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = along(c, 1, 0.6);
      c.lineWidth = Math.max(1.6, Rx * 0.022);
      c.beginPath();
      for (let k = 0; k <= 56; k++) {
        const [x, y] = pointAt(k / 56, 0.52);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      // speed lines: arcs just outside and inside the blade, starting behind the head and fading toward the tail
      for (const k of [1.17, 1.26, 0.9, 1.33]) {
        const a1 = head - 0.1 - rng.range(0, 0.18);
        const a0 = Math.max(tail, a1 - rng.range(0.5, 1.0));
        if (a1 <= a0) continue;
        const g = c.createConicGradient(a0, 0, 0);
        const f = Math.max(0.0001, (a1 - a0) / TAU);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(Math.min(0.9999, f), 'rgba(255,255,255,0.7)');
        g.addColorStop(Math.min(1, f + 0.0001), 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.strokeStyle = g;
        c.lineWidth = Math.max(1, Rx * 0.01);
        c.beginPath();
        c.arc(0, 0, R * k, a0, a1);
        c.stroke();
      }
    });
    // the flare where the blade is brightest (its head): small, so it is a point of light on the edge and not a comet
    light(e.ctx, () => {
      const [hx, hy] = pointAt(1, 0.4);
      const x = cx + hx;
      const y = cy + hy * squash;
      glowAt(e.ctx, x, y, o.h * 0.07, 0.55, [[0, 1], [0.35, 0.45], [1, 0]]);
      for (let k = 0; k < 2; k++) ray(e.ctx, x, y, head * squash + k * (Math.PI / 2) + 0.3, 1, o.h * 0.1, 1.1, 0.75);
    });
    light(ctx, () => {
      ctx.globalAlpha = A;
      ctx.drawImage(withHalo(e, 2, 0.45).canvas, 0, 0);
    });
  });
}

/**
 * A blow that lands (six frames): a flash that is gone in two, and a burst of BOLD blades that shoot out along the blow — long ahead, short behind, none of them alike, each a tapered shard that is brightest at its root —
 * which thin and shorten as the light dies, with a few sparks flying clear along them. It points along +x and sits a little behind the middle of its frame (the blades go forward); the game turns it the way the blow went.
 * Made to be read at the size of a phone: nothing in it is thinner than a few pixels while it is bright. 128 × 128 a frame.
 */
export function seqImpact(o: VfxOptions): Surface {
  const c = { x: o.w * 0.42, y: o.h / 2 };
  const half = o.w / 2;
  // the blades: where they point (0 = along the blow), how long (of half a frame) and how wide at the root (pixels, of 128)
  const blades = [
    { a: 0, len: 1.0, w: 8 },
    { a: 0.46, len: 0.8, w: 6.5 },
    { a: -0.5, len: 0.84, w: 6.5 },
    { a: 0.98, len: 0.58, w: 5.5 },
    { a: -1.04, len: 0.54, w: 5.5 },
    { a: 1.75, len: 0.42, w: 4.8 },
    { a: -1.8, len: 0.4, w: 4.8 },
    { a: 2.7, len: 0.32, w: 4 },
    { a: -2.65, len: 0.3, w: 4 },
  ];
  const sparks = (() => {
    const rng = new Rng(o.seed + 5);
    return Array.from({ length: 8 }, (_, k) => ({ a: blades[k % 5]!.a + rng.range(-0.18, 0.18), d: rng.range(0.85, 1.3), r: 2.4 + rng.range(0, 1.8) }));
  })();
  const sc = o.w / 128;
  /** A blade: a tapered shard, widest a quarter of the way out, brightest at its root, a point at its tip. */
  const blade = (g: CanvasRenderingContext2D, angle: number, from: number, to: number, w: number, a: number): void => {
    if (to - from < 2 || a <= 0.01) return;
    g.save();
    g.translate(c.x, c.y);
    g.rotate(angle);
    const grad = g.createLinearGradient(from, 0, to, 0);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${a * 0.7})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(from, 0);
    g.lineTo(from + (to - from) * 0.22, -w);
    g.lineTo(to, 0);
    g.lineTo(from + (to - from) * 0.22, w);
    g.closePath();
    g.fill();
    g.restore();
  };
  return sequence(o, 6, (ctx, i, t) => {
    // the blades reach their length in the first third and then only thin; the light falls from the second frame on
    const reach = smoothstep(0, 0.22, t);
    const keep = 1 - 0.22 * smoothstep(0.3, 1, t);
    const thin = 1 - 0.72 * smoothstep(0.16, 1, t);
    const fade = t < 0.2 ? 1 : Math.pow(1 - (t - 0.2) / 0.8, 1.15);
    const s = lit(
      o,
      (g) => {
        light(g, () => {
          // the flash at the root of the blow: wide at the start, a hot point at the end
          glowAt(g, c.x, c.y, half * (0.5 - 0.22 * t), 0.95 * Math.pow(1 - t, 1.3), [[0, 1], [0.2, 0.7], [0.55, 0.2], [1, 0]]);
          if (t < 0.6) {
            g.fillStyle = `rgba(255,255,255,${1 - t / 0.6})`;
            g.beginPath();
            g.arc(c.x, c.y, half * 0.16 * (1 - 0.6 * t), 0, TAU);
            g.fill();
          }
          const r0 = half * 0.05;
          for (const k of blades) blade(g, k.a, r0, r0 + half * 0.95 * k.len * (0.28 + 0.72 * reach) * keep, k.w * sc * thin, fade);
          for (const sp of sparks) {
            const d = half * (0.4 + 0.55 * reach) * sp.d;
            glowAt(g, c.x + Math.cos(sp.a) * d, c.y + Math.sin(sp.a) * d, sp.r * sc * (1 - 0.35 * t), fade * 0.95, [[0, 1], [0.5, 0.5], [1, 0]]);
          }
        });
      },
      { px: 3 * sc, amount: 0.38 },
    );
    ctx.drawImage(s.canvas, 0, 0);
    void i;
  });
}

/** Where the layers of a sequence that are meant for a halo are drawn at: half the size, since they are only light. (A helper for the sequences that come in two layers: a sharp one and a soft one.) */

/**
 * The Spirit Bolt in flight (four frames that loop): a teardrop of energy pointing +x with flames that stream back from it, each frame a little different so that it burns. Two layers: the `body` (the flames and the
 * orb, tinted cyan) and the `core` (a smaller, hotter heart and two thin wisps, tinted white). 128 × 64 a frame, the head at (68 %, 50 %).
 */
export function seqBoltHead(o: VfxOptions, layer: 'body' | 'core'): Surface {
  const hx = o.w * 0.66;
  const hy = o.h * 0.5;
  return sequence(o, 4, (ctx, i) => {
    const rng = new Rng(o.seed + 31);
    const ph = (i / 4) * TAU;
    const s = surface(o.w, o.h);
    const g = s.ctx;
    const scale = layer === 'body' ? 1 : 0.55;
    light(g, () => {
      // the flames: tapered tails streaming back out of the orb — nothing at the root, widest a little behind it, a point at the end — each with its own wave that moves from frame to frame
      const count = layer === 'body' ? 5 : 2;
      for (let k = 0; k < count; k++) {
        const off = (k - (count - 1) / 2) * o.h * (layer === 'body' ? 0.1 : 0.06) * scale;
        const len = o.w * (0.46 + rng.range(0, 0.16)) * (layer === 'body' ? 1 : 0.7);
        const amp = o.h * (0.06 + rng.range(0, 0.05));
        const wmax = o.h * (layer === 'body' ? 0.17 : 0.1) * (1 - 0.55 * Math.abs(off) / (o.h * 0.4));
        const N = 20;
        const pts: Array<[number, number, number]> = [];
        for (let j = 0; j <= N; j++) {
          const u = j / N;
          const half = (wmax / 2) * Math.pow(Math.sin(Math.min(1, u * 1.15) * Math.PI), 0.7) * (1 - u * 0.5);
          pts.push([hx - o.w * 0.02 - len * u, hy + off * (0.6 + u * 0.9) + Math.sin(ph + u * 5 + k * 1.7) * amp * u, half]);
        }
        const gr = g.createLinearGradient(hx, 0, hx - len, 0);
        gr.addColorStop(0, `rgba(255,255,255,${layer === 'body' ? 0.9 : 1})`);
        gr.addColorStop(0.5, `rgba(255,255,255,${layer === 'body' ? 0.32 : 0.5})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        pts.forEach(([x, y, h], j) => (j === 0 ? g.moveTo(x, y - h) : g.lineTo(x, y - h)));
        for (let j = N; j >= 0; j--) g.lineTo(pts[j]![0], pts[j]![1] + pts[j]![2]);
        g.closePath();
        g.fill();
      }
      // the orb: a teardrop with a point toward +x, big enough to hold the eye
      const R = o.h * (layer === 'body' ? 0.3 : 0.2);
      g.fillStyle = 'rgba(255,255,255,1)';
      g.beginPath();
      g.moveTo(hx + R * 1.5, hy);
      g.bezierCurveTo(hx + R * 0.7, hy - R * 1.02, hx - R * 0.9, hy - R * 1.02, hx - R * 0.9, hy);
      g.bezierCurveTo(hx - R * 0.9, hy + R * 1.02, hx + R * 0.7, hy + R * 1.02, hx + R * 1.5, hy);
      g.fill();
      glowAt(g, hx, hy, o.h * (layer === 'body' ? 0.46 : 0.3), layer === 'body' ? 0.75 : 1, [[0, 1], [0.35, 0.5], [1, 0]]);
    });
    ctx.drawImage(withHalo(s, layer === 'body' ? 4 : 2, layer === 'body' ? 0.55 : 0.4).canvas, 0, 0);
  });
}

/**
 * The Spirit Bolt where it lands (seven frames): a flare that blinds for two frames, twelve bold rays all round, a ring and a second, thinner ring a beat behind it, sparks, and the afterglow — a soft light that is
 * still there when the rest has gone. 160 × 160 a frame, centred.
 */
export function seqBoltImpact(o: VfxOptions): Surface {
  const c = { x: o.w / 2, y: o.h / 2 };
  const half = o.w / 2;
  const rays = (() => {
    const rng = new Rng(o.seed + 3);
    return Array.from({ length: 10 }, (_, k) => ({ a: (k / 10) * TAU + rng.range(-0.2, 0.2), len: rng.range(0.5, 1), w: k % 2 === 0 ? 7.5 : 4 + rng.range(0, 1.5) }));
  })();
  const arcs = (() => {
    const rng = new Rng(o.seed + 11);
    return Array.from({ length: 5 }, () => ({ a: rng.range(0, TAU), span: rng.range(0.7, 1.5) }));
  })();
  const sparks = (() => {
    const rng = new Rng(o.seed + 9);
    return Array.from({ length: 16 }, () => ({ a: rng.range(0, TAU), d: rng.range(0.7, 1.2), r: 1.8 + rng.range(0, 2.2) }));
  })();
  return sequence(o, 7, (ctx, i, t) => {
    const ease = 1 - Math.pow(1 - t, 2.4);
    const fade = Math.pow(1 - t, 1.15);
    const s = lit(
      o,
      (g) => {
        light(g, () => {
          // the flare
          const flare = Math.pow(1 - Math.min(1, t * 2.0), 1.3);
          glowAt(g, c.x, c.y, half * (0.66 - 0.3 * t), 0.95 * Math.pow(1 - t, 1.3), [[0, 1], [0.2, 0.7], [0.5, 0.2], [1, 0]]);
          if (flare > 0.02) {
            for (let k = 0; k < 4; k++) ray(g, c.x, c.y, k * (Math.PI / 2) + 0.3, 1, half * 0.98 * (0.4 + 0.6 * flare), 4.2 * flare + 0.8, flare);
            g.fillStyle = `rgba(255,255,255,${flare})`;
            g.beginPath();
            g.arc(c.x, c.y, half * 0.13 * (0.5 + flare), 0, TAU);
            g.fill();
          }
          // the rays: bold, uneven, thinning to nothing
          const r0 = half * (0.06 + 0.26 * ease);
          for (const r of rays) ray(g, c.x, c.y, r.a, r0, r0 + half * r.len * (0.3 + 0.7 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5)), r.w * (1 - 0.65 * t), fade);
          // the ring: a few arcs of it, not a closed circle
          g.lineCap = 'round';
          g.strokeStyle = `rgba(255,255,255,${0.85 * Math.pow(1 - t, 1.2)})`;
          g.lineWidth = Math.max(0.8, half * 0.06 * (1 - 0.75 * t));
          for (const a of arcs) {
            g.beginPath();
            g.arc(c.x, c.y, half * (0.22 + 0.72 * ease), a.a, a.a + a.span);
            g.stroke();
          }
          // sparks
          for (const sp of sparks) {
            const d = half * (0.3 + 0.68 * ease) * sp.d;
            glowAt(g, c.x + Math.cos(sp.a) * d, c.y + Math.sin(sp.a) * d, sp.r, fade * 0.95, [[0, 1], [1, 0]]);
          }
          // the afterglow: still there when the rest has gone
          glowAt(g, c.x, c.y, half * 0.55, 0.3 * Math.pow(t, 0.6) * (1 - Math.pow(t, 3)) + 0.04, [[0, 1], [0.5, 0.35], [1, 0]]);
        });
      },
      { px: 4, amount: 0.4 },
    );
    ctx.drawImage(s.canvas, 0, 0);
    void i;
  });
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- ink and light that rises

/** The silhouette of a mask drawn into a surface, and its rim of light: the edge that faces up and to the left, where the light of the game lies. */
function rim(mask: Surface, dx = 2, dy = 2, px = 1): Surface {
  const out = surface(mask.w, mask.h);
  out.ctx.drawImage(mask.canvas, 0, 0);
  out.ctx.globalCompositeOperation = 'destination-out';
  out.ctx.drawImage(mask.canvas, dx, dy);
  return px > 0 ? blurred(out, px) : out;
}

/**
 * The ink that bursts out of a creature that falls (six frames): it is THROWN — a crown of thick tendrils that rise and curve out, each tapering to a thread that ends in a drop; the drops let go and fly, and the
 * tendrils sag and fall back toward the floor as a puddle spreads. Nothing is straight and nothing is round: every tendril bows to its own side, none is as long as its neighbour. Two layers painted from the SAME
 * shapes: the `body` (a silhouette, for the dark colour of the ink) and the `gloss` (the rim of light on the edges that face up and to the left, at half the size, for the violet). Everything is drawn in fractions
 * of the frame, so the two layers agree whatever their sizes. 160 × 128 a frame, the burst centred on (50 %, 62 %): the ink comes up from where the creature stood.
 */
export function seqInkSplash(o: VfxOptions, layer: 'body' | 'gloss'): Surface {
  const rng = new Rng(o.seed);
  const cx = o.w / 2;
  const cy = o.h * 0.62;
  const unit = o.h * 0.5;
  // a crown of seven that fans up and out, two that skim the floor, and drops that are thrown clear
  const crown = [-2.78, -2.32, -1.9, -1.5, -1.12, -0.7, -0.26].map((a, k) => ({
    a: a + rng.range(-0.09, 0.09),
    len: rng.range(0.72, 1) * (k === 3 ? 1.1 : k === 0 || k === 6 ? 0.82 : 1),
    root: rng.range(0.9, 1.2),
    bow: rng.range(0.25, 0.55) * (k % 2 === 0 ? 1 : -1),
    drop: rng.range(0.85, 1.3),
  }));
  const skim = [{ a: -3.0, len: 0.66 }, { a: -0.14, len: 0.6 }];
  const flung = Array.from({ length: 12 }, () => ({ a: rng.range(-2.85, -0.3), v: rng.range(0.7, 1.7), r: rng.range(0.03, 0.075), late: rng.range(0, 0.22) }));
  return sequence(o, 6, (ctx, i, t) => {
    const mask = surface(o.w, o.h);
    const g = mask.ctx;
    g.fillStyle = '#fff';
    // the burst reaches its full length in the first two fifths; the tendrils then sag, thin and let go
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.4), 2.4);
    const sag = smoothstep(0.42, 0.95, t);
    const droop = unit * 0.8 * Math.pow(Math.max(0, t - 0.3) / 0.7, 1.8);
    /** One tendril: a tapered, bowed tongue from the core to `(x1, y1)`, thick at its root and a thread at its tip. */
    const tongue = (a: number, reach: number, w0: number, bow: number): [number, number] => {
      const x1 = cx + Math.cos(a) * reach;
      const y1 = cy + Math.sin(a) * reach * 0.88 + droop * (0.4 + 0.6 * Math.abs(Math.cos(a)));
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const mx = (cx + x1) / 2 + nx * bow * reach;
      const my = (cy + y1) / 2 + ny * bow * reach;
      const tip = Math.max(0.6, unit * 0.014);
      g.beginPath();
      g.moveTo(cx + nx * w0, cy + ny * w0);
      g.quadraticCurveTo(mx + nx * w0 * 0.45, my + ny * w0 * 0.45, x1 + nx * tip, y1 + ny * tip);
      g.lineTo(x1 - nx * tip, y1 - ny * tip);
      g.quadraticCurveTo(mx - nx * w0 * 0.45, my - ny * w0 * 0.45, cx - nx * w0, cy - ny * w0);
      g.closePath();
      g.fill();
      return [x1, y1];
    };
    // the core: an irregular lump that swells, then sags and spreads into a puddle on the floor
    const r = unit * (0.3 + 0.14 * grow) * (1 - 0.22 * sag);
    blobPath(g, cx, cy + unit * 0.12 * sag, r * (1 + 0.5 * sag), r * (0.78 - 0.3 * sag), new Rng(o.seed + 5), 9, 0.22);
    g.fill();
    for (const k of crown) {
      const reach = unit * 1.5 * k.len * grow * (1 - 0.3 * sag);
      const w0 = unit * 0.2 * k.root * (1 - 0.62 * sag);
      const [x1, y1] = tongue(k.a, reach, w0, k.bow);
      // the drop at the end of the tendril: it hangs there, then lets go and falls
      const let_go = smoothstep(0.38, 0.78, t);
      const gap = unit * 0.42 * let_go;
      const fall = unit * 1.7 * Math.pow(Math.max(0, t - 0.5) / 0.5, 1.7) * k.drop;
      const dx = Math.cos(k.a) * (unit * 0.07 + gap);
      const dy = Math.sin(k.a) * (unit * 0.07 + gap) * 0.88 + fall;
      g.beginPath();
      g.arc(x1 + dx, y1 + dy, unit * 0.085 * k.drop * (1 - 0.4 * t), 0, TAU);
      g.fill();
    }
    for (const k of skim) tongue(k.a, unit * 1.2 * k.len * grow * (1 - 0.4 * sag), unit * 0.13 * (1 - 0.6 * sag), 0.2);
    // drops thrown clear: ballistic, small, gone before the end
    for (const f of flung) {
      const tau = Math.max(0, t - f.late);
      if (tau <= 0) continue;
      const px = cx + Math.cos(f.a) * f.v * unit * 1.5 * (1 - Math.pow(1 - Math.min(1, tau / 0.55), 2));
      const py = cy + Math.sin(f.a) * f.v * unit * 1.35 * (1 - Math.pow(1 - Math.min(1, tau / 0.55), 2)) + unit * 2.4 * tau * tau;
      g.beginPath();
      g.arc(px, py, unit * f.r * (1 - 0.5 * t), 0, TAU);
      g.fill();
    }
    // everything fades at the end
    const out = surface(o.w, o.h);
    out.ctx.globalAlpha = 1 - smoothstep(0.84, 1, t);
    out.ctx.drawImage(mask.canvas, 0, 0);
    if (layer === 'body') {
      ctx.drawImage(out.canvas, 0, 0);
    } else {
      // the rim of light on the edges that face up and to the left: a hair of violet along the ink, at half the size (it is soft: it need not be sharp)
      const k = o.w / 160;
      const edge = rim(out, 3 * k, 3 * k, 0.9 * k);
      light(ctx, () => {
        ctx.drawImage(edge.canvas, 0, 0);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(blurred(edge, 2.5 * k).canvas, 0, 0);
      });
    }
    void i;
  });
}

/**
 * The column of ink the boss throws up where its strike lands (eight frames): it rises in four, holds a beat with a ragged crown and drops flying off it, then thins and collapses. The `body` is the silhouette (dark
 * ink) and the `glow` the rim of light along both its edges and a thread of violet down its middle. 96 × 288 a frame, standing on the bottom edge.
 */
export function seqInkColumn(o: VfxOptions, layer: 'body' | 'glow'): Surface {
  const H = [0.2, 0.52, 0.86, 1, 1, 0.92, 0.6, 0.26];
  const W = [0.7, 0.9, 1, 1, 0.97, 0.86, 0.62, 0.4];
  const cx = o.w / 2;
  const base = o.h - 1;
  return sequence(o, 8, (ctx, i) => {
    const rng = new Rng(o.seed + 17);
    const mask = surface(o.w, o.h);
    const g = mask.ctx;
    g.fillStyle = '#fff';
    const top = base - (o.h - 46) * H[i]!;
    const hw = (o.w * 0.34) * W[i]!;
    g.beginPath();
    const steps = 28;
    // left edge up, ragged crown, right edge down
    const edge = (k: number, side: -1 | 1): [number, number] => {
      const u = k / steps; // 0 at the foot, 1 at the top
      const y = base - (base - top) * u;
      const bulge = 1 + 0.35 * Math.pow(1 - u, 3) + 0.12 * Math.sin(u * 9 + i);
      const noise = (fbm(u * 7 + side * 3, i * 0.37, o.seed, { octaves: 3 }) - 0.5) * o.w * 0.14;
      const taper = 1 - 0.28 * Math.pow(u, 2.2);
      return [cx + side * (hw * bulge * taper + noise), y];
    };
    for (let k = 0; k <= steps; k++) {
      const [x, y] = edge(k, -1);
      if (k === 0) g.moveTo(x - o.w * 0.1, base);
      g.lineTo(x, y);
    }
    // the crown: spikes
    const spikes = 5;
    for (let k = 0; k < spikes; k++) {
      const u = k / (spikes - 1);
      const x = cx - hw * 0.9 + u * hw * 1.8;
      const up = (o.h * 0.07 + rng.range(0, o.h * 0.07)) * (H[i]! > 0.5 ? 1 : 0.4);
      g.lineTo(x - hw * 0.12, top + o.h * 0.01);
      g.lineTo(x, top - up);
    }
    for (let k = steps; k >= 0; k--) {
      const [x, y] = edge(k, 1);
      g.lineTo(x, y);
    }
    g.lineTo(cx + hw + o.w * 0.1, base);
    g.closePath();
    g.fill();
    // the splash at the foot: two tongues that curl out along the floor
    for (const side of [-1, 1] as const) {
      g.beginPath();
      g.moveTo(cx + side * hw * 0.6, base);
      g.quadraticCurveTo(cx + side * hw * 1.7, base - o.h * 0.03, cx + side * hw * 2.0, base - o.h * (0.02 + 0.03 * H[i]!));
      g.quadraticCurveTo(cx + side * hw * 1.5, base - o.h * 0.01, cx + side * hw * 0.3, base - o.h * 0.05);
      g.fill();
    }
    // drops thrown off the crown
    if (H[i]! >= 0.85) {
      for (let k = 0; k < 6; k++) {
        const x = cx + rng.range(-1, 1) * hw * 1.2;
        const y = top - o.h * rng.range(0.05, 0.16);
        g.beginPath();
        g.arc(x, y, o.w * rng.range(0.018, 0.04), 0, TAU);
        g.fill();
      }
    }
    if (layer === 'body') {
      ctx.drawImage(mask.canvas, 0, 0);
      return;
    }
    // the glow: the rim of light on both edges, and a thread of violet down the middle
    const kk = o.w / 96;
    const r1 = rim(mask, 2 * kk, 0, kk);
    const r2 = rim(mask, -2 * kk, 0, kk);
    const core = surface(o.w, o.h);
    const cg = core.ctx.createLinearGradient(0, top, 0, base);
    cg.addColorStop(0, 'rgba(255,255,255,0.9)');
    cg.addColorStop(1, 'rgba(255,255,255,0.15)');
    core.ctx.strokeStyle = cg;
    core.ctx.lineWidth = Math.max(1.2, o.w * 0.03);
    core.ctx.lineCap = 'round';
    core.ctx.beginPath();
    core.ctx.moveTo(cx, base - 2);
    core.ctx.lineTo(cx + (rng.next() - 0.5) * 4, top + o.h * 0.02);
    core.ctx.stroke();
    light(ctx, () => {
      ctx.drawImage(r1.canvas, 0, 0);
      ctx.drawImage(r2.canvas, 0, 0);
      ctx.drawImage(withHalo(core, 2, 0.5).canvas, 0, 0);
    });
  });
}

/**
 * A pillar of light (six frames): it climbs from a flare on the floor, holds with thin ribbons of light running up it, and thins away. Soft by nature, so it is painted small and the game stretches it; standing on the
 * bottom edge. 48 × 160 a frame.
 */
export function seqLightPillar(o: VfxOptions): Surface {
  const H = [0.35, 0.7, 1, 1, 1, 0.9];
  const A = [0.7, 0.95, 1, 1, 0.7, 0.28];
  const cx = o.w / 2;
  const base = o.h - 1;
  return sequence(o, 6, (ctx, i) => {
    const s = surface(o.w, o.h);
    const g = s.ctx;
    const top = base - (o.h - 6) * H[i]!;
    light(g, () => {
      // the column: bright at its foot, gone at its head, soft at its sides
      for (let x = 0; x < o.w; x++) {
        const dx = (x - cx) / (o.w * 0.5);
        const side = Math.exp(-dx * dx * 3.2);
        const lg = g.createLinearGradient(0, top, 0, base);
        lg.addColorStop(0, 'rgba(255,255,255,0)');
        lg.addColorStop(0.55, `rgba(255,255,255,${0.32 * side})`);
        lg.addColorStop(1, `rgba(255,255,255,${0.85 * side})`);
        g.fillStyle = lg;
        g.fillRect(x, top, 1, base - top);
      }
      // ribbons running up it
      const rng = new Rng(o.seed + 3);
      for (let k = 0; k < 4; k++) {
        const x = cx + rng.range(-0.28, 0.28) * o.w;
        const phase = (i / 6 + k / 4) % 1;
        const y1 = base - (base - top) * phase;
        const y0 = y1 + (base - top) * 0.26;
        const rg = g.createLinearGradient(0, y0, 0, y1);
        rg.addColorStop(0, 'rgba(255,255,255,0)');
        rg.addColorStop(0.5, 'rgba(255,255,255,0.75)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = rg;
        g.lineWidth = Math.max(1, o.w * 0.025);
        g.beginPath();
        g.moveTo(x, Math.min(base, y0));
        g.lineTo(x, y1);
        g.stroke();
      }
      // the flare on the floor
      glowAt(g, cx, base - 3, o.w * 0.62, 0.9, [[0, 1], [0.4, 0.45], [1, 0]]);
    });
    light(ctx, () => {
      ctx.globalAlpha = A[i]!;
      ctx.drawImage(s.canvas, 0, 0);
    });
  });
}

/**
 * The flame of power that stands round a hero who is armed (six frames that loop): three tongues of light that rise from the feet, waver and thin to nothing, with motes that lift off them. 64 × 96 a frame, standing on
 * the bottom edge; faint by design: it is the PRESENCE of the energy, not an effect.
 */
export function seqAuraFlame(o: VfxOptions): Surface {
  const cx = o.w / 2;
  const base = o.h - 1;
  return sequence(o, 6, (ctx, i) => {
    const rng = new Rng(o.seed + 13);
    const s = surface(o.w, o.h);
    const g = s.ctx;
    const ph = (i / 6) * TAU;
    light(g, () => {
      for (let k = 0; k < 3; k++) {
        const x0 = cx + (k - 1) * o.w * 0.2;
        const len = o.h * (0.62 + rng.range(0, 0.3)) * (k === 1 ? 1 : 0.8);
        const wd = o.w * (k === 1 ? 0.22 : 0.16);
        const N = 18;
        const pts: Array<[number, number, number]> = [];
        for (let j = 0; j <= N; j++) {
          const u = j / N;
          pts.push([x0 + Math.sin(ph + u * 4.2 + k * 2.1) * o.w * 0.1 * u, base - len * u, (wd / 2) * Math.pow(1 - u, 0.9) * (0.4 + 0.6 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5))]);
        }
        const lg = g.createLinearGradient(0, base, 0, base - len);
        lg.addColorStop(0, 'rgba(255,255,255,0.85)');
        lg.addColorStop(0.5, 'rgba(255,255,255,0.3)');
        lg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = lg;
        g.beginPath();
        pts.forEach(([x, y, h], j) => (j === 0 ? g.moveTo(x - h, y) : g.lineTo(x - h, y)));
        for (let j = N; j >= 0; j--) g.lineTo(pts[j]![0] + pts[j]![2], pts[j]![1]);
        g.closePath();
        g.fill();
      }
      // motes lifting off
      for (let k = 0; k < 5; k++) {
        const u = (i / 6 + k / 5) % 1;
        glowAt(g, cx + rng.range(-0.3, 0.3) * o.w, base - o.h * (0.2 + 0.7 * u), 1.6 + rng.range(0, 1.2), 0.9 * (1 - u), [[0, 1], [1, 0]]);
      }
      glowAt(g, cx, base - 2, o.w * 0.5, 0.5, [[0, 1], [1, 0]]);
    });
    ctx.drawImage(withHalo(s, 3, 0.4).canvas, 0, 0);
  });
}
