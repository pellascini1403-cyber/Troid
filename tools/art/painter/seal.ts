import { blurred, surface, writePixels, type Surface } from './canvas';
import { hex, type Rgb } from './color';
import type { Draw } from './forms';
import { alphaOf } from './ground';
import { DAY, shade, type Layers } from './light';
import { MOSS, STONE, stone } from './masonry';
import { lit, rune } from './props';
import { Rng } from './rng';
import { SilhouetteLayer } from './silhouette';
import { blade } from './shapes';

/**
 * The Seal Chamber (R3): the ward of violet ink that holds the way shut, the card of the Spirit Bolt that opens it, the altar the card lies on, the carved walls and the portal of
 * stone the ward is set in, the paving of the ritual road that leads to it and the circles of light on its stones. Everything is original geometry — rings, nested diamonds, ticks and
 * strokes; never a letter of any alphabet — painted with the one light of the game: cold cyan for what is the hero's (the card, the road, the altar), violet for what is the ward's.
 */
export interface SealOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
}

const CYAN: Rgb = hex('#3ee8ff');
const VIOLET: Rgb = hex('#9a5cff');

const rgba = (c: Rgb, a: number): string => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

/** Cuts a white mask into the layers of a stone: the mask is lower than the stone around it, darker, and full of light. */
export function inlay(layers: Layers, mask: Surface, ppm: number, glow: Rgb, o: { depth?: number; halo?: number; strength?: number } = {}): Layers {
  const { w, h } = layers;
  const m = alphaOf(mask);
  const soft = alphaOf(blurred(mask, ppm * (o.halo ?? 0.12)));
  const em = layers.emissive ?? new Float32Array(w * h * 3);
  const depth = o.depth ?? 2.2;
  const strength = o.strength ?? 0.9;
  for (let i = 0; i < w * h; i++) {
    const a = m.d[i]!;
    const s = soft.d[i]!;
    layers.height.d[i] = layers.height.d[i]! - depth * a;
    for (let c = 0; c < 3; c++) {
      layers.albedo[i * 3 + c] = layers.albedo[i * 3 + c]! * (1 - 0.6 * a);
      em[i * 3 + c] = em[i * 3 + c]! + glow[c]! * (strength * a + 0.3 * strength * s);
    }
  }
  return { ...layers, emissive: em };
}

const slab = (w: number, h: number, ppm: number, seed: number, tone = 0.3): Layers =>
  stone({ w, h, ppm, seed, style: 'courses', courseM: [0.5, 1.0], blockM: [0.6, 1.9], jointM: 0.06, moss: 0.3, cracks: 0.35, stains: 0.8, energy: 0, stone: STONE, mossRamp: MOSS, tone, toneSpread: 0.08 });

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the sigil of the ward

/**
 * The sigil of the ward (the `seal` the Spirit Bolt breaks): two cells side by side, the sigil hanging (rings with ticks, four small diamonds, a diamond of violet ink with a pale slit for an
 * eye, a halo) and the same shape burning white — the flash of a blow that was turned away. Painted as LIGHT: it is drawn in the additive layer, in front of the door it holds.
 */
