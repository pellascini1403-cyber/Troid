import { surface, type Surface } from './canvas';
import { hex, smoothstep, type Rgb } from './color';
import type { Draw } from './forms';
import { makeField } from './field';
import { alphaOf } from './ground';
import type { Layers } from './light';
import { MOSS, STONE, stone } from './masonry';
import { lit, rune } from './props';
import { Rng } from './rng';
import { inlay } from './seal';
import { SilhouetteLayer } from './silhouette';
import { blobPath } from './shapes';

/**
 * The Sanctum (R4): the hall where the hero rests one last time and the Ink Warden sleeps. It is made to be BIG — columns taller than the screen, guardians of stone that look down from
 * the haze, a wall with an eye cut into it behind the arena, a portal at either end — and to have a gradient of tension that the pieces carry: cyan where the hero is safe (the shrine, the
 * reward), a little violet where the Warden is (the wall's eye, the ink on the floor). Original geometry only — rings, ticks, strokes; never a letter of any alphabet.
 */
export interface SanctumOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

const CYAN: Rgb = hex('#3ee8ff');
const VIOLET: Rgb = hex('#9a5cff');

const rgba = (c: Rgb, a: number): string => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/** The picture fades to nothing toward its top edge over `px` pixels: a column, a banner, a guardian lost in the dark above the screen — never a flat edge. */
function fadeTop(l: Layers, px: number): Layers {
  const alpha =
    l.alpha ??
    (() => {
      const f = makeField(l.w, l.h);
      f.d.fill(1);
      return f;
    })();
  for (let y = 0; y < Math.min(l.h, Math.ceil(px)); y++) {
    const k = smoothstep(0, px, y);
    for (let x = 0; x < l.w; x++) alpha.d[y * l.w + x] = alpha.d[y * l.w + x]! * k;
  }
  l.alpha = alpha;
  return l;
}

const finish = (layer: SilhouetteLayer, fade = 0): Surface => {
  const layers = layer.layers(STONE, MOSS);
  if (fade > 0) fadeTop(layers, fade);
  return lit(layers, false);
};

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the columns

/**
 * A column of the hall at the depth of the hero: a stepped foot, a fluted shaft that swells a little, three collars with a line of light under each and a column of runes between them. It
 * is taller than the view: the top of the picture fades into the dark, so no edge is ever seen.
 */
export function colossalColumn(o: SanctumOptions & { variant?: number }): Surface {
  const { w, h, ppm: u, seed } = o;
  const variant = o.variant ?? 0;
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const foot = h - 2;
  let y = foot;
  for (const [bw, bh, tone] of [[2.5, 0.36, 0.3], [2.2, 0.26, 0.28], [1.96, 0.2, 0.26]] as const) {
    const x0 = cx - (bw * u) / 2;
    const yy = y;
    layer.add((ctx) => ctx.fillRect(x0, yy - bh * u, bw * u, bh * u), { x0, x1: x0 + bw * u, y0: yy - bh * u, y1: yy }, { round: u * 0.1, tone, spread: 0.06, moss: 0.25 });
    y -= bh * u;
  }
  const base = y;
  const top = 2;
  const span = base - top;
  const shaft: Draw = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(cx - 0.88 * u, base);
    ctx.bezierCurveTo(cx - 0.97 * u, base - span * 0.35, cx - 0.93 * u, base - span * 0.7, cx - 0.84 * u, top);
    ctx.lineTo(cx + 0.84 * u, top);
    ctx.bezierCurveTo(cx + 0.93 * u, base - span * 0.7, cx + 0.97 * u, base - span * 0.35, cx + 0.88 * u, base);
    ctx.closePath();
    ctx.fill();
  };
  layer.add(shaft, { x0: cx - u, x1: cx + u, y0: top, y1: base }, { round: u * 0.9, tone: 0.22, spread: 0.07, moss: 0.2, fade: [0.02, -0.05], flutes: { count: 9, depth: u * 0.07 } });
  // the collars
  const collars = (variant === 0 ? [2.4, 5.6, 9.0] : [3.0, 6.4, 9.8]).map((m) => foot - m * u);
  for (const yc of collars) {
    layer.add((ctx) => ctx.fillRect(cx - 1.08 * u, yc - 0.24 * u, 2.16 * u, 0.48 * u), { x0: cx - 1.1 * u, x1: cx + 1.1 * u, y0: yc - 0.26 * u, y1: yc + 0.26 * u }, { round: u * 1.04, tone: 0.28, spread: 0.06, moss: 0.2 });
  }
  const lines: Draw = (ctx) => {
    for (const yc of collars) {
      ctx.fillRect(cx - 0.98 * u, yc + 0.2 * u, 1.96 * u, Math.max(1.5, u * 0.035));
    }
  };
  layer.glow(lines, { x0: cx - 1.2 * u, x1: cx + 1.2 * u, y0: top, y1: base }, CYAN, 0.5, u * 0.05);
  // a column of runes between the collars
  const runes: Draw = (ctx) => {
    const r2 = new Rng(seed + 5);
    ctx.strokeStyle = '#fff';
    const stops = [...collars, top + 0.5 * u];
    for (let i = 0; i < collars.length; i++) {
      const lo = collars[i]! - 0.3 * u;
      const hi = stops[i + 1]! + (i + 1 < collars.length ? 0.3 * u : 1.0 * u);
      for (const t of [0.25, 0.5, 0.75]) rune(ctx, cx, lo + (hi - lo) * t, u * 0.46, r2);
    }
  };
  layer.glow(runes, { x0: cx - 0.5 * u, x1: cx + 0.5 * u, y0: top, y1: base }, CYAN, 0.42, u * 0.06);
  return finish(layer, 2.2 * u);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the guardians

