import { surface, readPixels, writePixels, type Surface } from './canvas';
import { clamp01, css, hex, ramp, smoothstep, type Rgb } from './color';
import { crown, trunk, vine } from './forms';
import { BACK, finish, gradient, mist } from './backdrop';
import { grade, shade, type Look } from './light';
import * as M from './motifs';
import { Rng } from './rng';
import { SilhouetteLayer } from './silhouette';
import { wrapX } from './shapes';

/**
 * THE BACKDROPS OF THE ZONES (docs/PROMPT23-LOG.md §5): the three seamless strips of each zone past the Ruins, painted the way the Ruins' own are (`backdrop.ts`) — a far picture with a sky, a light, haze and skylines;
 * a middle and a near strip of lit silhouettes on a transparent ground, in the mist — but each one made of what its zone is made of, and in the hue that zone's mood already names (`content/atmosphere.ts`): the green-black
 * of the roots, the teal of the mire, the cold blue of a lamp in a mine, the bronze of old metal in the wind, the red-black of a furnace gone cold, the violet-black of the heart. What does not change is the language:
 * dark shapes lit from above and ahead, a lighter haze behind the walk so the hero's silhouette reads, and the farther, the paler.
 */
export type ZoneId = 'roots' | 'mire' | 'mines' | 'spire' | 'foundry' | 'heart';
export const ZONE_IDS: readonly ZoneId[] = ['roots', 'mire', 'mines', 'spire', 'foundry', 'heart'];

export interface ZoneStripOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
  zone: ZoneId;
}

type Light = { x: number; y: number; r: number; stops: ReadonlyArray<readonly [number, string]> };
type Skyline = { base: number; amp: number; colour: string; mist: Rgb; mistStrength: number; gap: readonly [number, number]; motif: (rng: Rng, x: number, baseY: number, hgt: number, ppm: number, w: number) => M.Form[] };

interface FarTheme {
  sky: ReadonlyArray<readonly [number, string]>;
  lights: readonly Light[];
  /** Soft diagonal beams through the picture: how many, how strong and their colour. */
  beams: { count: number; peak: number; rgb: string } | null;
  /** What stands so far that it is a paler shade of the haze: drawn first, over the sky. */
  giants: (ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, ppm: number) => void;
  bands: readonly Skyline[];
  /** What hangs from the top or floats in the air, after the skylines. */
  extra?: (ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, ppm: number) => void;
  haze: { colour: Rgb; strength: number };
  /** Motes of light in the dark. */
  motes: string;
}

interface Build {
  layer: SilhouetteLayer;
  rng: Rng;
  w: number;
  h: number;
  ppm: number;
  /** Where the things that stand have their foot. */
  foot: number;
}

interface NearMidTheme {
  look: Look;
  stone: (v: number) => Rgb;
  accent: (v: number) => Rgb;
  fog: Rgb;
  fogAmount: number;
  /** The colour the foot of everything is lost in. */
  foot: string;
  footAmount: number;
  mist: Rgb;
  build: (b: Build) => void;
}

/** n positions along a periodic strip, evenly spread with some wander. */
const spread = (rng: Rng, w: number, n: number, jitter = 0.7): number[] => Array.from({ length: n }, (_, i) => ((i + 0.5 + (rng.next() - 0.5) * jitter) / n) * w);