export function sealSigil(o: SealOptions): Surface {
  const { w, h, ppm } = o;
  const out = surface(w, h);
  const cell = w / 2;
  for (let state = 0; state < 2; state++) {
    const ctx = out.ctx;
    const cx = state * cell + cell / 2;
    const cy = h / 2;
    const flash = state === 1;
    ctx.save();
    ctx.translate(cx, cy);
    // the halo
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, ppm * 1.5);
    halo.addColorStop(0, rgba(VIOLET, flash ? 0.62 : 0.34));
    halo.addColorStop(0.5, rgba(VIOLET, flash ? 0.26 : 0.13));
    halo.addColorStop(1, rgba(VIOLET, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(-ppm * 1.55, -ppm * 1.55, ppm * 3.1, ppm * 3.1);
    // the ring and its ticks
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba([0.72, 0.55, 1], flash ? 0.95 : 0.55);
    ctx.lineWidth = ppm * 0.03;
    ctx.beginPath();
    ctx.arc(0, 0, ppm * 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = ppm * 0.022;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const long = k % 3 === 0;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * ppm * 0.95, Math.sin(a) * ppm * 0.95);
      ctx.lineTo(Math.cos(a) * ppm * (long ? 1.13 : 1.04), Math.sin(a) * ppm * (long ? 1.13 : 1.04));
      ctx.stroke();
    }
    // a second ring, broken in three places
    ctx.lineWidth = ppm * 0.02;
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2 + 0.25;
      ctx.beginPath();
      ctx.arc(0, 0, ppm * 0.74, a0, a0 + Math.PI * 2 * 0.26);
      ctx.stroke();
    }
    // four small diamonds on the ring
    ctx.fillStyle = rgba([0.84, 0.72, 1], flash ? 1 : 0.9);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      ctx.save();
      ctx.translate(Math.cos(a) * ppm * 0.95, Math.sin(a) * ppm * 0.95);
      ctx.beginPath();
      ctx.moveTo(0, -ppm * 0.085);
      ctx.lineTo(ppm * 0.055, 0);
      ctx.lineTo(0, ppm * 0.085);
      ctx.lineTo(-ppm * 0.055, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // the diamond of ink: the mark the hero has to hit
    const diamond = (hw: number, hh: number): void => {
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(0, hh);
      ctx.lineTo(-hw, 0);
      ctx.closePath();
    };
    diamond(ppm * 0.62, ppm * 0.84);
    ctx.fillStyle = flash ? 'rgba(255,255,255,0.96)' : rgba([0.4, 0.2, 0.82], 0.62);
    ctx.fill();
    ctx.lineWidth = ppm * 0.06;
    ctx.strokeStyle = rgba([0.7, 0.5, 1], 0.96);
    ctx.stroke();
    diamond(ppm * 0.34, ppm * 0.46);
    ctx.lineWidth = ppm * 0.03;
    ctx.strokeStyle = rgba([0.86, 0.76, 1], flash ? 1 : 0.85);
    ctx.stroke();
    // the pale slit that is its eye, with a glow
    const eye = ctx.createRadialGradient(0, 0, 0, 0, 0, ppm * 0.3);
    eye.addColorStop(0, 'rgba(255,255,255,0.95)');
    eye.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = eye;
    ctx.fillRect(-ppm * 0.3, -ppm * 0.3, ppm * 0.6, ppm * 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.beginPath();
    ctx.ellipse(0, 0, ppm * 0.07, ppm * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the card

/**
 * The card of the Spirit Bolt (the pickup that gives a card): a card of dark glass with a cyan edge and a white-hot bolt on it, a halo and a few motes — painted as light, for the additive
 * layer the floating things live in, so what is dark in it is not there.
 */
export function cardSpirit(o: SealOptions): Surface {
  const { w, h, ppm } = o;
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const cy = h * 0.56;
  const X = (v: number): number => cx + v * ppm;
  const Y = (v: number): number => cy + v * ppm;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, ppm * 0.72);
  halo.addColorStop(0, 'rgba(90,230,255,0.4)');
  halo.addColorStop(0.55, 'rgba(60,200,255,0.12)');
  halo.addColorStop(1, 'rgba(60,200,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  // the card
  const card = new Path2D();
  card.roundRect(X(-0.25), Y(-0.37), ppm * 0.5, ppm * 0.74, ppm * 0.05);
  const body = ctx.createLinearGradient(0, Y(-0.37), 0, Y(0.37));
  body.addColorStop(0, 'rgba(70,205,255,0.34)');
  body.addColorStop(1, 'rgba(20,110,210,0.5)');
  ctx.fillStyle = body;
  ctx.fill(card);
  ctx.lineWidth = Math.max(1.4, ppm * 0.03);
  ctx.strokeStyle = 'rgba(150,245,255,0.96)';
  ctx.stroke(card);
  const inner = new Path2D();
  inner.roundRect(X(-0.205), Y(-0.325), ppm * 0.41, ppm * 0.65, ppm * 0.03);
  ctx.lineWidth = Math.max(1, ppm * 0.012);
  ctx.strokeStyle = 'rgba(150,245,255,0.36)';
  ctx.stroke(inner);
  // the bolt
  ctx.save();
  ctx.shadowColor = 'rgba(80,235,255,1)';
  ctx.shadowBlur = ppm * 0.1;
  ctx.fillStyle = 'rgba(245,255,255,0.98)';
  ctx.beginPath();
  ctx.moveTo(X(0.03), Y(-0.27));
  ctx.lineTo(X(-0.11), Y(0.03));
  ctx.lineTo(X(-0.015), Y(0.03));
  ctx.lineTo(X(-0.045), Y(0.27));
  ctx.lineTo(X(0.11), Y(-0.06));
  ctx.lineTo(X(0.015), Y(-0.06));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // the four ticks at its corners and the dot over it
  ctx.strokeStyle = 'rgba(190,250,255,0.9)';
  ctx.lineWidth = Math.max(1, ppm * 0.014);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    ctx.beginPath();
    ctx.moveTo(X(sx * 0.17), Y(sy * 0.3));
    ctx.lineTo(X(sx * 0.17), Y(sy * 0.255));
    ctx.moveTo(X(sx * 0.17), Y(sy * 0.3));
    ctx.lineTo(X(sx * 0.125), Y(sy * 0.3));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(220,252,255,0.95)';
  for (const [mx, my, mr] of [[0.02, -0.52, 1.6], [0.16, -0.6, 1.1], [-0.12, -0.66, 1.2]] as const) {
    ctx.beginPath();
    ctx.arc(X(mx), Y(my), Math.max(0.8, mr * (ppm / 96)), 0, Math.PI * 2);
    ctx.fill();
  }
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the altar

/** The altar the card lies on: two steps, a squat pedestal with three runes burning cyan on its face, a slab with a shallow dish that glows, and a moss of old roots at its foot. */
export function pedestal(o: SealOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const layer = new SilhouetteLayer(w, h, seed, false);
  const cx = w / 2;
  const foot = h - 2;
  const steps: Draw = (ctx) => {
    ctx.fillRect(cx - ppm * 0.78, foot - ppm * 0.17, ppm * 1.56, ppm * 0.17);
    ctx.fillRect(cx - ppm * 0.6, foot - ppm * 0.33, ppm * 1.2, ppm * 0.16);
  };
  layer.add(steps, { x0: cx - ppm * 0.8, x1: cx + ppm * 0.8, y0: foot - ppm * 0.35, y1: foot }, { round: ppm * 0.08, tone: 0.5, spread: 0.06, moss: 0.5 });
  const shaft: Draw = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(cx - ppm * 0.4, foot - ppm * 0.33);
    ctx.lineTo(cx - ppm * 0.34, foot - ppm * 0.86);
    ctx.lineTo(cx + ppm * 0.34, foot - ppm * 0.86);
    ctx.lineTo(cx + ppm * 0.4, foot - ppm * 0.33);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - ppm * 0.5, foot - ppm * 0.98, ppm * 1, ppm * 0.14);
  };
  layer.add(shaft, { x0: cx - ppm * 0.52, x1: cx + ppm * 0.52, y0: foot - ppm * 1.0, y1: foot - ppm * 0.33 }, { round: ppm * 0.16, tone: 0.55, spread: 0.06, moss: 0.3, fade: [0.05, -0.04] });
  // three runes on its face, a dish on its top
  const runes: Draw = (ctx) => {
    const r2 = new Rng(seed + 5);
    for (const [dx, dy] of [[-0.18, 0.62], [0.02, 0.52], [0.2, 0.62]] as const) rune(ctx, cx + dx * ppm, foot - dy * ppm, ppm * 0.17, r2);
  };
  layer.glow(runes, { x0: cx - ppm * 0.4, x1: cx + ppm * 0.4, y0: foot - ppm * 0.86, y1: foot - ppm * 0.4 }, CYAN, 1, ppm * 0.03);
  const dish: Draw = (ctx) => {
    ctx.beginPath();
    ctx.ellipse(cx, foot - ppm * 1.0, ppm * 0.34, ppm * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  layer.glow(dish, { x0: cx - ppm * 0.5, x1: cx + ppm * 0.5, y0: foot - ppm * 1.2, y1: foot - ppm * 0.85 }, CYAN, 0.9, ppm * 0.12);
  // the grass of ruins at the foot
  const tufts: Draw = (ctx) => {
    for (let i = 0; i < 9; i++) blade(ctx, cx + rng.range(-0.8, 0.8) * ppm, foot, ppm * rng.range(0.1, 0.24), rng.range(-6, 6), ppm * 0.05);
  };
  layer.add(tufts, { x0: cx - ppm * 0.9, x1: cx + ppm * 0.9, y0: foot - ppm * 0.3, y1: foot }, { round: 2, tone: 0.2, spread: 0.05, moss: 0.8 });
  const s = surface(w, h);
  writePixels(s, shade(layer.layers(STONE, MOSS), DAY, false));
  return s;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the walls

/**
 * A carved slab of the chamber's wall: a tall niche with its head rounded, concentric rings cut into it with rays between them, and rows of runes below — all of it cut INTO the stone and
 * full of light, cyan for the rings and a little violet in the centre, where the ward is named.
 */
export function relief(o: SealOptions & { variant?: number }): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const base = slab(w, h, ppm, seed);
  const cut = surface(w, h);
  const c = cut.ctx;
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.lineCap = 'round';
  const cx = w / 2;
  const ringY = h * 0.38;
  // the frame of the niche: a thin line along its outline
  c.lineWidth = Math.max(2, ppm * 0.05);
  c.beginPath();
  c.moveTo(cx - w * 0.36, h * 0.93);
  c.lineTo(cx - w * 0.36, ringY);
  c.arc(cx, ringY, w * 0.36, Math.PI, 0);
  c.lineTo(cx + w * 0.36, h * 0.93);
  c.stroke();
  // the rings and their rays
  for (const [k, lw] of [[0.3, 0.05], [0.22, 0.04], [0.14, 0.04]] as const) {
    c.lineWidth = Math.max(2, ppm * lw);
    c.beginPath();
    c.arc(cx, ringY, w * k, 0, Math.PI * 2);
    c.stroke();
  }
  c.lineWidth = Math.max(1.6, ppm * 0.03);
  const rays = o.variant === 1 ? 8 : 12;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + 0.2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * w * 0.15, ringY + Math.sin(a) * w * 0.15);
    c.lineTo(cx + Math.cos(a) * w * 0.29, ringY + Math.sin(a) * w * 0.29);
    c.stroke();
  }
  // rows of runes below
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) rune(c, cx + (col - 1) * w * 0.2, h * (0.66 + row * 0.08), ppm * 0.26, rng);
  }
  const grooves = inlay(base, cut, ppm, CYAN, { depth: 2.4, strength: 0.75, halo: 0.1 });
  // the heart of the ring is the ward's: a small diamond of violet light
  const heart = surface(w, h);
  heart.ctx.fillStyle = '#fff';
  heart.ctx.beginPath();
  heart.ctx.moveTo(cx, ringY - ppm * 0.17);
  heart.ctx.lineTo(cx + ppm * 0.11, ringY);
  heart.ctx.lineTo(cx, ringY + ppm * 0.17);
  heart.ctx.lineTo(cx - ppm * 0.11, ringY);
  heart.ctx.closePath();
  heart.ctx.fill();
  return lit(inlay(grooves, heart, ppm, VIOLET, { depth: 2.6, strength: 1.1, halo: 0.14 }), false);
}

/** One flank of the portal the ward is set in: a slab of stone with a channel of runes down it, cyan, that ends in violet where it meets the door. */
export function pilaster(o: SealOptions): Surface {
  const { w, h, ppm, seed } = o;
  const base = slab(w, h, ppm, seed, 0.32);
  const cut = surface(w, h);
  const c = cut.ctx;
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  const rng = new Rng(seed + 7);
  const cx = w / 2;
  c.lineWidth = Math.max(2, ppm * 0.05);
  c.beginPath();
  c.moveTo(cx - w * 0.28, h * 0.02);
  c.lineTo(cx - w * 0.28, h * 0.98);
  c.moveTo(cx + w * 0.28, h * 0.02);
  c.lineTo(cx + w * 0.28, h * 0.98);
  c.stroke();
  const rungs = Math.round(h / (ppm * 0.95));
  for (let i = 0; i < rungs; i++) rune(c, cx, h * ((i + 0.5) / rungs), ppm * 0.25, rng);
  return lit(inlay(base, cut, ppm, CYAN, { depth: 2.2, strength: 0.85, halo: 0.1 }), false);
}

/** The lintel of the portal: a long slab with a ring cut into it over the door and a line of ticks either side of it. */
export function lintel(o: SealOptions): Surface {
  const { w, h, ppm, seed } = o;
  const base = slab(w, h, ppm, seed, 0.32);
  const cut = surface(w, h);
  const c = cut.ctx;
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.lineWidth = Math.max(2, ppm * 0.05);
  const cx = w / 2;
  const r = Math.min(h * 0.34, ppm * 0.5);
  c.beginPath();
  c.arc(cx, h / 2, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = Math.max(1.6, ppm * 0.03);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r * 1.2, h / 2 + Math.sin(a) * r * 1.2);
    c.lineTo(cx + Math.cos(a) * r * 1.5, h / 2 + Math.sin(a) * r * 1.5);
    c.stroke();
  }
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < 9; k++) {
      c.beginPath();
      c.moveTo(cx + side * (r * 2.2 + k * ppm * 0.36), h * 0.38);
      c.lineTo(cx + side * (r * 2.2 + k * ppm * 0.36), h * 0.62);
      c.stroke();
    }
  }
  const grooves = inlay(base, cut, ppm, CYAN, { depth: 2.2, strength: 0.85, halo: 0.1 });
  const heart = surface(w, h);
  heart.ctx.fillStyle = '#fff';
  heart.ctx.beginPath();
  heart.ctx.arc(cx, h / 2, ppm * 0.09, 0, Math.PI * 2);
  heart.ctx.fill();
  return lit(inlay(grooves, heart, ppm, VIOLET, { depth: 2.4, strength: 1.1, halo: 0.14 }), false);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the road