/**
 * A guardian of the hall, colossal: a hooded cloak that falls from the shoulders to a stepped plinth, a greatsword planted in front of it with both hands on the pommel, and two slits of cyan
 * light where the hood is empty. For the layers behind the action — it is painted dark and hazy, to be seen as a shape. The Warden is one of these woken: the same cloak, the same hood.
 */
export function colossus(o: SanctumOptions & { variant?: number }): Surface {
  const { w, h, ppm: u, seed } = o;
  const variant = o.variant ?? 0;
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const foot = h - 2;
  const S = 12.6 * u;
  // the cloak, first: its hem goes under the plinth
  const yb0 = foot - 1.9 * u;
  const topY = yb0 - S;
  // half the width of the cloak (in metres) at each height (0 at the hem … 1 at the tip of the hood): a bell, broad shoulders, a neck, a rounded hood
  const stops: ReadonlyArray<readonly [number, number]> = [[0, 2.1], [0.12, 2.0], [0.4, 1.8], [0.62, 2.05], [0.7, 1.4], [0.76, 1.12], [0.84, 1.02], [0.93, 0.66]];
  const halfAt = (t: number): number => {
    if (t >= 0.93) return 0.66 * Math.sqrt(Math.max(0, 1 - ((t - 0.93) / 0.07) ** 2));
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, w0] = stops[i]!;
      const [t1, w1] = stops[i + 1]!;
      if (t <= t1) return w0 + (w1 - w0) * smoothstep(t0, t1, t);
    }
    return 0;
  };
  const cloak: Draw = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(cx - 2.1 * u, yb0 + 0.4 * u);
    for (let i = 0; i <= 80; i++) ctx.lineTo(cx - halfAt(i / 80) * u, yb0 - S * (i / 80));
    for (let i = 80; i >= 0; i--) ctx.lineTo(cx + halfAt(i / 80) * u, yb0 - S * (i / 80));
    ctx.lineTo(cx + 2.1 * u, yb0 + 0.4 * u);
    ctx.closePath();
    ctx.fill();
  };
  layer.add(cloak, { x0: cx - 2.15 * u, x1: cx + 2.15 * u, y0: topY, y1: yb0 + 0.4 * u }, { round: 2 * u, tone: 0.18, spread: 0.06, moss: 0.25, fade: [0.08, -0.05], flutes: { count: variant === 0 ? 5 : 6, depth: u * 0.2 } });
  // the hood's dark: the face that is not there
  const faceY = yb0 - S * 0.865;
  layer.add((ctx) => { ctx.beginPath(); ctx.ellipse(cx, faceY, 0.36 * u, 0.62 * u, 0, 0, Math.PI * 2); ctx.fill(); }, { x0: cx - 0.4 * u, x1: cx + 0.4 * u, y0: faceY - 0.66 * u, y1: faceY + 0.66 * u }, { round: 0.1 * u, tone: 0.02, spread: 0.01 });
  // the plinth: three steps
  let y = foot;
  for (const [bw, bh, tone] of [[4.5, 0.8, 0.24], [3.9, 0.6, 0.22], [3.3, 0.5, 0.2]] as const) {
    const x0 = cx - (bw * u) / 2;
    const yy = y;
    layer.add((ctx) => ctx.fillRect(x0, yy - bh * u, bw * u, bh * u), { x0, x1: x0 + bw * u, y0: yy - bh * u, y1: yy }, { round: u * 0.12, tone, spread: 0.06, moss: 0.35 });
    y -= bh * u;
  }
  // the arms: two sleeves that come down from the shoulders and meet on the pommel of the sword, hands over it
  const hiltY = yb0 - S * 0.42;
  for (const sx of [-1, 1] as const) {
    const sleeve: Draw = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 1.9 * u, yb0 - S * 0.6);
      ctx.bezierCurveTo(cx + sx * 2.0 * u, yb0 - S * 0.46, cx + sx * 1.1 * u, hiltY - 1.5 * u, cx + sx * 0.5 * u, hiltY - 1.1 * u);
      ctx.lineTo(cx + sx * 0.12 * u, hiltY - 1.2 * u);
      ctx.bezierCurveTo(cx + sx * 0.9 * u, hiltY - 2.2 * u, cx + sx * 1.3 * u, yb0 - S * 0.5, cx + sx * 1.35 * u, yb0 - S * 0.64);
      ctx.closePath();
      ctx.fill();
    };
    layer.add(sleeve, { x0: cx + Math.min(0, sx * 2.1 * u), x1: cx + Math.max(0, sx * 2.1 * u), y0: yb0 - S * 0.66, y1: hiltY - 0.8 * u }, { round: 0.5 * u, tone: 0.22, spread: 0.05, moss: 0.15 });
  }
  // the greatsword planted before it
  const sword: Draw = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(cx - 0.2 * u, hiltY + 0.2 * u);
    ctx.lineTo(cx + 0.2 * u, hiltY + 0.2 * u);
    ctx.lineTo(cx, yb0 + 0.3 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 0.09 * u, hiltY - 1.2 * u, 0.18 * u, 1.4 * u);
    ctx.fillRect(cx - 1.05 * u, hiltY - 0.06 * u, 2.1 * u, 0.28 * u);
    ctx.beginPath();
    ctx.arc(cx, hiltY - 1.32 * u, 0.24 * u, 0, Math.PI * 2);
    ctx.fill();
  };
  layer.add(sword, { x0: cx - 1.1 * u, x1: cx + 1.1 * u, y0: hiltY - 1.6 * u, y1: yb0 + 0.4 * u }, { round: 0.14 * u, tone: 0.44, spread: 0.05 });
  // the light: two slits in the hood, a line down the blade, a ring on the chest
  const eyes: Draw = (ctx) => {
    ctx.beginPath();
    ctx.ellipse(cx - 0.2 * u, faceY, 0.17 * u, 0.06 * u, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 0.2 * u, faceY, 0.17 * u, 0.06 * u, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  layer.glow(eyes, { x0: cx - 0.8 * u, x1: cx + 0.8 * u, y0: faceY - 0.8 * u, y1: faceY + 0.8 * u }, CYAN, 1.3, u * 0.28);
  const lines: Draw = (ctx) => {
    ctx.fillRect(cx - Math.max(0.8, u * 0.02), hiltY + 0.3 * u, Math.max(1.6, u * 0.04), yb0 - hiltY - 0.2 * u);
    ctx.fillRect(cx - 0.96 * u, hiltY + 0.02 * u, 1.92 * u, Math.max(1.2, u * 0.03));
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.2, u * 0.05);
    ctx.strokeStyle = '#fff';
    ctx.arc(cx, hiltY - 2.2 * u, 0.62 * u, 0, Math.PI * 2);
    ctx.stroke();
  };
  layer.glow(lines, { x0: cx - 1.2 * u, x1: cx + 1.2 * u, y0: hiltY - 3 * u, y1: yb0 + 0.4 * u }, CYAN, 0.8, u * 0.07);
  return finish(layer, 0.8 * u);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the eye in the wall

/**
 * The wall behind the arena: a niche of dark stone with its head rounded and a great eye cut into it — rings with rays between them, in cold light — and in the middle of the eye a slit of
 * violet, dim. The Warden's. Over it, rows of runes. It is cut INTO the stone, and full of light.
 */
export function eyeWall(o: SanctumOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const rng = new Rng(seed);
  const base = stone({ w, h, ppm: u, seed, style: 'courses', courseM: [0.9, 1.6], blockM: [1.4, 2.8], jointM: 0.1, moss: 0.12, cracks: 0.45, stains: 0.9, energy: 0, stone: STONE, mossRamp: MOSS, tone: 0.22, toneSpread: 0.07 });
  // the shape: a rectangle with a round head
  const mask = surface(w, h);
  mask.ctx.fillStyle = '#fff';
  mask.ctx.beginPath();
  mask.ctx.moveTo(0, h);
  mask.ctx.lineTo(0, w / 2);
  mask.ctx.arc(w / 2, w / 2, w / 2, Math.PI, 0);
  mask.ctx.lineTo(w, h);
  mask.ctx.closePath();
  mask.ctx.fill();
  base.alpha = alphaOf(mask);
  const cut = surface(w, h);
  const c = cut.ctx;
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.lineCap = 'round';
  const cx = w / 2;
  const ey = w / 2 + 0.2 * u;
  // the frame of the niche
  c.lineWidth = Math.max(2, u * 0.12);
  c.beginPath();
  c.moveTo(cx - w * 0.46, h * 0.99);
  c.lineTo(cx - w * 0.46, w / 2);
  c.arc(cx, w / 2, w * 0.46, Math.PI, 0);
  c.lineTo(cx + w * 0.46, h * 0.99);
  c.stroke();
  // the rings and their rays
  for (const [k, lw] of [[3.9, 0.16], [3.1, 0.12], [2.3, 0.12], [1.5, 0.1]] as const) {
    c.lineWidth = Math.max(2, u * lw);
    c.beginPath();
    c.arc(cx, ey, k * u, 0, Math.PI * 2);
    c.stroke();
  }
  c.lineWidth = Math.max(1.6, u * 0.07);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2 + 0.05;
    const r0 = i % 4 === 0 ? 2.4 : 3.2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r0 * u, ey + Math.sin(a) * r0 * u);
    c.lineTo(cx + Math.cos(a) * 3.85 * u, ey + Math.sin(a) * 3.85 * u);
    c.stroke();
  }
  // rows of runes below the eye
  const lines = 3;
  for (let row = 0; row < lines; row++) {
    for (let col = 0; col < 7; col++) rune(c, cx + (col - 3) * 1.15 * u, ey + 5.1 * u + row * 0.95 * u, u * 0.62, rng);
  }
  const grooves = inlay(base, cut, u, CYAN, { depth: 2.6, strength: 0.32, halo: 0.1 });
  // the pupil: a slit of violet, dim — the Warden's
  const pupil = surface(w, h);
  const p = pupil.ctx;
  p.fillStyle = '#fff';
  p.beginPath();
  p.moveTo(cx, ey - 1.15 * u);
  p.lineTo(cx + 0.4 * u, ey);
  p.lineTo(cx, ey + 1.15 * u);
  p.lineTo(cx - 0.4 * u, ey);
  p.closePath();
  p.fill();
  return lit(inlay(grooves, pupil, u, VIOLET, { depth: 3, strength: 0.6, halo: 0.2 }), false);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the shrine of the last rest

