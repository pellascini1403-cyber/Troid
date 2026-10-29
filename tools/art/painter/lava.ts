import { surface, readPixels, writePixels, type Surface } from './canvas';
import { clamp01, mixRgb, smoothstep, type Rgb } from './color';
import { fbm, noise2, worley } from './noise';
import { Rng } from './rng';

/**
 * LAVA (docs/PROMPT23-LOG.md §6): what the hazard of the kind `lava` is drawn with. Orange with a yellow-white heart where it is hottest and a crust of near-black plates that crack and glow at the edges — the one colour and the one slow movement nothing else in the game
 * has — so that whoever sees it knows what it does before they touch it (the hero is cyan; the enemies are violet; the old red accent is for the hurt). Two pieces:
 *
 *   `lavaCell`  the cells of a pool, 1 m wide each: the lava itself (the metre the hazard hurts in) and, over it, a third of a metre of heat haze and the crests of its surface. The cells are slices of one strip that is periodic along its whole length (its
 *               surface and its crust meet themselves at its two ends) and the art lays them in order, so a pool of any width is a row of them without a seam.
 *   `lavaFall`  a column of lava pouring down, as tall as the picture: painted once and stretched by the scene to the height of the fall.
 */
export interface LavaOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
  /** Cells side by side, each a frame of the sprite (`lavaCell` only). */
  cols?: number;
}

/** The body of the lava by depth: 0 at the surface, 1 at the bottom. */
const BODY: ReadonlyArray<readonly [number, Rgb]> = [
  [0, [1, 0.97, 0.62]],
  [0.07, [1, 0.82, 0.28]],
  [0.3, [1, 0.56, 0.1]],
  [0.62, [0.92, 0.34, 0.05]],
  [1, [0.5, 0.1, 0.04]],
];

function bodyColour(d: number): Rgb {
  for (let i = 1; i < BODY.length; i++) {
    const [d1, c1] = BODY[i]!;
    const [d0, c0] = BODY[i - 1]!;
    if (d <= d1) return mixRgb(c0, c1, (d - d0) / (d1 - d0));
  }
  return BODY[BODY.length - 1]![1];
}

const CRUST: Rgb = [0.1, 0.035, 0.035];
/** Plates of crust across one cell of a pool. */
const PLATES = 4;
const CRUST_EDGE: Rgb = [1, 0.5, 0.1];

/**
 * A pool, in `cols` cells of one metre: the lava a metre deep and the third of a metre of heat over it. The cells are the frames of ONE strip that is periodic along its whole length — its surface, its churn and its plates meet themselves at its two ends — and the art lays them in
 * order (frame 0, 1, 2, 3, 0, …), so a pool of any width is seamless wherever a cell ends.
 */