const rgbOf = (c: Rgb, k = 1): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** A soft dot of light (a lamp far away, a spore): a radial gradient, periodic. */
function glowDot(ctx: CanvasRenderingContext2D, w: number, x: number, y: number, r: number, rgb: string, a: number): void {
  wrapX(w, (dx) => {
    const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.25, `rgba(${rgb},${a * 0.45})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
  });
}

/** Soft diagonal beams of light, periodic in x (the Ruins' own are cyan; every zone has its colour). */
function beamsOf(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, count: number, peak: number, rgb: string): void {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, w);
    const wid = rng.range(0.025, 0.07) * w;
    const skew = rng.range(0.12, 0.3) * h;
    const reach = rng.range(0.7, 1);
    for (const dx of [-w, 0, w]) {
      const g = ctx.createLinearGradient(0, 0, 0, h * reach);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(0.2, `rgba(${rgb},${peak})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + dx, 0);
      ctx.lineTo(x + wid + dx, 0);
      ctx.lineTo(x + wid * 1.8 + skew + dx, h * reach);
      ctx.lineTo(x + skew + dx, h * reach);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** A soft cloud: a few overlapping ellipses of one colour, wider than tall, periodic. */
function cloud(ctx: CanvasRenderingContext2D, rng: Rng, w: number, x: number, y: number, len: number, thick: number, rgba: string): void {
  ctx.fillStyle = rgba;
  const n = Math.max(3, Math.round(len / (thick * 1.6)));
  const parts = Array.from({ length: n }, (_, i) => ({ x: x + (i / (n - 1) - 0.5) * len, y: y + rng.gauss() * thick * 0.18, rx: thick * rng.range(1.4, 2.8), ry: thick * rng.range(0.35, 0.6) }));
  wrapX(w, (dx) => {
    for (const p of parts) {
      ctx.beginPath();
      ctx.ellipse(p.x + dx, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Smoke rising from a point: soft grey-brown puffs that widen and thin as they go up. */
function smoke(ctx: CanvasRenderingContext2D, rng: Rng, w: number, x: number, y: number, rise: number, r0: number, rgb: string, a: number): void {
  const n = Math.max(3, Math.round(rise / (r0 * 1.4)));
  const puffs = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return { x: x + Math.sin(t * 3 + x * 0.01) * r0 * 1.2 + rng.gauss() * r0 * 0.3, y: y - rise * t, r: r0 * (1 + t * 1.8), a: a * (1 - t * 0.8) };
  });
  wrapX(w, (dx) => {
    for (const p of puffs) {
      const g = ctx.createRadialGradient(p.x + dx, p.y, 0, p.x + dx, p.y, p.r);
      g.addColorStop(0, `rgba(${rgb},${p.a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x + dx - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
  });
}

// -------------------------------------------------------------------------------------------------------------------------------- the far strips

const colossal = (ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, count: number, fill: string, r: readonly [number, number], flare = false): void => {
  ctx.fillStyle = fill;
  for (let i = 0; i < count; i++) {
    const x = ((i + rng.range(0.2, 0.8)) / count) * w;
    const rr = rng.range(r[0], r[1]);
    wrapX(w, (dx) => {
      ctx.fillRect(x + dx - rr, 0, rr * 2, h * 0.92);
      if (flare) {
        ctx.beginPath();
        ctx.moveTo(x + dx - rr, h * 0.7);
        ctx.quadraticCurveTo(x + dx - rr * 1.2, h * 0.88, x + dx - rr * 2.6, h);
        ctx.lineTo(x + dx + rr * 2.6, h);
        ctx.quadraticCurveTo(x + dx + rr * 1.2, h * 0.88, x + dx + rr, h * 0.7);
        ctx.closePath();
        ctx.fill();
      }
    });
  }
};

/** The cave roof: a mass hanging from the top with a toothed lower edge, and stalactites from it. */
const roof = (ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, ppm: number, fill: string, depth: number, teeth: number): void => {
  ctx.fillStyle = fill;
  const n = Math.round(w / (ppm * 9));
  for (let i = 0; i < n; i++) {
    const f = M.ceilingMass(rng, ((i + 0.5) / n) * w, 0, (w / n) * 1.25, h * depth);
    wrapX(w, (dx) => f.draw(ctx, dx));
  }
  for (let i = 0; i < teeth; i++) {
    const f = M.stalactite(rng, rng.range(0, w), h * depth * rng.range(0.6, 1), h * rng.range(0.08, 0.26), ppm * rng.range(0.5, 1.4));
    wrapX(w, (dx) => f.draw(ctx, dx));
  }
};

const FAR: Readonly<Record<ZoneId, FarTheme>> = {
  roots: {
    sky: [[0, '#02070a'], [0.4, '#071d19'], [0.75, '#0f3a2d'], [1, '#17503b']],
    lights: [{ x: 0.55, y: 0.22, r: 0.6, stops: [[0, 'rgba(150,255,205,0.32)'], [0.3, 'rgba(90,210,160,0.14)'], [1, 'rgba(60,160,120,0)']] }],
    beams: { count: 5, peak: 0.08, rgb: '150,255,205' },
    giants: (ctx, rng, w, h, ppm) => colossal(ctx, rng, w, h, 5, 'rgba(20,70,52,0.5)', [ppm * 1.6, ppm * 2.8], true),
    bands: [
      { base: 0.62, amp: 0.22, colour: 'rgba(22,66,50,0.92)', mist: [0.2, 0.5, 0.38], mistStrength: 0.5, gap: [2, 5], motif: (rng, x, b, hgt, ppm) => [M.rockMass(rng, x, b, ppm * rng.range(3, 7), hgt * 0.5), ...(rng.chance(0.5) ? [M.drape(rng, x, 0, hgt * 2.2, ppm * 1.4)] : [])] },
      { base: 0.74, amp: 0.2, colour: 'rgba(13,46,35,0.96)', mist: [0.2, 0.5, 0.38], mistStrength: 0.45, gap: [2.4, 5.5], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.55) ? [M.rockMass(rng, x, b, ppm * rng.range(2, 5), hgt * 0.55)] : [M.drape(rng, x, 0, hgt * 2.6, ppm * rng.range(1.2, 2))]) },
      { base: 0.86, amp: 0.15, colour: 'rgba(6,26,20,1)', mist: [0.2, 0.5, 0.38], mistStrength: 0.4, gap: [2.8, 6], motif: (rng, x, b, hgt, ppm) => [M.rockMass(rng, x, b, ppm * rng.range(2.5, 6), hgt * 0.5)] },
    ],
    haze: { colour: [0.2, 0.52, 0.4], strength: 0.55 },
    motes: 'rgba(190,255,225,0.55)',
  },
  mire: {
    sky: [[0, '#02090b'], [0.4, '#072128'], [0.72, '#0d3d43'], [1, '#17584f']],
    lights: [
      { x: 0.4, y: 0.6, r: 0.6, stops: [[0, 'rgba(150,255,225,0.3)'], [0.3, 'rgba(90,210,190,0.14)'], [1, 'rgba(60,160,150,0)']] },
      { x: 0.85, y: 0.5, r: 0.4, stops: [[0, 'rgba(120,240,200,0.18)'], [1, 'rgba(60,160,150,0)']] },
    ],
    beams: { count: 3, peak: 0.05, rgb: '150,255,225' },
    giants: (ctx, rng, w, h, ppm) => colossal(ctx, rng, w, h, 6, 'rgba(18,64,66,0.45)', [ppm * 0.9, ppm * 1.8]),
    bands: [
      { base: 0.64, amp: 0.2, colour: 'rgba(20,64,66,0.92)', mist: [0.2, 0.5, 0.46], mistStrength: 0.6, gap: [1.4, 3.4], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.6) ? [M.reeds(rng, x, b, rng.int(6, 12), hgt * 0.7, ppm * 0.5)] : [M.mushroom(rng, x, b, hgt * 0.6, ppm * rng.range(0.8, 1.6))]) },
      { base: 0.76, amp: 0.22, colour: 'rgba(11,42,44,0.96)', mist: [0.2, 0.5, 0.46], mistStrength: 0.55, gap: [1.6, 4], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.45) ? [M.rockMass(rng, x, b, ppm * rng.range(3, 6), hgt * 0.3)] : [(() => { const t = trunk(rng, x, b, b - hgt, ppm * rng.range(0.14, 0.28), ppm * rng.range(0.08, 0.14)); return { draw: t.draw, box: { x0: t.x0, x1: t.x1, y0: b - hgt, y1: b + 4 } }; })()]) },
      { base: 0.87, amp: 0.15, colour: 'rgba(5,24,26,1)', mist: [0.2, 0.5, 0.46], mistStrength: 0.45, gap: [1.2, 3], motif: (rng, x, b, hgt, ppm) => [M.reeds(rng, x, b, rng.int(8, 16), hgt * 0.8, ppm * 0.6)] },
    ],
    extra: (ctx, rng, w, h, ppm) => {
      // the glow of the mire: spores and lamps far away, a halo each
      for (let i = 0; i < Math.round(w / (ppm * 2.2)); i++) glowDot(ctx, w, rng.range(0, w), rng.range(h * 0.38, h * 0.82), ppm * rng.range(0.3, 0.9), '150,255,225', rng.range(0.25, 0.5));
    },
    haze: { colour: [0.2, 0.55, 0.5], strength: 0.62 },
    motes: 'rgba(190,255,235,0.6)',
  },
  mines: {
    sky: [[0, '#02050c'], [0.4, '#071526'], [0.72, '#12305a'], [1, '#183b6a']],
    lights: [
      { x: 0.62, y: 0.42, r: 0.55, stops: [[0, 'rgba(130,190,255,0.4)'], [0.3, 'rgba(80,140,230,0.16)'], [1, 'rgba(50,100,200,0)']] },
      { x: 0.15, y: 0.7, r: 0.35, stops: [[0, 'rgba(110,170,255,0.18)'], [1, 'rgba(50,100,200,0)']] },
    ],
    beams: { count: 3, peak: 0.07, rgb: '140,190,255' },
    giants: (ctx, rng, w, h, ppm) => colossal(ctx, rng, w, h, 4, 'rgba(24,52,100,0.5)', [ppm * 1.8, ppm * 3], true),
    bands: [
      { base: 0.64, amp: 0.22, colour: 'rgba(26,56,104,0.92)', mist: [0.22, 0.4, 0.66], mistStrength: 0.5, gap: [2, 5], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.7) ? [M.rockMass(rng, x, b, ppm * rng.range(3, 7), hgt)] : [M.crystalCluster(rng, x, b, hgt * 0.7, ppm * rng.range(1.6, 3))]) },
      { base: 0.75, amp: 0.2, colour: 'rgba(15,36,76,0.96)', mist: [0.22, 0.4, 0.66], mistStrength: 0.45, gap: [2, 5], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? [M.rockMass(rng, x, b, ppm * rng.range(3, 6), hgt * 0.8)] : rng.chance(0.5) ? [M.timberFrame(rng, x, b, ppm * rng.range(3.5, 5.5), hgt * 0.8, ppm * 0.22, rng.chance(0.3))] : [M.crystalCluster(rng, x, b, hgt * 0.7, ppm * rng.range(1.6, 3))]) },
      { base: 0.86, amp: 0.14, colour: 'rgba(7,20,46,1)', mist: [0.22, 0.4, 0.66], mistStrength: 0.4, gap: [2.4, 5], motif: (rng, x, b, hgt, ppm) => [M.rockMass(rng, x, b, ppm * rng.range(3, 6), hgt * 0.7)] },
    ],
    extra: (ctx, rng, w, h, ppm) => roof(ctx, rng, w, h, ppm, 'rgba(5,14,32,0.97)', 0.16, 16),
    haze: { colour: [0.22, 0.4, 0.68], strength: 0.55 },
    motes: 'rgba(190,225,255,0.55)',
  },
  spire: {
    sky: [[0, '#0b0910'], [0.3, '#241a22'], [0.58, '#5a3a30'], [0.82, '#9a6a48'], [1, '#b98557']],
    lights: [{ x: 0.35, y: 0.74, r: 0.7, stops: [[0, 'rgba(255,205,140,0.42)'], [0.3, 'rgba(230,150,90,0.18)'], [1, 'rgba(200,110,70,0)']] }],
    beams: { count: 3, peak: 0.05, rgb: '255,210,150' },
    giants: (ctx, rng, w, h, ppm) => {
      // high clouds and the far wall of the sky: long soft streaks
      for (let i = 0; i < 7; i++) cloud(ctx, rng, w, rng.range(0, w), h * rng.range(0.18, 0.62), ppm * rng.range(10, 24), ppm * rng.range(0.4, 0.9), `rgba(${220 + rng.int(0, 30)},${170 + rng.int(0, 30)},${140},${rng.range(0.1, 0.2)})`);
    },
    bands: [
      { base: 0.7, amp: 0.34, colour: 'rgba(104,72,62,0.9)', mist: [0.72, 0.5, 0.36], mistStrength: 0.5, gap: [3, 8], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.55) ? [M.tower(rng, x, b, hgt, ppm * rng.range(1.4, 2.4))] : rng.chance(0.5) ? [M.pinnacle(rng, x, b, hgt * 0.9, ppm * rng.range(0.7, 1.2))] : [M.rockMass(rng, x, b, ppm * rng.range(4, 9), hgt * 0.5)]) },
      { base: 0.8, amp: 0.3, colour: 'rgba(66,44,40,0.95)', mist: [0.72, 0.5, 0.36], mistStrength: 0.45, gap: [3, 8], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? [M.tower(rng, x, b, hgt, ppm * rng.range(1.6, 2.8))] : [M.buttress(rng, x - ppm * 2, b, x + ppm * rng.range(2.5, 4.5), b - hgt * 0.7, ppm * 0.42), M.pinnacle(rng, x - ppm * 2, b - hgt * 0.65, hgt * 0.35, ppm * 0.8)]) },
      { base: 0.9, amp: 0.22, colour: 'rgba(30,20,20,1)', mist: [0.72, 0.5, 0.36], mistStrength: 0.4, gap: [3.5, 9], motif: (rng, x, b, hgt, ppm) => [M.tower(rng, x, b, hgt, ppm * rng.range(2, 3.4))] },
    ],
    haze: { colour: [0.66, 0.46, 0.34], strength: 0.52 },
    motes: 'rgba(255,235,200,0.55)',
  },
  foundry: {
    sky: [[0, '#080302'], [0.35, '#170a06'], [0.7, '#331409'], [1, '#4d1f10']],
    lights: [
      { x: 0.3, y: 0.8, r: 0.6, stops: [[0, 'rgba(255,150,70,0.34)'], [0.3, 'rgba(230,100,40,0.15)'], [1, 'rgba(200,70,30,0)']] },
      { x: 0.78, y: 0.72, r: 0.45, stops: [[0, 'rgba(255,120,50,0.26)'], [1, 'rgba(200,70,30,0)']] },
    ],
    beams: { count: 3, peak: 0.05, rgb: '255,160,90' },
    giants: (ctx, rng, w, h, ppm) => {
      colossal(ctx, rng, w, h, 4, 'rgba(70,30,18,0.5)', [ppm * 1.2, ppm * 2.2]);
      for (let i = 0; i < 4; i++) smoke(ctx, rng, w, rng.range(0, w), h * rng.range(0.25, 0.5), h * 0.35, ppm * 1.8, '90,50,36', 0.18);
    },
    bands: [
      { base: 0.66, amp: 0.3, colour: 'rgba(76,36,22,0.92)', mist: [0.5, 0.24, 0.14], mistStrength: 0.5, gap: [2.5, 6], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? [M.chimney(rng, x, b, hgt, ppm * rng.range(1.4, 2.2), ppm * rng.range(0.9, 1.4))] : rng.chance(0.5) ? [M.tank(rng, x, b, ppm * rng.range(2.4, 4), hgt * 0.5, ppm * 0.8)] : [M.gantry(rng, x, x + ppm * rng.range(5, 10), b - hgt * 0.6, ppm * 1.4, ppm * 0.2, true, b)]) },
      { base: 0.78, amp: 0.26, colour: 'rgba(44,20,12,0.96)', mist: [0.5, 0.24, 0.14], mistStrength: 0.45, gap: [2.5, 6], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.45) ? [M.chimney(rng, x, b, hgt, ppm * rng.range(1.6, 2.4), ppm * rng.range(1, 1.5))] : rng.chance(0.5) ? [M.tank(rng, x, b, ppm * rng.range(2.6, 4.4), hgt * 0.55, ppm * 0.6)] : [M.pipe(rng, x, b - hgt * 0.8, b, ppm * 0.28, rng.chance(0.5) ? 1 : -1, ppm * rng.range(3, 7))]) },
      { base: 0.89, amp: 0.2, colour: 'rgba(18,8,5,1)', mist: [0.5, 0.24, 0.14], mistStrength: 0.4, gap: [2.5, 6], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? [M.tank(rng, x, b, ppm * rng.range(2.4, 4), hgt * 0.5, 0)] : [M.chimney(rng, x, b, hgt, ppm * rng.range(1.8, 2.6), ppm * rng.range(1.2, 1.7))]) },
    ],
    extra: (ctx, rng, w, h, ppm) => {
      // the furnaces still warm: a few small mouths of dull fire low in the dark, and embers that rose from them
      for (let i = 0; i < 7; i++) glowDot(ctx, w, rng.range(0, w), h * rng.range(0.7, 0.9), ppm * rng.range(0.5, 1.2), '255,140,60', rng.range(0.3, 0.55));
    },
    haze: { colour: [0.5, 0.24, 0.14], strength: 0.55 },
    motes: 'rgba(255,200,150,0.5)',
  },
  heart: {
    sky: [[0, '#04020a'], [0.4, '#10061f'], [0.7, '#26104a'], [1, '#3b1a68']],
    lights: [
      { x: 0.5, y: 0.5, r: 0.62, stops: [[0, 'rgba(200,130,255,0.36)'], [0.3, 'rgba(150,90,230,0.16)'], [1, 'rgba(100,60,200,0)']] },
      { x: 0.12, y: 0.78, r: 0.35, stops: [[0, 'rgba(180,110,255,0.2)'], [1, 'rgba(100,60,200,0)']] },
    ],
    beams: { count: 3, peak: 0.06, rgb: '190,140,255' },
    giants: (ctx, rng, w, h, ppm) => {
      ctx.fillStyle = 'rgba(60,30,110,0.45)';
      for (let i = 0; i < 4; i++) {
        const f = M.rib(rng, ((i + rng.range(0.3, 0.7)) / 4) * w, h, ppm * rng.range(5, 9), h * rng.range(0.7, 0.95), ppm * rng.range(1.2, 2));
        wrapX(w, (dx) => f.draw(ctx, dx));
      }
    },
    bands: [
      { base: 0.66, amp: 0.26, colour: 'rgba(58,28,104,0.9)', mist: [0.4, 0.22, 0.66], mistStrength: 0.5, gap: [2, 5], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? [M.crystalCluster(rng, x, b, hgt, ppm * rng.range(1.6, 3))] : [M.rib(rng, x, b, ppm * rng.range(2, 4), hgt * 0.9, ppm * 0.5, rng.gauss() * 0.15)]) },
      { base: 0.78, amp: 0.22, colour: 'rgba(32,14,64,0.95)', mist: [0.4, 0.22, 0.66], mistStrength: 0.45, gap: [2, 5], motif: (rng, x, b, hgt, ppm) => (rng.chance(0.5) ? [M.pinnacle(rng, x, b, hgt, ppm * rng.range(0.8, 1.4))] : [M.rockMass(rng, x, b, ppm * rng.range(3, 6), hgt * 0.5)]) },
      { base: 0.88, amp: 0.16, colour: 'rgba(12,5,26,1)', mist: [0.4, 0.22, 0.66], mistStrength: 0.4, gap: [2.4, 5], motif: (rng, x, b, hgt, ppm) => [M.crystalCluster(rng, x, b, hgt * 0.9, ppm * rng.range(2, 3.6))] },
    ],
    extra: (ctx, rng, w, h, ppm) => {
      // the ink moves in the dark: veins of light that cross the far wall, and cysts that shine
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const pts = M.strand(rng, rng.range(0, w), rng.range(0, h * 0.3), h * rng.range(0.35, 0.7), Math.PI / 2 + rng.gauss() * 0.5, 0.2);
        wrapX(w, (dx) => {
          ctx.strokeStyle = `rgba(190,140,255,${rng.range(0.12, 0.24)})`;
          ctx.lineWidth = Math.max(1, ppm * 0.07);
          ctx.beginPath();
          ctx.moveTo(pts[0]!.x + dx, pts[0]!.y);
          for (const p of pts) ctx.lineTo(p.x + dx, p.y);
          ctx.stroke();
        });
      }
      for (let i = 0; i < 6; i++) glowDot(ctx, w, rng.range(0, w), h * rng.range(0.3, 0.8), ppm * rng.range(0.6, 1.4), '200,140,255', rng.range(0.25, 0.45));
    },
    haze: { colour: [0.4, 0.22, 0.66], strength: 0.55 },
    motes: 'rgba(225,200,255,0.55)',
  },
};

/** The FAR strip of a zone: an opaque picture — a sky, a light, haze and three skylines, each in its own mist. */
export function zoneFar(o: ZoneStripOptions): Surface {
  const { w, h, ppm, seed } = o;
  const t = FAR[o.zone];
  const rng = new Rng(seed);
  const s = surface(w, h);
  const ctx = s.ctx;
  ctx.fillStyle = gradient(ctx, h, t.sky);
  ctx.fillRect(0, 0, w, h);
  for (const l of t.lights) {
    for (const dx of [-w, 0, w]) {
      const g = ctx.createRadialGradient(w * l.x + dx, h * l.y, 0, w * l.x + dx, h * l.y, h * l.r);
      for (const [at, c] of l.stops) g.addColorStop(at, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
  if (t.beams) beamsOf(ctx, rng, w, h, t.beams.count, t.beams.peak, t.beams.rgb);
  t.giants(ctx, rng, w, h, ppm);
  for (const b of t.bands) {
    const r = rng.fork(`band${b.base}`);
    ctx.fillStyle = b.colour;
    for (let x = -w * 0.1; x < w * 1.1; x += r.range(ppm * b.gap[0], ppm * b.gap[1])) {
      const hgt = h * b.amp * r.range(0.4, 1);
      for (const f of b.motif(r, x, h * b.base, hgt, ppm, w)) wrapX(w, (dx) => f.draw(ctx, dx));
    }
    ctx.fillRect(0, h * b.base, w, h - h * b.base);
    mist(s, seed + Math.round(b.base * 100), h * (b.base - 0.07), h * (b.base + 0.08), b.mist, b.mistStrength, ppm);
  }
  t.extra?.(ctx, rng.fork('extra'), w, h, ppm);
  mist(s, seed + 7, h * 0.55, h, t.haze.colour, t.haze.strength, ppm);
  ctx.fillStyle = t.motes;
  for (let i = 0; i < Math.round(w / 55); i++) ctx.fillRect(Math.round(rng.range(0, w)), Math.round(rng.range(0, h * 0.5)), 1, 1);
  return s;
}

// -------------------------------------------------------------------------------------------------------------------------------- the middle and near strips

const look = (key: Rgb, ambient: Rgb, rimColour: Rgb): Look => ({ ...BACK, key, ambient, rimColour });

const stoneRamp = (stops: readonly [number, number, number][]): ((v: number) => Rgb) => ramp(stops.map((c, i) => ({ at: i / (stops.length - 1), colour: c as Rgb })));

/** Shorthand: add a form to the layer with options. */
const put = (b: Build, f: M.Form, o: { round: number; tone: number; spread?: number; moss?: number; fade?: readonly [number, number] }): void => b.layer.add(f.draw, f.box, { spread: 0.06, ...o });

const MID: Readonly<Record<ZoneId, NearMidTheme>> = {
  roots: {
    look: look([0.5, 0.9, 0.7], [0.16, 0.3, 0.26], [0.6, 1, 0.8]),
    stone: stoneRamp([[0.01, 0.02, 0.015], [0.04, 0.07, 0.05], [0.1, 0.17, 0.12], [0.22, 0.34, 0.25], [0.5, 0.7, 0.5]]),
    accent: ramp([{ at: 0, colour: [0.03, 0.08, 0.06] }, { at: 1, colour: [0.14, 0.36, 0.26] }]),
    fog: [0.1, 0.3, 0.24], fogAmount: 0.3, foot: '#1d5a45', footAmount: 0.6, mist: [0.2, 0.5, 0.4],
    build: (b) => {
      // the back row: thinner trunks, pale in the mist; the front row: thick, dark, their roots flared
      const back = Math.round(b.w / (b.ppm * 6.5));
      for (let i = 0; i < back; i++) {
        const r = b.ppm * b.rng.range(0.45, 0.9);
        const t = trunk(b.rng, ((i + b.rng.range(0.1, 0.9)) / back) * b.w, b.foot, -b.ppm, r, r * b.rng.range(0.6, 0.85));
        b.layer.add(t.draw, { x0: t.x0, x1: t.x1, y0: -b.ppm, y1: b.h }, { round: r * 0.45, tone: b.rng.range(0.22, 0.3), spread: 0.06, fade: [0.05, 0] });
      }
      const front = Math.round(b.w / (b.ppm * 9));
      for (let i = 0; i < front; i++) {
        const r = b.ppm * b.rng.range(0.9, 1.8);
        const t = trunk(b.rng, ((i + b.rng.range(0.2, 0.8)) / front) * b.w, b.foot, -b.ppm, r, r * b.rng.range(0.5, 0.75));
        b.layer.add(t.draw, { x0: t.x0, x1: t.x1, y0: -b.ppm, y1: b.h }, { round: r * 0.55, tone: b.rng.range(0.1, 0.17), spread: 0.08, moss: 0.4, fade: [0.04, -0.01] });
      }
      // the roots that hang from the roof of the world: curtains, thick, in clumps
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 4.4)))) {
        const f = M.drape(b.rng, x, -b.ppm * 0.4, b.ppm * b.rng.range(5, 12), b.ppm * b.rng.range(1.6, 3.2));
        put(b, f, { round: b.ppm * 0.18, tone: b.rng.range(0.08, 0.13), moss: 0.3 });
      }
      for (let i = 0; i < Math.round(b.w / (b.ppm * 5)); i++) {
        const v = vine(b.rng, b.rng.range(0, b.w), b.ppm * 0.4, b.ppm * b.rng.range(3, 9), b.ppm * 0.09);
        b.layer.add(v.draw, v.box, { round: 2, tone: 0.09, spread: 0.04 });
      }
    },
  },
  mire: {
    look: look([0.5, 0.95, 0.85], [0.15, 0.32, 0.32], [0.6, 1, 0.9]),
    stone: stoneRamp([[0.008, 0.02, 0.02], [0.03, 0.07, 0.07], [0.08, 0.17, 0.17], [0.18, 0.34, 0.33], [0.45, 0.7, 0.65]]),
    accent: ramp([{ at: 0, colour: [0.03, 0.09, 0.09] }, { at: 1, colour: [0.15, 0.4, 0.36] }]),
    fog: [0.1, 0.3, 0.3], fogAmount: 0.32, foot: '#1f6a60', footAmount: 0.65, mist: [0.2, 0.55, 0.5],
    build: (b) => {
      // dead trees, tall and thin, in two rows
      const n = Math.round(b.w / (b.ppm * 5.5));
      for (let i = 0; i < n; i++) {
        const r = b.ppm * b.rng.range(0.2, 0.55);
        const near = i % 2 === 0;
        const t = trunk(b.rng, ((i + b.rng.range(0.15, 0.85)) / n) * b.w, b.foot, -b.ppm, r, r * b.rng.range(0.4, 0.7));
        b.layer.add(t.draw, { x0: t.x0, x1: t.x1, y0: -b.ppm, y1: b.h }, { round: r * 0.5, tone: near ? b.rng.range(0.09, 0.14) : b.rng.range(0.2, 0.28), spread: 0.06, moss: 0.3, fade: [0.04, 0] });
      }
      // the moss that hangs from the branches
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 3.4)))) put(b, M.drape(b.rng, x, -b.ppm * 0.3, b.ppm * b.rng.range(3, 9), b.ppm * b.rng.range(0.9, 2)), { round: b.ppm * 0.1, tone: b.rng.range(0.07, 0.12), moss: 0.25 });
      // giant mushrooms that shine under their caps, and lanterns on posts
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 7.5)))) {
        const m = M.mushroom(b.rng, x, b.foot, b.ppm * b.rng.range(4, 9), b.ppm * b.rng.range(1.5, 3.2));
        put(b, m, { round: b.ppm * 0.18, tone: b.rng.range(0.06, 0.1) });
        b.layer.glow(m.cap.draw, m.cap.box, [0.25, 0.95, 0.8], 0.75, b.ppm * 0.6);
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 12)))) {
        const l = M.lanternPost(b.rng, x, b.foot, b.ppm * b.rng.range(5, 7.5), b.ppm * b.rng.range(0.9, 1.5));
        put(b, l, { round: b.ppm * 0.1, tone: 0.1 });
        b.layer.glow(l.lamp.draw, l.lamp.box, [0.55, 1, 0.85], 1.3, b.ppm * 0.9);
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 3)))) put(b, M.reeds(b.rng, x, b.foot, b.rng.int(8, 14), b.ppm * b.rng.range(1.6, 3.4), b.ppm * 0.5), { round: 2, tone: b.rng.range(0.08, 0.13), spread: 0.04 });
    },
  },
  mines: {
    look: look([0.45, 0.7, 1], [0.2, 0.3, 0.5], [0.6, 0.8, 1]),
    stone: stoneRamp([[0.01, 0.015, 0.035], [0.03, 0.05, 0.1], [0.07, 0.12, 0.24], [0.16, 0.27, 0.5], [0.42, 0.62, 0.95]]),
    accent: ramp([{ at: 0, colour: [0.05, 0.1, 0.25] }, { at: 1, colour: [0.2, 0.45, 0.8] }]),
    fog: [0.1, 0.2, 0.42], fogAmount: 0.3, foot: '#254a7a', footAmount: 0.6, mist: [0.2, 0.4, 0.66],
    build: (b) => {
      // pillars of rock in the back, pale; the roof with its teeth
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 6.5)))) {
        const rw = b.ppm * b.rng.range(2.5, 5);
        const rh = b.ppm * b.rng.range(5, 13);
        put(b, M.rockMass(b.rng, x, b.foot, rw, rh), { round: b.ppm * 0.5, tone: b.rng.range(0.2, 0.28), fade: [0.05, -0.02] });
        if (b.rng.chance(0.7)) {
          // crystals that grow out of the flank of the rock, and shine
          const c = M.crystalCluster(b.rng, x + b.rng.range(-rw * 0.25, rw * 0.25), b.foot - rh * b.rng.range(0.2, 0.55), b.ppm * b.rng.range(1.4, 3.4), b.ppm * b.rng.range(1.2, 2.4));
          put(b, c, { round: b.ppm * 0.2, tone: b.rng.range(0.3, 0.42), spread: 0.05 });
          b.layer.glow(c.draw, c.box, [0.3, 0.62, 1], 0.75, b.ppm * 0.5);
        }
      }
      const roofN = Math.round(b.w / (b.ppm * 8));
      for (let i = 0; i < roofN; i++) put(b, M.ceilingMass(b.rng, ((i + 0.5) / roofN) * b.w, -b.ppm * 0.5, (b.w / roofN) * 1.3, b.ppm * b.rng.range(1.6, 3.2)), { round: b.ppm * 0.4, tone: b.rng.range(0.06, 0.1) });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 2.6)))) put(b, M.stalactite(b.rng, x, b.ppm * b.rng.range(0.6, 2), b.ppm * b.rng.range(1.5, 5.5), b.ppm * b.rng.range(0.5, 1.2)), { round: b.ppm * 0.2, tone: b.rng.range(0.06, 0.11) });
      // timber that holds the gallery up
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 11)))) put(b, M.timberFrame(b.rng, x, b.foot, b.ppm * b.rng.range(3.8, 5.6), b.ppm * b.rng.range(5, 7.4), b.ppm * 0.28, b.rng.chance(0.25)), { round: b.ppm * 0.14, tone: b.rng.range(0.12, 0.17), fade: [0.03, -0.02] });
      // crystals that shine at the foot of things
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 4.2)))) {
        const c = M.crystalCluster(b.rng, x, b.foot, b.ppm * b.rng.range(1.6, 4.4), b.ppm * b.rng.range(1.4, 3));
        put(b, c, { round: b.ppm * 0.2, tone: b.rng.range(0.28, 0.4), spread: 0.05 });
        b.layer.glow(c.draw, c.box, [0.3, 0.62, 1], 0.55, b.ppm * 0.4);
      }
      // a lamp or two on a chain
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 14)))) {
        const ch = M.chain(b.rng, x, -b.ppm, b.ppm * b.rng.range(3, 6), b.ppm * 0.12);
        put(b, ch, { round: 1.5, tone: 0.12 });
        const ly = b.ppm * b.rng.range(3, 6) + b.ppm * 0.4;
        b.layer.glow((ctx, dx) => ctx.fillRect(x + dx - b.ppm * 0.18, ly, b.ppm * 0.36, b.ppm * 0.5), { x0: x - b.ppm, x1: x + b.ppm, y0: ly - b.ppm, y1: ly + b.ppm * 1.5 }, [0.6, 0.85, 1], 1.1, b.ppm * 0.9);
      }
    },
  },
  spire: {
    look: look([1, 0.8, 0.55], [0.34, 0.28, 0.26], [1, 0.85, 0.6]),
    stone: stoneRamp([[0.02, 0.014, 0.012], [0.07, 0.05, 0.045], [0.16, 0.12, 0.1], [0.34, 0.26, 0.2], [0.72, 0.58, 0.45]]),
    accent: ramp([{ at: 0, colour: [0.1, 0.07, 0.05] }, { at: 1, colour: [0.5, 0.36, 0.22] }]),
    fog: [0.4, 0.28, 0.2], fogAmount: 0.3, foot: '#7a5236', footAmount: 0.6, mist: [0.66, 0.46, 0.34],
    build: (b) => {
      // towers and pinnacles standing in the wind, with the buttresses that hold them
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 8)))) {
        const hgt = b.ppm * b.rng.range(9, 18);
        const w = b.ppm * b.rng.range(1.6, 2.8);
        put(b, M.tower(b.rng, x, b.foot, hgt, w), { round: w * 0.35, tone: b.rng.range(0.2, 0.28), fade: [0.05, -0.02] });
        if (b.rng.chance(0.6)) put(b, M.buttress(b.rng, x + w * 0.7, b.foot, x + w * 0.7 + b.ppm * b.rng.range(3, 5), b.foot - hgt * 0.5, b.ppm * 0.45), { round: b.ppm * 0.2, tone: 0.2 });
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 6)))) put(b, M.pinnacle(b.rng, x, b.foot, b.ppm * b.rng.range(5, 11), b.ppm * b.rng.range(0.7, 1.1)), { round: b.ppm * 0.25, tone: b.rng.range(0.14, 0.2) });
      // bells on their yokes, and the chains and the banners the wind moves
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 7)))) {
        const len = b.ppm * b.rng.range(2, 7);
        put(b, M.chain(b.rng, x, -b.ppm, len, b.ppm * 0.13), { round: 1.5, tone: 0.1 });
        if (b.rng.chance(0.6)) put(b, M.bell(b.rng, x, len - b.ppm * 0.5, b.ppm * b.rng.range(0.55, 1.1)), { round: b.ppm * 0.3, tone: b.rng.range(0.14, 0.2), spread: 0.08 });
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)))) put(b, M.drape(b.rng, x, -b.ppm * 0.3, b.ppm * b.rng.range(5, 10), b.ppm * b.rng.range(0.9, 1.5)), { round: 2, tone: b.rng.range(0.08, 0.13), spread: 0.04 });
    },
  },
  foundry: {
    look: look([1, 0.62, 0.38], [0.34, 0.2, 0.14], [1, 0.7, 0.4]),
    stone: stoneRamp([[0.02, 0.01, 0.008], [0.06, 0.03, 0.02], [0.15, 0.07, 0.045], [0.32, 0.16, 0.1], [0.7, 0.4, 0.25]]),
    accent: ramp([{ at: 0, colour: [0.1, 0.05, 0.03] }, { at: 1, colour: [0.55, 0.28, 0.14] }]),
    fog: [0.34, 0.17, 0.1], fogAmount: 0.3, foot: '#5a2814', footAmount: 0.6, mist: [0.5, 0.24, 0.14],
    build: (b) => {
      // tanks and stacks in the back
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)))) {
        const f = b.rng.chance(0.5) ? M.chimney(b.rng, x, b.foot, b.ppm * b.rng.range(7, 15), b.ppm * b.rng.range(1.8, 2.8), b.ppm * b.rng.range(1.1, 1.7)) : M.tank(b.rng, x, b.foot, b.ppm * b.rng.range(2.6, 4.4), b.ppm * b.rng.range(3.5, 6), b.ppm * b.rng.range(0.8, 2));
        put(b, f, { round: b.ppm * 0.5, tone: b.rng.range(0.18, 0.25), fade: [0.05, -0.02] });
        if (b.rng.chance(0.5)) {
          // a furnace mouth at the foot of it, still warm
          const wx = x - b.ppm * 0.4;
          b.layer.glow((ctx, dx) => ctx.fillRect(wx + dx, b.foot - b.ppm * 1.4, b.ppm * 0.8, b.ppm * 0.5), { x0: wx - b.ppm, x1: wx + b.ppm * 1.8, y0: b.foot - b.ppm * 2.4, y1: b.foot - b.ppm * 0.4 }, [1, 0.5, 0.18], 0.8, b.ppm * 0.7);
        }
      }
      // pipes that run up and across, chains with hooks, trusses
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 6)))) {
        const turn = b.rng.chance(0.5) ? 1 : -1;
        put(b, M.pipe(b.rng, x, -b.ppm, b.foot - b.ppm * b.rng.range(1, 4), b.ppm * b.rng.range(0.22, 0.4), turn as 1 | -1, b.ppm * b.rng.range(3, 8)), { round: b.ppm * 0.2, tone: b.rng.range(0.1, 0.16) });
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 8)))) put(b, M.chain(b.rng, x, -b.ppm, b.ppm * b.rng.range(3, 8), b.ppm * 0.15, b.rng.chance(0.6)), { round: 2, tone: 0.1 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 14)))) {
        const len = b.ppm * b.rng.range(6, 12);
        put(b, M.gantry(b.rng, x - len / 2, x + len / 2, b.ppm * b.rng.range(3, 9), b.ppm * 1.3, b.ppm * 0.2, true, b.foot), { round: b.ppm * 0.12, tone: 0.12 });
      }
      for (const x of spread(b.rng, b.w, 3)) put(b, M.gear(b.rng, x, b.ppm * b.rng.range(2, 6), b.ppm * b.rng.range(1.2, 2.4), b.rng.int(10, 16)), { round: b.ppm * 0.2, tone: 0.14 });
    },
  },
  heart: {
    look: look([0.75, 0.5, 1], [0.26, 0.18, 0.42], [0.85, 0.65, 1]),
    stone: stoneRamp([[0.015, 0.008, 0.03], [0.05, 0.025, 0.09], [0.12, 0.06, 0.22], [0.27, 0.15, 0.46], [0.6, 0.4, 0.9]]),
    accent: ramp([{ at: 0, colour: [0.07, 0.03, 0.14] }, { at: 1, colour: [0.4, 0.22, 0.7] }]),
    fog: [0.2, 0.1, 0.36], fogAmount: 0.3, foot: '#3e2070', footAmount: 0.6, mist: [0.4, 0.22, 0.66],
    build: (b) => {
      // ribs that curl over the dark, pale
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)))) put(b, M.rib(b.rng, x, b.foot, b.ppm * b.rng.range(3, 6), b.ppm * b.rng.range(7, 14), b.ppm * b.rng.range(0.6, 1), b.rng.gauss() * 0.12), { round: b.ppm * 0.35, tone: b.rng.range(0.2, 0.28), fade: [0.05, -0.02] });
      // veins that hang from the roof and shine
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 3.6)))) {
        const path = M.strand(b.rng, x, -b.ppm, b.ppm * b.rng.range(5, 14), Math.PI / 2 + b.rng.gauss() * 0.25, 0.22);
        const th = b.ppm * b.rng.range(0.1, 0.22);
        b.layer.tube(path, (t) => th * (1 - t * 0.6), { tone: 0.12, spread: 0.05, round: 0.9 });
        if (b.rng.chance(0.55)) b.layer.glow((ctx, dx) => { ctx.lineWidth = th * 0.4; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(path[0]!.x + dx, path[0]!.y); for (const p of path) ctx.lineTo(p.x + dx, p.y); ctx.stroke(); }, { x0: Math.min(...path.map((p) => p.x)) - th * 2, x1: Math.max(...path.map((p) => p.x)) + th * 2, y0: 0, y1: Math.max(...path.map((p) => p.y)) + th }, [0.7, 0.4, 1], 0.5, b.ppm * 0.3);
      }
      // cysts that shine, and crystals at the foot
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 6)))) {
        const bu = M.bulb(b.rng, x, b.ppm * b.rng.range(4, 12), b.ppm * b.rng.range(0.6, 1.4), b.ppm * b.rng.range(0.8, 1.8));
        put(b, bu, { round: b.ppm * 0.4, tone: 0.14 });
        b.layer.glow(bu.core.draw, bu.core.box, [0.75, 0.45, 1], 0.9, b.ppm * 0.6);
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 5)))) {
        const c = M.crystalCluster(b.rng, x, b.foot, b.ppm * b.rng.range(1.6, 4.4), b.ppm * b.rng.range(1.4, 3));
        put(b, c, { round: b.ppm * 0.2, tone: b.rng.range(0.26, 0.38), spread: 0.05 });
        b.layer.glow(c.draw, c.box, [0.62, 0.35, 1], 0.5, b.ppm * 0.4);
      }
    },
  },
};

const NEAR: Readonly<Record<ZoneId, NearMidTheme>> = {
  roots: {
    ...MID.roots,
    fog: [0.08, 0.22, 0.18], fogAmount: 0.12, mist: [0.2, 0.5, 0.4],
    build: (b) => {
      // the great roots: arches over the way, trunks as thick as a hall, and what hangs from them
      const n = Math.max(3, Math.round(b.w / (b.ppm * 8)));
      const xs = spread(b.rng, b.w, n, 0.5);
      xs.forEach((cx, i) => {
        const r = b.ppm * b.rng.range(0.8, 1.5);
        const t = trunk(b.rng, cx, b.foot, -b.ppm, r, r * b.rng.range(0.55, 0.8));
        b.layer.add(t.draw, { x0: t.x0, x1: t.x1, y0: -b.ppm, y1: b.h }, { round: r * 0.6, tone: b.rng.range(0.08, 0.13), spread: 0.08, moss: 0.45, fade: [0.03, -0.02] });
        const next = xs[(i + 1) % n]! + (i + 1 === n ? b.w : 0);
        if (b.rng.chance(0.7) && next - cx < b.ppm * 14) {
          const span = (next - cx) / 2;
          put(b, M.rib(b.rng, (cx + next) / 2, b.foot - b.ppm * b.rng.range(2, 5), span, b.ppm * b.rng.range(3, 6), r * 0.8, 0), { round: r * 0.5, tone: 0.1, moss: 0.35 });
        }
      });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 6)))) put(b, M.drape(b.rng, x, -b.ppm * 0.3, b.ppm * b.rng.range(4, 10), b.ppm * b.rng.range(1.4, 2.8)), { round: b.ppm * 0.2, tone: 0.08, moss: 0.3 });
    },
  },
  mire: {
    ...MID.mire,
    fog: [0.08, 0.24, 0.24], fogAmount: 0.12, mist: [0.2, 0.55, 0.5],
    build: (b) => {
      // stilts: the posts that hold the walkways above the water, with cross-beams, and the great stalks of mushrooms
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 6)), 0.6)) {
        const th = b.ppm * b.rng.range(0.35, 0.7);
        put(b, M.postOf(b.rng, x, b.foot - b.ppm * b.rng.range(8, 14), b.foot, th), { round: th * 0.55, tone: b.rng.range(0.07, 0.12), moss: 0.35, fade: [0.03, -0.02] });
        if (b.rng.chance(0.6)) {
          const y = b.foot - b.ppm * b.rng.range(3, 6);
          const len = b.ppm * b.rng.range(3, 6);
          put(b, { draw: (ctx, dx) => M.bar(ctx, x + dx, y, x + dx + len, y + b.ppm * 0.1, b.ppm * 0.28), box: { x0: x - 4, x1: x + len + 4, y0: y - b.ppm * 0.3, y1: y + b.ppm * 0.4 } }, { round: b.ppm * 0.1, tone: 0.1 });
        }
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)))) {
        const m = M.mushroom(b.rng, x, b.foot, b.ppm * b.rng.range(6, 11), b.ppm * b.rng.range(2.2, 4));
        put(b, m, { round: b.ppm * 0.25, tone: b.rng.range(0.05, 0.08) });
        b.layer.glow(m.cap.draw, m.cap.box, [0.25, 0.95, 0.8], 0.55, b.ppm * 0.8);
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 5)))) put(b, M.drape(b.rng, x, -b.ppm * 0.3, b.ppm * b.rng.range(3, 8), b.ppm * b.rng.range(1.2, 2.4)), { round: 3, tone: 0.07, moss: 0.25 });
    },
  },
  mines: {
    ...MID.mines,
    fog: [0.08, 0.16, 0.34], fogAmount: 0.12,
    build: (b) => {
      // the rock itself in the front: columns that go up into the dark, the roof close above, the frames of the galleries large
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 7)), 0.5)) put(b, M.rockMass(b.rng, x, b.foot, b.ppm * b.rng.range(2.2, 4.2), b.ppm * b.rng.range(8, 17)), { round: b.ppm * 0.5, tone: b.rng.range(0.07, 0.12), spread: 0.08, fade: [0.03, -0.02] });
      const roofN = Math.round(b.w / (b.ppm * 7));
      for (let i = 0; i < roofN; i++) put(b, M.ceilingMass(b.rng, ((i + 0.5) / roofN) * b.w, -b.ppm * 0.4, (b.w / roofN) * 1.3, b.ppm * b.rng.range(2, 4)), { round: b.ppm * 0.5, tone: 0.06 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 4)))) put(b, M.stalactite(b.rng, x, b.ppm * b.rng.range(0.8, 2.6), b.ppm * b.rng.range(2, 6.5), b.ppm * b.rng.range(0.7, 1.6)), { round: b.ppm * 0.3, tone: 0.07 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 14)))) put(b, M.timberFrame(b.rng, x, b.foot, b.ppm * b.rng.range(6, 9), b.ppm * b.rng.range(8, 12), b.ppm * 0.42, b.rng.chance(0.3)), { round: b.ppm * 0.2, tone: b.rng.range(0.09, 0.13) });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 10)))) {
        const c = M.crystalCluster(b.rng, x, b.foot, b.ppm * b.rng.range(3, 7), b.ppm * b.rng.range(2.2, 4));
        put(b, c, { round: b.ppm * 0.3, tone: b.rng.range(0.2, 0.3) });
        b.layer.glow(c.draw, c.box, [0.3, 0.62, 1], 0.6, b.ppm * 0.5);
      }
    },
  },
  spire: {
    ...MID.spire,
    fog: [0.34, 0.24, 0.17], fogAmount: 0.12,
    build: (b) => {
      // the stone of the spire close: arcades of pointed arches, columns that carry the roof, the frames where the great bells hang
      const n = Math.max(3, Math.round(b.w / (b.ppm * 8)));
      const xs = spread(b.rng, b.w, n, 0.5);
      xs.forEach((cx, i) => {
        const r = b.ppm * b.rng.range(0.55, 0.9);
        const hgt = b.ppm * b.rng.range(6, 14);
        const c = M.arcade(b.rng, cx - r * 2, b.foot, 1, r * 4, hgt, r * 1.1);
        put(b, c, { round: r * 0.5, tone: b.rng.range(0.1, 0.16), spread: 0.08, fade: [0.03, -0.02] });
        const next = xs[(i + 1) % n]! + (i + 1 === n ? b.w : 0);
        if (b.rng.chance(0.5) && next - cx < b.ppm * 12) {
          const span = (next - cx - r * 4) / 2;
          if (span > b.ppm) put(b, M.arcade(b.rng, cx + r * 2, b.foot - hgt * 0.35, Math.max(1, Math.round(span / (b.ppm * 2.2))), (next - cx - r * 4) / Math.max(1, Math.round(span / (b.ppm * 2.2))), b.ppm * 2.8, b.ppm * 0.4), { round: b.ppm * 0.2, tone: 0.12 });
        }
      });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 12)))) {
        const len = b.ppm * b.rng.range(3, 6);
        put(b, M.chain(b.rng, x, -b.ppm, len, b.ppm * 0.2), { round: 2, tone: 0.08 });
        put(b, M.bell(b.rng, x, len - b.ppm * 0.4, b.ppm * b.rng.range(1.2, 2)), { round: b.ppm * 0.5, tone: 0.1, spread: 0.08 });
      }
    },
  },
  foundry: {
    ...MID.foundry,
    fog: [0.28, 0.14, 0.08], fogAmount: 0.12,
    build: (b) => {
      // iron close: columns of girder, trusses across the way, a gear or two taller than the room, big pipes
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 7)), 0.5)) put(b, M.girder(b.rng, x, b.foot, -b.ppm, b.ppm * b.rng.range(0.9, 1.5)), { round: b.ppm * 0.3, tone: b.rng.range(0.07, 0.12), spread: 0.06, fade: [0.03, -0.02] });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 11)))) {
        const len = b.ppm * b.rng.range(7, 12);
        put(b, M.gantry(b.rng, x - len / 2, x + len / 2, b.ppm * b.rng.range(5, 11), b.ppm * 1.8, b.ppm * 0.28, false), { round: b.ppm * 0.18, tone: 0.08 });
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 13)))) put(b, M.gear(b.rng, x, b.ppm * b.rng.range(3, 9), b.ppm * b.rng.range(2.4, 4.4), b.rng.int(12, 18)), { round: b.ppm * 0.4, tone: 0.09 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 9)))) put(b, M.pipe(b.rng, x, -b.ppm, b.foot - b.ppm * b.rng.range(0, 2), b.ppm * b.rng.range(0.4, 0.7), b.rng.chance(0.5) ? 1 : -1, b.ppm * b.rng.range(3, 7)), { round: b.ppm * 0.35, tone: 0.08 });
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 10)))) put(b, M.chain(b.rng, x, -b.ppm, b.ppm * b.rng.range(4, 9), b.ppm * 0.22, true), { round: 3, tone: 0.07 });
    },
  },
  heart: {
    ...MID.heart,
    fog: [0.14, 0.07, 0.26], fogAmount: 0.12,
    build: (b) => {
      // the bones of the place: ribs over the way with light in their seams, columns of ink-stone, cysts
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 8)), 0.5)) {
        const f = M.rib(b.rng, x, b.foot, b.ppm * b.rng.range(3.5, 6), b.ppm * b.rng.range(10, 18), b.ppm * b.rng.range(0.8, 1.4), b.rng.gauss() * 0.1);
        put(b, f, { round: b.ppm * 0.5, tone: b.rng.range(0.07, 0.12), spread: 0.08, fade: [0.03, -0.02] });
        b.layer.glow((ctx, dx) => { ctx.save(); ctx.lineWidth = Math.max(2, b.ppm * 0.06); ctx.strokeStyle = '#fff'; ctx.beginPath(); const xs = f.box.x0 + (f.box.x1 - f.box.x0) / 2; ctx.ellipse(xs + dx, b.foot, (f.box.x1 - f.box.x0) / 2 - b.ppm * 1.6, (f.box.y1 - f.box.y0) - b.ppm * 1.4, 0, Math.PI, 0); ctx.stroke(); ctx.restore(); }, f.box, [0.7, 0.4, 1], 0.4, b.ppm * 0.3);
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 7)))) {
        const bu = M.bulb(b.rng, x, b.ppm * b.rng.range(3, 9), b.ppm * b.rng.range(1, 2), b.ppm * b.rng.range(1.4, 2.8));
        put(b, bu, { round: b.ppm * 0.6, tone: 0.09 });
        b.layer.glow(bu.core.draw, bu.core.box, [0.75, 0.45, 1], 0.7, b.ppm * 0.8);
      }
      for (const x of spread(b.rng, b.w, Math.round(b.w / (b.ppm * 4.5)))) {
        const path = M.strand(b.rng, x, -b.ppm, b.ppm * b.rng.range(6, 15), Math.PI / 2 + b.rng.gauss() * 0.25, 0.2);
        const th = b.ppm * b.rng.range(0.18, 0.36);
        b.layer.tube(path, (t) => th * (1 - t * 0.5), { tone: 0.08, spread: 0.05, round: 0.9 });
      }
    },
  },
};

/** Lights what the layer holds, in the mist of the zone, and loses the foot of everything in it. */
function buildStrip(o: ZoneStripOptions, theme: NearMidTheme, footMix: number): Surface {
  const { w, h, ppm, seed } = o;
  const layer = new SilhouetteLayer(w, h, seed, true);
  const rng = new Rng(seed);
  theme.build({ layer, rng, w, h, ppm, foot: h - ppm * 0.3 });
  const img = shade(layer.layers(theme.stone, theme.accent), theme.look, true);
  grade(img, { fog: theme.fog, fogAmount: theme.fogAmount });
  const s = surface(w, h);
  writePixels(s, img);
  mist(s, seed + 3, h * 0.5, h, theme.mist, footMix, ppm);
  const out = readPixels(s);
  const foot = hex(theme.foot);
  for (let y = Math.floor(h * 0.6); y < h; y++) {
    const k = smoothstep(h * 0.6, h, y) * theme.footAmount * (footMix > 0.7 ? 1 : 0.5);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (out.data[i + 3]! === 0) continue;
      for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c]! + (foot[c]! * 255 - out.data[i + c]!) * k);
    }
  }
  writePixels(s, out);
  return s;
}

/** The MID strip of a zone: lit silhouettes in the mist, transparent between them. */
export function zoneMid(o: ZoneStripOptions): Surface {
  return buildStrip(o, MID[o.zone], 0.75);
}

/** The NEAR strip of a zone: darker, closer and bigger. */
export function zoneNear(o: ZoneStripOptions): Surface {
  return buildStrip(o, NEAR[o.zone], 0.6);
}

/** The colours the zone's lit things are made of (what its middle and near strips use), for the props that stand in the zone: a prop and its backdrop are of the same stuff. */
export const zoneRamps = (zone: ZoneId): { stone: (v: number) => Rgb; accent: (v: number) => Rgb } => ({ stone: MID[zone].stone, accent: MID[zone].accent });

export { css, clamp01, crown, finish, rgbOf };