/**
 * The shrine where the hero rests for the last time before the arena (the interactive `rest`): a dais of three steps, two obelisks with a column of runes, a squat pedestal with a bowl, and over
 * the bowl a crystal inside a ring of light. TWO cells side by side: how it waits (the crystal dim) and how it looks when it is the hero's checkpoint (the crystal burning, a pillar of light over
 * it, a pool on the floor): the game shows the second over the first.
 */
export function sanctumShrine(o: SanctumOptions): Surface {
  const { w: W, h, ppm: density, seed } = o;
  // drawn a fifth larger than its density says (the same pixels per metre): it is the landmark of the room, and must be seen from afar
  const u = density * 1.2;
  const cell = W / 2;
  const out = surface(W, h);
  for (let state = 0; state < 2; state++) {
    const lit1 = state === 1;
    const layer = new SilhouetteLayer(cell, h, seed, false);
    const cx = cell / 2;
    const foot = h - 2;
    // the dais
    let y = foot;
    for (const [bw, bh, tone] of [[3.1, 0.2, 0.34], [2.4, 0.18, 0.32], [1.7, 0.18, 0.3]] as const) {
      const x0 = cx - (bw * u) / 2;
      const yy = y;
      layer.add((ctx) => ctx.fillRect(x0, yy - bh * u, bw * u, bh * u), { x0, x1: x0 + bw * u, y0: yy - bh * u, y1: yy }, { round: u * 0.07, tone, spread: 0.05, moss: 0.3 });
      y -= bh * u;
    }
    const deck = y;
    // the obelisks
    const obelisk = (sx: number): void => {
      const x = cx + sx * 1.18 * u;
      const draw: Draw = (ctx) => {
        ctx.beginPath();
        ctx.moveTo(x - 0.2 * u, foot - 0.2 * u);
        ctx.lineTo(x - 0.13 * u, foot - 2.9 * u);
        ctx.lineTo(x, foot - 3.15 * u);
        ctx.lineTo(x + 0.13 * u, foot - 2.9 * u);
        ctx.lineTo(x + 0.2 * u, foot - 0.2 * u);
        ctx.closePath();
        ctx.fill();
      };
      layer.add(draw, { x0: x - 0.22 * u, x1: x + 0.22 * u, y0: foot - 3.2 * u, y1: foot - 0.2 * u }, { round: u * 0.13, tone: 0.3, spread: 0.06, moss: 0.3, fade: [0.04, -0.04] });
      const runes: Draw = (ctx) => {
        const r2 = new Rng(seed + (sx > 0 ? 3 : 4));
        ctx.strokeStyle = '#fff';
        for (const t of [0.35, 0.55, 0.75]) rune(ctx, x, foot - 3.0 * u * t - 0.2 * u, u * 0.2, r2);
      };
      layer.glow(runes, { x0: x - 0.2 * u, x1: x + 0.2 * u, y0: foot - 3.2 * u, y1: foot - 0.4 * u }, CYAN, lit1 ? 1.3 : 0.75, u * 0.04);
    };
    obelisk(-1);
    obelisk(1);
    // the pedestal and its bowl
    const pedestal: Draw = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(cx - 0.46 * u, deck);
      ctx.lineTo(cx - 0.34 * u, deck - 0.5 * u);
      ctx.lineTo(cx - 0.3 * u, deck - 0.95 * u);
      ctx.lineTo(cx - 0.52 * u, deck - 1.12 * u);
      ctx.lineTo(cx - 0.56 * u, deck - 1.3 * u);
      ctx.lineTo(cx + 0.56 * u, deck - 1.3 * u);
      ctx.lineTo(cx + 0.52 * u, deck - 1.12 * u);
      ctx.lineTo(cx + 0.3 * u, deck - 0.95 * u);
      ctx.lineTo(cx + 0.34 * u, deck - 0.5 * u);
      ctx.lineTo(cx + 0.46 * u, deck);
      ctx.closePath();
      ctx.fill();
    };
    layer.add(pedestal, { x0: cx - 0.6 * u, x1: cx + 0.6 * u, y0: deck - 1.32 * u, y1: deck }, { round: u * 0.3, tone: 0.34, spread: 0.06, moss: 0.25, fade: [0.05, -0.04] });
    const waist: Draw = (ctx) => {
      const r2 = new Rng(seed + 9);
      ctx.strokeStyle = '#fff';
      for (const [dx, dy] of [[-0.06, 0.34], [0.05, 0.56], [-0.04, 0.78]] as const) rune(ctx, cx + dx * u, deck - dy * u, u * 0.17, r2);
    };
    layer.glow(waist, { x0: cx - 0.3 * u, x1: cx + 0.3 * u, y0: deck - 0.95 * u, y1: deck - 0.2 * u }, CYAN, lit1 ? 1.3 : 0.75, u * 0.04);
    // the crystal in its ring
    const cyY = deck - 2.3 * u;
    const crystal: Draw = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(cx, cyY - 0.36 * u);
      ctx.lineTo(cx + 0.2 * u, cyY);
      ctx.lineTo(cx, cyY + 0.36 * u);
      ctx.lineTo(cx - 0.2 * u, cyY);
      ctx.closePath();
      for (const [dx, dy, k] of [[-0.5, 0.2, 0.5], [0.52, 0.08, 0.42]] as const) {
        ctx.moveTo(cx + dx * u, cyY + dy * u - 0.17 * k * 2 * u);
        ctx.lineTo(cx + dx * u + 0.07 * k * 2 * u, cyY + dy * u);
        ctx.lineTo(cx + dx * u, cyY + dy * u + 0.17 * k * 2 * u);
        ctx.lineTo(cx + dx * u - 0.07 * k * 2 * u, cyY + dy * u);
        ctx.closePath();
      }
      ctx.fill();
    };
    layer.add(crystal, { x0: cx - 0.7 * u, x1: cx + 0.7 * u, y0: cyY - 0.4 * u, y1: cyY + 0.5 * u }, { round: u * 0.1, tone: lit1 ? 0.78 : 0.5, spread: 0.04 });
    layer.glow(crystal, { x0: 0, y0: 0, x1: cell, y1: h }, CYAN, lit1 ? 1.35 : 0.6, lit1 ? u * 0.45 : u * 0.24);
    const ring: Draw = (ctx) => {
      ctx.beginPath();
      ctx.lineWidth = Math.max(1.4, u * 0.035);
      ctx.strokeStyle = '#fff';
      ctx.arc(cx, cyY, 0.62 * u, 0, Math.PI * 2);
      ctx.stroke();
    };
    layer.glow(ring, { x0: cx - 0.7 * u, x1: cx + 0.7 * u, y0: cyY - 0.7 * u, y1: cyY + 0.7 * u }, CYAN, lit1 ? 1.1 : 0.5, u * 0.05);
    const cellSurface = finish(layer);
    out.ctx.drawImage(cellSurface.canvas, state * cell, 0);
    if (lit1) {
      const px = state * cell + cx;
      // a pillar of light over the crystal, and a pool of light on the floor under the shrine: a shrine that is the checkpoint is told from afar
      const column = surface(cell, h);
      const beam = column.ctx.createLinearGradient(0, cyY - 0.4 * u, 0, 0);
      beam.addColorStop(0, 'rgba(150,240,255,0.5)');
      beam.addColorStop(1, 'rgba(150,240,255,0)');
      column.ctx.fillStyle = beam;
      column.ctx.fillRect(cx - 0.2 * u, 0, 0.4 * u, cyY - 0.4 * u);
      out.ctx.save();
      out.ctx.filter = `blur(${Math.max(2, u * 0.07)}px)`;
      out.ctx.drawImage(column.canvas, state * cell, 0);
      out.ctx.restore();
      const pool = out.ctx.createRadialGradient(px, foot - 0.05 * u, 0, px, foot - 0.05 * u, 1.9 * u);
      pool.addColorStop(0, 'rgba(120,235,255,0.34)');
      pool.addColorStop(1, 'rgba(120,235,255,0)');
      out.ctx.save();
      out.ctx.translate(0, foot - 0.05 * u);
      out.ctx.scale(1, 0.16);
      out.ctx.translate(0, -(foot - 0.05 * u));
      out.ctx.fillStyle = pool;
      out.ctx.fillRect(state * cell, 0, cell, h * 7);
      out.ctx.restore();
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the reward

/**
 * The Air Dash (the pickup that gives an ability: the rune): a ring of light with three chevrons running inside it and three streaks of speed trailing behind — a dash that does not need the
 * ground. Painted as light: it floats over the dais in the additive layer.
 */
export function airRune(o: SanctumOptions): Surface {
  const { w, h, ppm: u } = o;
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w * 0.5;
  const cy = h * 0.56;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, u * 0.7);
  halo.addColorStop(0, 'rgba(110,240,255,0.46)');
  halo.addColorStop(0.55, 'rgba(70,205,255,0.14)');
  halo.addColorStop(1, 'rgba(70,205,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the ring
  ctx.strokeStyle = 'rgba(150,246,255,0.95)';
  ctx.lineWidth = Math.max(1.6, u * 0.035);
  ctx.beginPath();
  ctx.arc(cx, cy, u * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(150,246,255,0.4)';
  ctx.lineWidth = Math.max(1, u * 0.015);
  ctx.beginPath();
  ctx.arc(cx, cy, u * 0.44, 0.4, Math.PI * 2 - 0.4);
  ctx.stroke();
  // three chevrons
  ctx.save();
  ctx.shadowColor = 'rgba(80,235,255,1)';
  ctx.shadowBlur = u * 0.1;
  ctx.strokeStyle = 'rgba(245,255,255,0.98)';
  ctx.lineWidth = Math.max(1.8, u * 0.045);
  for (const dx of [-0.13, 0, 0.13]) {
    ctx.beginPath();
    ctx.moveTo(cx + (dx - 0.075) * u, cy - 0.16 * u);
    ctx.lineTo(cx + (dx + 0.06) * u, cy);
    ctx.lineTo(cx + (dx - 0.075) * u, cy + 0.16 * u);
    ctx.stroke();
  }
  ctx.restore();
  // the streaks of speed behind it
  for (const [dy, len, a] of [[-0.18, 0.28, 0.55], [0, 0.46, 0.8], [0.18, 0.28, 0.55]] as const) {
    const x1 = cx - u * 0.42;
    const g = ctx.createLinearGradient(x1 - len * u, 0, x1, 0);
    g.addColorStop(0, 'rgba(150,246,255,0)');
    g.addColorStop(1, rgba([0.6, 0.97, 1], a));
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1.4, u * 0.03);
    ctx.beginPath();
    ctx.moveTo(x1 - len * u, cy + dy * u);
    ctx.lineTo(x1, cy + dy * u);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(220,252,255,0.95)';
  for (const [mx, my, mr] of [[0.04, -0.58, 1.6], [0.2, -0.66, 1.1], [-0.12, -0.7, 1.2]] as const) {
    ctx.beginPath();
    ctx.arc(cx + mx * u, cy + my * u, Math.max(0.8, mr * (u / 96)), 0, Math.PI * 2);
    ctx.fill();
  }
  return s;
}

/** The dais of the reward: three steps of dark stone with a line of light along the edge of each and a shallow dish on top, lit — where the rune floats. */
export function dais(o: SanctumOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const foot = h - 2;
  let y = foot;
  const tops: number[] = [];
  for (const [bw, bh, tone] of [[2.6, 0.26, 0.32], [2.0, 0.26, 0.3], [1.4, 0.28, 0.28]] as const) {
    const x0 = cx - (bw * u) / 2;
    const yy = y;
    layer.add((ctx) => ctx.fillRect(x0, yy - bh * u, bw * u, bh * u), { x0, x1: x0 + bw * u, y0: yy - bh * u, y1: yy }, { round: u * 0.09, tone, spread: 0.05, moss: 0.35 });
    y -= bh * u;
    tops.push(y);
  }
  const edges: Draw = (ctx) => {
    for (const [i, bw] of ([2.6, 2.0, 1.4] as const).entries()) ctx.fillRect(cx - (bw * u) / 2 + 2, tops[i]! + 1, bw * u - 4, Math.max(1.4, u * 0.025));
  };
  layer.glow(edges, { x0: cx - 1.4 * u, x1: cx + 1.4 * u, y0: tops[2]! - 4, y1: foot }, CYAN, 0.9, u * 0.05);
  const dish: Draw = (ctx) => {
    ctx.beginPath();
    ctx.ellipse(cx, tops[2]! + 1, 0.46 * u, 0.05 * u, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  layer.glow(dish, { x0: cx - 0.8 * u, x1: cx + 0.8 * u, y0: tops[2]! - 0.4 * u, y1: tops[2]! + 0.2 * u }, CYAN, 1.1, u * 0.14);
  return finish(layer);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the ink

/** A pool of ink on the floor: dark and glossy, a thin streak of violet along its upper edge and a few bubbles — the Warden's, seeping out from under its door. Not light: it is a dark thing. */
export function inkPool(o: SanctumOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const rng = new Rng(seed);
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const base = h - 1;
  // the body of the pool, flat on the ground
  ctx.fillStyle = 'rgb(8,7,18)';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.48, base);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = cx - w * 0.48 + t * w * 0.96;
    const yy = base - Math.sin(t * Math.PI) ** 0.8 * h * 0.42 * (0.8 + 0.4 * rng.next());
    ctx.lineTo(x, yy);
  }
  ctx.lineTo(cx + w * 0.48, base);
  ctx.closePath();
  ctx.fill();
  // bubbles
  for (let i = 0; i < 4; i++) {
    const bx = cx + rng.range(-0.34, 0.34) * w;
    const r = u * rng.range(0.06, 0.13);
    ctx.beginPath();
    ctx.ellipse(bx, base - h * 0.36 - r * 0.5, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // the gloss along the upper edge, and a violet rim
  const gloss = ctx.createLinearGradient(0, base - h * 0.5, 0, base);
  gloss.addColorStop(0, 'rgba(160,120,255,0.7)');
  gloss.addColorStop(0.5, 'rgba(110,80,200,0.12)');
  gloss.addColorStop(1, 'rgba(110,80,200,0)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(160,120,255,0.5)';
  ctx.lineWidth = Math.max(1, u * 0.012);
  ctx.beginPath();
  for (let i = 3; i <= 21; i++) {
    const t = i / 24;
    const x = cx - w * 0.48 + t * w * 0.96;
    const yy = base - Math.sin(t * Math.PI) ** 0.8 * h * 0.42 - 0.5;
    if (i === 3) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  // a few drops splashed beside it
  ctx.fillStyle = 'rgb(8,7,18)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    blobPath(ctx, cx + rng.range(-0.5, 0.5) * w, base - 1.5, u * rng.range(0.03, 0.06), u * rng.range(0.012, 0.024), rng, 5, 0.2);
    ctx.fill();
  }
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the banners

/** A banner that hangs from the dark above: a long cloth with a swallow tail, torn at the hem, with a ring and three ticks of cold light on it. It fades into the dark at its top. */
export function banner(o: SanctumOptions & { variant?: number }): Surface {
  const { w, h, ppm: u, seed } = o;
  const variant = o.variant ?? 0;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const hw = 0.68 * u;
  const sway = (t: number): number => Math.sin(t * 5.2 + seed) * 0.05 * u * t;
  const cloth: Draw = (ctx) => {
    ctx.beginPath();
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = 2 + t * (h - 2 - 0.7 * u);
      const x = cx - hw - sway(t) + Math.sin(t * 17 + seed) * 0.012 * u;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // the swallow tail
    const yEnd = h - 2 - 0.7 * u;
    ctx.lineTo(cx - hw * 0.7 - sway(1), yEnd + 0.46 * u);
    ctx.lineTo(cx - hw * 0.5, yEnd + 0.7 * u);
    ctx.lineTo(cx - sway(1), yEnd + 0.26 * u);
    ctx.lineTo(cx + hw * 0.5, yEnd + 0.7 * u);
    ctx.lineTo(cx + hw * 0.7 - sway(1), yEnd + 0.46 * u);
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const y = 2 + t * (h - 2 - 0.7 * u);
      ctx.lineTo(cx + hw - sway(t) + Math.sin(t * 13 + seed) * 0.012 * u, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  layer.add(cloth, { x0: cx - hw - 0.3 * u, x1: cx + hw + 0.3 * u, y0: 0, y1: h }, { round: u * 0.18, tone: 0.16, spread: 0.08, fade: [0.03, -0.05], flutes: { count: 4, depth: u * 0.07 } });
  // the hem is torn: a few threads
  const threads: Draw = (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, u * 0.012);
    for (let i = 0; i < 7; i++) {
      const x = cx + rng.range(-0.5, 0.5) * hw * 1.4;
      const y = h - 2 - rng.range(0.15, 0.6) * u;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.range(-0.05, 0.05) * u, y + rng.range(0.15, 0.4) * u);
      ctx.stroke();
    }
  };
  layer.add(threads, { x0: cx - hw * 1.1, x1: cx + hw * 1.1, y0: h - 1.2 * u, y1: h }, { round: 0.6, tone: 0.14, spread: 0.04 });
  // the emblem in cold light: a ring, three ticks, a dot
  const emblem: Draw = (ctx) => {
    const ey = variant === 0 ? h * 0.46 : h * 0.38;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = Math.max(1.3, u * 0.035);
    ctx.beginPath();
    ctx.arc(cx, ey, 0.34 * u, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(cx, ey + 0.46 * u + k * 0.2 * u);
      ctx.lineTo(cx, ey + 0.54 * u + k * 0.2 * u);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, ey, 0.06 * u, 0, Math.PI * 2);
    ctx.fill();
  };
  layer.glow(emblem, { x0: cx - 0.6 * u, x1: cx + 0.6 * u, y0: h * 0.3, y1: h * 0.7 }, variant === 1 ? VIOLET : CYAN, 0.45, u * 0.07);
  return finish(layer, 2.4 * u);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the portals

/**
 * A portal of the sanctum: a wall of dark stone cut by a doorway with a pointed head, a line of light inlaid along its edge, a column of runes on each pilaster and a ring cut over the keystone.
 * It stands at the two ends of the slice's last room — the way back and the way out — and the same picture serves both.
 */
export function portalGrand(o: SanctumOptions): Surface {
  const { w, h, ppm: u, seed } = o;
  const rng = new Rng(seed);
  const base = stone({ w, h, ppm: u, seed, style: 'courses', courseM: [0.8, 1.4], blockM: [1.2, 2.4], jointM: 0.09, moss: 0.15, cracks: 0.4, stains: 0.9, energy: 0, stone: STONE, mossRamp: MOSS, tone: 0.24, toneSpread: 0.07 });
  const cx = w / 2;
  const open = 1.9 * u; // half the width of the doorway
  const archY = h - 5.0 * u; // where the head of the doorway starts to curve
  // the shape: the wall, with the doorway cut out of it
  const mask = surface(w, h);
  const m = mask.ctx;
  m.fillStyle = '#fff';
  m.beginPath();
  m.moveTo(0, h);
  m.lineTo(0, 0);
  m.lineTo(w, 0);
  m.lineTo(w, h);
  m.lineTo(cx + open, h);
  m.lineTo(cx + open, archY);
  m.quadraticCurveTo(cx + open, archY - open * 1.5, cx, archY - open * 2.15);
  m.quadraticCurveTo(cx - open, archY - open * 1.5, cx - open, archY);
  m.lineTo(cx - open, h);
  m.closePath();
  m.fill();
  base.alpha = alphaOf(mask);
  const cut = surface(w, h);
  const c = cut.ctx;
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // the line of light along the edge of the doorway
  c.lineWidth = Math.max(2, u * 0.09);
  c.beginPath();
  const gap = 0.32 * u;
  c.moveTo(cx - open - gap, h);
  c.lineTo(cx - open - gap, archY);
  c.quadraticCurveTo(cx - open - gap, archY - (open + gap) * 1.5, cx, archY - (open + gap) * 2.15);
  c.quadraticCurveTo(cx + open + gap, archY - (open + gap) * 1.5, cx + open + gap, archY);
  c.lineTo(cx + open + gap, h);
  c.stroke();
  // a column of runes on each pilaster
  const px = (w / 2 - open) / 2;
  for (const sx of [-1, 1] as const) {
    const x = cx + sx * (open + px);
    c.lineWidth = Math.max(1.6, u * 0.05);
    c.beginPath();
    c.moveTo(x - 0.45 * u, h * 0.02);
    c.lineTo(x - 0.45 * u, h);
    c.moveTo(x + 0.45 * u, h * 0.02);
    c.lineTo(x + 0.45 * u, h);
    c.stroke();
    const rungs = Math.round(h / (u * 1.1));
    for (let i = 0; i < rungs; i++) rune(c, x, h * ((i + 0.5) / rungs), u * 0.5, rng);
  }
  // the ring over the keystone
  const ringY = archY - open * 2.15 - 1.5 * u;
  c.lineWidth = Math.max(2, u * 0.08);
  c.beginPath();
  c.arc(cx, ringY, 0.8 * u, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = Math.max(1.4, u * 0.04);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * 1.0 * u, ringY + Math.sin(a) * 1.0 * u);
    c.lineTo(cx + Math.cos(a) * 1.22 * u, ringY + Math.sin(a) * 1.22 * u);
    c.stroke();
  }
  const grooves = inlay(base, cut, u, CYAN, { depth: 2.4, strength: 0.5, halo: 0.1 });
  const heart = surface(w, h);
  heart.ctx.fillStyle = '#fff';
  heart.ctx.beginPath();
  heart.ctx.arc(cx, ringY, 0.16 * u, 0, Math.PI * 2);
  heart.ctx.fill();
  return lit(fadeTop(inlay(grooves, heart, u, VIOLET, { depth: 2.6, strength: 1.0, halo: 0.14 }), 1.6 * u), false);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the floor

/**
 * The floor of the hall: a strip of dark polished slabs, periodic along its length, `cols` metres long and 0.3 m tall, with seams and — by `style` — a line of light inlaid in it: `dashes` (the
 * vestibule: cyan, broken), `ticks` (the arena: only a small cold tick at each seam, so the Warden's violet is the only thing that shouts on that floor) or `double` (the way out: two lines, white-cyan).
 */
export function sanctumPaving(o: SanctumOptions & { cols: number; style: 'dashes' | 'ticks' | 'double' }): Surface {
  const { w, h, ppm: u, seed } = o;
  const base = stone({ w, h, ppm: u, seed, style: 'courses', courseM: [0.28, 0.3], blockM: [1.0, 2.0], jointM: 0.05, moss: 0.1, cracks: 0.45, stains: 0.9, energy: 0, stone: STONE, mossRamp: MOSS, tone: 0.28, toneSpread: 0.08 });
  const cut = surface(w, h);
  const c = cut.ctx;
  c.fillStyle = '#fff';
  const rng = new Rng(seed + 3);
  if (o.style === 'dashes') {
    let x = rng.range(0, u * 0.4);
    while (x < w) {
      const len = u * rng.range(0.5, 1.4);
      c.fillRect(x, h * 0.46, Math.min(len, w - x), Math.max(2, u * 0.03));
      x += len + u * rng.range(0.3, 0.8);
    }
  } else if (o.style === 'ticks') {
    for (let x = u * 0.5; x < w; x += u * rng.range(1.0, 2.0)) c.fillRect(x, h * 0.38, Math.max(2, u * 0.03), h * 0.26);
  } else {
    for (const yy of [0.34, 0.58]) {
      let x = rng.range(0, u * 0.3);
      while (x < w) {
        const len = u * rng.range(0.8, 2.2);
        c.fillRect(x, h * yy, Math.min(len, w - x), Math.max(1.6, u * 0.022));
        x += len + u * rng.range(0.2, 0.5);
      }
    }
  }
  return lit(inlay(base, cut, u, o.style === 'double' ? hex('#bff6ff') : CYAN, { depth: 1.2, strength: o.style === 'ticks' ? 0.5 : 0.7, halo: 0.05 }), true);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the ring of the arena

/**
 * The ring on the floor of the arena, seen from the side — flattened: three ellipses, ticks between the two outer ones and eight small diamonds on the outer one, in cold light. It says that this
 * is a place for a fight without using the Warden's violet, which is the colour of what hurts and has to be the only thing that shouts on that floor. For the additive layer.
 */
export function arenaRing(o: SanctumOptions): Surface {
  const { w, h, ppm: u } = o;
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.47;
  const ry = h * 0.42;
  // the pool of faint light inside it
  const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  pool.addColorStop(0, rgba(CYAN, 0.1));
  pool.addColorStop(1, rgba(CYAN, 0));
  ctx.save();
  ctx.translate(0, cy);
  ctx.scale(1, ry / rx);
  ctx.translate(0, -cy);
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h * (rx / ry));
  ctx.restore();
  ctx.lineCap = 'round';
  for (const [k, a, lw] of [[1, 0.7, 0.05], [0.8, 0.4, 0.035], [0.5, 0.55, 0.035]] as const) {
    ctx.strokeStyle = rgba(CYAN, a);
    ctx.lineWidth = Math.max(1.2, u * lw);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(CYAN, 0.45);
  ctx.lineWidth = Math.max(1, u * 0.03);
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rx * 0.82, cy + Math.sin(a) * ry * 0.82);
    ctx.lineTo(cx + Math.cos(a) * rx * 0.97, cy + Math.sin(a) * ry * 0.97);
    ctx.stroke();
  }
  ctx.fillStyle = rgba([0.8, 0.98, 1], 0.85);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const px = cx + Math.cos(a) * rx;
    const py = cy + Math.sin(a) * ry;
    ctx.beginPath();
    ctx.moveTo(px, py - ry * 0.16);
    ctx.lineTo(px + u * 0.12, py);
    ctx.lineTo(px, py + ry * 0.16);
    ctx.lineTo(px - u * 0.12, py);
    ctx.closePath();
    ctx.fill();
  }
  return s;
}