/** The ritual road: a strip of worn paving, periodic along its length, with a thin line of light inlaid down its middle. It lies over the ground and the grass of the ground. */
export function paving(o: SealOptions & { cols: number }): Surface {
  const { w, h, ppm, seed } = o;
  const base = stone({ w, h, ppm, seed, style: 'courses', courseM: [0.28, 0.3], blockM: [0.8, 1.6], jointM: 0.045, moss: 0.4, cracks: 0.5, stains: 0.9, energy: 0, stone: STONE, mossRamp: MOSS, tone: 0.34, toneSpread: 0.1 });
  const cut = surface(w, h);
  const c = cut.ctx;
  c.fillStyle = '#fff';
  const rng = new Rng(seed + 3);
  // the inlaid line is broken into dashes of different lengths, wrapping at the ends
  let x = rng.range(0, ppm * 0.4);
  while (x < w) {
    const len = ppm * rng.range(0.5, 1.4);
    c.fillRect(x, h * 0.46, Math.min(len, w - x), Math.max(2, ppm * 0.03));
    x += len + ppm * rng.range(0.3, 0.8);
  }
  return lit(inlay(base, cut, ppm, CYAN, { depth: 1.2, strength: 0.7, halo: 0.05 }), true);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------- the circles of light

/** A ring of light on the stone, seen from the side — flattened — with ticks and a glyph at its middle: where the hero should stand. For the additive layer. */
export function runeCircle(o: SealOptions & { tint?: Rgb }): Surface {
  const { w, h, ppm } = o;
  const tint = o.tint ?? CYAN;
  const s = surface(w, h);
  const ctx = s.ctx;
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.46;
  const ry = h * 0.4;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  glow.addColorStop(0, rgba(tint, 0.16));
  glow.addColorStop(1, rgba(tint, 0));
  ctx.save();
  ctx.translate(0, cy);
  ctx.scale(1, ry / rx);
  ctx.translate(0, -cy);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h * (rx / ry));
  ctx.restore();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(tint, 0.85);
  ctx.lineWidth = Math.max(1.4, ppm * 0.05);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, ppm * 0.03);
  ctx.strokeStyle = rgba(tint, 0.55);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    ctx.lineTo(cx + Math.cos(a) * rx * 1.08, cy + Math.sin(a) * ry * 1.08);
    ctx.stroke();
  }
  // the glyph at the middle: a nested diamond
  ctx.strokeStyle = rgba([0.9, 1, 1], 0.85);
  ctx.lineWidth = Math.max(1, ppm * 0.035);
  for (const k of [1, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * 0.62 * k);
    ctx.lineTo(cx + rx * 0.2 * k, cy);
    ctx.lineTo(cx, cy + ry * 0.62 * k);
    ctx.lineTo(cx - rx * 0.2 * k, cy);
    ctx.closePath();
    ctx.stroke();
  }
  return s;
}

