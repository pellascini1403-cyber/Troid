import { ramp, type Rgb } from './color';
import { BACK } from './backdrop';
import type { Look } from './light';
import * as M from './motifs';
import { Rng } from './rng';
import type { SilhouetteLayer } from './silhouette';
import { wrapX } from './shapes';

/**
 * WHAT THE BACKDROPS OF THE ZONES ARE BUILT WITH (docs/PROMPT23-LOG.md §5, §7): the pieces the strips of every zone share — the shape of a theme (a far sky with its lights, beams, giants and skylines; a middle or near strip of lit silhouettes), the soft things
 * (a dot of light, a diagonal beam, a cloud, a column of smoke) and the shorthands the themes are written with. Moved here, as it was, so that the zones of the first half (`zones.ts`) and those of the second (`ember.ts`) are written the same way.
 */
export type Light = { x: number; y: number; r: number; stops: ReadonlyArray<readonly [number, string]> };
export type Skyline = { base: number; amp: number; colour: string; mist: Rgb; mistStrength: number; gap: readonly [number, number]; motif: (rng: Rng, x: number, baseY: number, hgt: number, ppm: number, w: number) => M.Form[] };

export interface FarTheme {
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

export interface Build {
  layer: SilhouetteLayer;
  rng: Rng;
  w: number;
  h: number;
  ppm: number;
  /** Where the things that stand have their foot. */
  foot: number;
}

export interface NearMidTheme {
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
export const spread = (rng: Rng, w: number, n: number, jitter = 0.7): number[] => Array.from({ length: n }, (_, i) => ((i + 0.5 + (rng.next() - 0.5) * jitter) / n) * w);

export const rgbOf = (c: Rgb, k = 1): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** A soft dot of light (a lamp far away, a spore): a radial gradient, periodic. */
export function glowDot(ctx: CanvasRenderingContext2D, w: number, x: number, y: number, r: number, rgb: string, a: number): void {
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
export function beamsOf(ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, count: number, peak: number, rgb: string): void {
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
export function cloud(ctx: CanvasRenderingContext2D, rng: Rng, w: number, x: number, y: number, len: number, thick: number, rgba: string): void {
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
export function smoke(ctx: CanvasRenderingContext2D, rng: Rng, w: number, x: number, y: number, rise: number, r0: number, rgb: string, a: number): void {
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

export const colossal = (ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, count: number, fill: string, r: readonly [number, number], flare = false): void => {
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
export const roof = (ctx: CanvasRenderingContext2D, rng: Rng, w: number, h: number, ppm: number, fill: string, depth: number, teeth: number): void => {
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

export const look = (key: Rgb, ambient: Rgb, rimColour: Rgb): Look => ({ ...BACK, key, ambient, rimColour });

export const stoneRamp = (stops: readonly [number, number, number][]): ((v: number) => Rgb) => ramp(stops.map((c, i) => ({ at: i / (stops.length - 1), colour: c as Rgb })));

/** Shorthand: add a form to the layer with options. */
export const put = (b: Build, f: M.Form, o: { round: number; tone: number; spread?: number; moss?: number; fade?: readonly [number, number] }): void => b.layer.add(f.draw, f.box, { spread: 0.06, ...o });