export function lavaCell(o: LavaOptions): Surface {
  const cols = o.cols ?? 4;
  const cw = Math.round(o.w / cols);
  const W = cols * cw;
  const h = o.h;
  const s = surface(W, h);
  const img = readPixels(s);
  const bodyPx = o.ppm * 1.0;
  const hazePx = h - bodyPx;
  const rng = new Rng(o.seed);
  const seed = o.seed * 31 + 7;
  // the surface: waves that fit a whole number of times into the strip, so its two ends are at the same height (a swell over the strip, a wave a metre long and a ripple half of that)
  const waves = [
    { k: 1, a: o.ppm * rng.range(0.02, 0.04), p: rng.range(0, Math.PI * 2) },
    { k: cols, a: o.ppm * rng.range(0.03, 0.055), p: rng.range(0, Math.PI * 2) },
    { k: cols * 2, a: o.ppm * rng.range(0.012, 0.028), p: rng.range(0, Math.PI * 2) },
  ];
  const surfaceAt = (u: number): number => hazePx - waves.reduce((n, w) => n + w.a * (0.5 + 0.5 * Math.sin(u * Math.PI * 2 * w.k + w.p)), 0);
  const bubbles = Array.from({ length: cols * rng.int(1, 3) }, () => ({ u: rng.range(0.02, 0.98), d: rng.range(0.15, 0.7), r: o.ppm * rng.range(0.025, 0.07) }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const ux = x / cw;
      const u = x / W;
      const ys = surfaceAt(u);
      const i = (y * W + x) * 4;
      if (y < ys) {
        // the heat over it: orange, fading up
        const k = clamp01(1 - (ys - y) / (o.ppm * 0.4));
        const a = k * k * 0.5 * (0.75 + 0.25 * noise2(ux * 3, y / (o.ppm * 0.3), seed + 9, 3 * cols, 0));
        img.data[i] = 255;
        img.data[i + 1] = Math.round(150 + 70 * k);
        img.data[i + 2] = Math.round(50 + 40 * k);
        img.data[i + 3] = Math.round(255 * a);
        continue;
      }
      const d = clamp01((y - ys) / bodyPx);
      let col = bodyColour(d);
      // the churn of it: bright and dark folds that stretch along the pool
      const churn = fbm(ux * 3, d * 2.2, seed, { octaves: 3, px: 3 * cols, py: 0 });
      col = [col[0] * (0.82 + 0.36 * churn), col[1] * (0.7 + 0.6 * churn), col[2] * (0.6 + 0.8 * churn)];
      // the crust: plates the colour of coal that float on it (some of them; the rest is open lava), separated by seams that glow orange
      const w = worley(ux * PLATES, d * 2.4, seed + 11, PLATES * cols, 0);
      const seam = 1 - smoothstep(0, 0.2, w.d2 - w.d1);
      const floats = (w.id > 0.38 ? 1 : 0) * smoothstep(0.06, 0.16, d) * (1 - smoothstep(0.6, 0.88, d));
      // a plate is darkest in its middle and lighter, redder, toward its seam
      const rim = mixRgb(CRUST, [0.34, 0.1, 0.05], 1 - smoothstep(0.05, 0.4, w.d2 - w.d1));
      col = mixRgb(col, rim, floats);
      col = mixRgb(col, CRUST_EDGE, seam * floats * 0.85);
      // the crest of the surface: a thin line of white-hot
      const crest = 1 - smoothstep(0, Math.max(1.5, o.ppm * 0.025), y - ys);
      col = mixRgb(col, [1, 0.98, 0.78], crest * 0.85);
      img.data[i] = Math.round(clamp01(col[0]) * 255);
      img.data[i + 1] = Math.round(clamp01(col[1]) * 255);
      img.data[i + 2] = Math.round(clamp01(col[2]) * 255);
      img.data[i + 3] = 255;
    }
  }
  // the bubbles: a ring of light that opens (wrapped at the ends of the strip)
  for (const b of bubbles) {
    const bx = b.u * W;
    const by = surfaceAt(b.u) + b.d * bodyPx;
    for (let y = Math.floor(by - b.r - 1); y <= Math.ceil(by + b.r + 1); y++) {
      for (let x = Math.floor(bx - b.r - 1); x <= Math.ceil(bx + b.r + 1); x++) {
        if (y < 0 || y >= h) continue;
        const xx = ((x % W) + W) % W;
        const dist = Math.hypot(x - bx, y - by);
        const ring = 1 - Math.min(1, Math.abs(dist - b.r) / 1.2);
        if (ring <= 0) continue;
        const i = (y * W + xx) * 4;
        img.data[i] = Math.round(img.data[i]! + (255 - img.data[i]!) * ring * 0.8);
        img.data[i + 1] = Math.round(img.data[i + 1]! + (235 - img.data[i + 1]!) * ring * 0.8);
        img.data[i + 2] = Math.round(img.data[i + 2]! + (160 - img.data[i + 2]!) * ring * 0.6);
      }
    }
  }
  writePixels(s, img);
  return s;
}

/** A column of lava pouring down: bright in the middle, darker and crusted toward its two edges, with streaks that run the length of it and a white-hot spray at its sides. */
export function lavaFall(o: LavaOptions): Surface {
  const { w, h } = o;
  const s = surface(w, h);
  const img = readPixels(s);
  const seed = o.seed * 17 + 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = y / h;
      // the profile of the column: full in the middle, a ragged edge
      const rag = 0.04 * (fbm(v * 9, 0.5, seed, { octaves: 3 }) - 0.5) * 2;
      const edge = Math.abs(u - 0.5) * 2 + rag;
      if (edge >= 1) continue;
      const streak = fbm(u * 6, v * 1.5, seed + 1, { octaves: 3, px: 6, py: 0 });
      const core = 1 - smoothstep(0.1, 0.95, edge);
      let col = bodyColour(0.05 + 0.5 * (1 - core) + 0.25 * (1 - streak));
      col = [col[0] * (0.8 + 0.4 * streak), col[1] * (0.65 + 0.7 * streak), col[2] * (0.55 + 0.9 * streak)];
      const plate = fbm(u * 3, v * 5, seed + 2, { octaves: 3, px: 3, py: 0 });
      const crust = smoothstep(0.64, 0.7, plate) * smoothstep(0.35, 0.8, edge);
      col = mixRgb(col, CRUST, crust * 0.9);
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(clamp01(col[0]) * 255);
      img.data[i + 1] = Math.round(clamp01(col[1]) * 255);
      img.data[i + 2] = Math.round(clamp01(col[2]) * 255);
      img.data[i + 3] = Math.round(255 * (1 - smoothstep(0.9, 1, edge)));
    }
  }
  writePixels(s, img);
  return s;
}
