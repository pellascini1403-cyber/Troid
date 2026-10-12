import { hash3 } from './rng';

/**
 * Value noise, fractal noise and cellular noise — every one of them PERIODIC when it is given a period, so a texture made from them tiles without a seam.
 * Coordinates are in lattice cells; a period is a number of cells (0 = not periodic).
 */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function lattice(ix: number, iy: number, seed: number, px: number, py: number): number {
  if (px > 0) ix = ((ix % px) + px) % px;
  if (py > 0) iy = ((iy % py) + py) % py;
  return hash3(ix, iy, seed) / 4294967296;
}

/** [0, 1) */
export function noise2(x: number, y: number, seed: number, px = 0, py = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = lattice(x0, y0, seed, px, py);
  const b = lattice(x0 + 1, y0, seed, px, py);
  const c = lattice(x0, y0 + 1, seed, px, py);
  const d = lattice(x0 + 1, y0 + 1, seed, px, py);
  return mix(mix(a, b, fx), mix(c, d, fx), fy);
}

export interface FbmOptions {
  octaves?: number;
  gain?: number;
  /** Must be 2 for a periodic noise (the period doubles with the frequency). */
  lacunarity?: number;
  px?: number;
  py?: number;
}

/** [0, 1): several octaves of value noise. */
export function fbm(x: number, y: number, seed: number, o: FbmOptions = {}): number {
  const octaves = o.octaves ?? 5;
  const gain = o.gain ?? 0.5;
  const lac = o.lacunarity ?? 2;
  let amp = 1;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, y * f, seed + i * 101, (o.px ?? 0) * f, (o.py ?? 0) * f);
    norm += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / norm;
}

/** Ridged noise [0, 1): bright thin ridges where the base noise crosses 0.5 — veins, cracks, strata. */
export function ridged(x: number, y: number, seed: number, o: FbmOptions = {}): number {
  return 1 - Math.abs(fbm(x, y, seed, o) * 2 - 1);
}

export interface Cell {
  /** Distance to the nearest and the second nearest feature point (cell units). */
  d1: number;
  d2: number;
  /** A stable id (0..1) of the nearest cell: the same stone has the same id everywhere in it. */
  id: number;
}

/** Cellular (Worley) noise: stones, pebbles, cracks along `d2 - d1`. */
export function worley(x: number, y: number, seed: number, px = 0, py = 0): Cell {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const wx = px > 0 ? ((gx % px) + px) % px : gx;
      const wy = py > 0 ? ((gy % py) + py) % py : gy;
      const hx = hash3(wx, wy, seed) / 4294967296;
      const hy = hash3(wx, wy, seed + 7919) / 4294967296;
      const dx = gx + hx - x;
      const dy = gy + hy - y;
      const d = Math.hypot(dx, dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash3(wx, wy, seed + 104729) / 4294967296;
      } else if (d < d2) d2 = d;
    }
  }
  return { d1, d2, id };
}