/** A stretch of the line of light that runs along the ritual road: dashes, and every so often a ring with a dot — it says where to go before anyone says anything. For the additive layer. */
export function runePath(o: SealOptions): Surface {
  const { w, h, ppm, seed } = o;
  const rng = new Rng(seed);
  const s = surface(w, h);
  const ctx = s.ctx;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(CYAN, 0.7);
  ctx.fillStyle = rgba(CYAN, 0.8);
  ctx.lineWidth = Math.max(1.4, h * 0.2);
  let x = h;
  while (x < w - h) {
    const len = ppm * rng.range(0.4, 1.0);
    ctx.beginPath();
    ctx.moveTo(x, h / 2);
    ctx.lineTo(Math.min(w - h, x + len), h / 2);
    ctx.stroke();
    x += len + ppm * rng.range(0.25, 0.5);
    if (rng.chance(0.3) && x < w - h * 2) {
      ctx.beginPath();
      ctx.arc(x + h * 0.5, h / 2, h * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + h * 0.5, h / 2, h * 0.09, 0, Math.PI * 2);
      ctx.fill();
      x += h * 1.4;
    }
  }
  // the ends fade out
  const fade = ctx.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.14, 'rgba(0,0,0,1)');
  fade.addColorStop(0.86, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  return s;
}
