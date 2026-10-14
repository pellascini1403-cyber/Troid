import type { RgbaImage } from './png';
import { dilate, erode, type Box } from './poses';

/**
 * WHAT CAN BE MEASURED OF A FIGURE (docs/PROMPT10-LOG.md): the pure analysis the reception of new drawings (`intake.ts`) stands on — where the eye is and how big, where the feet and the body's
 * centre of mass are, and the handful of numbers that tell a clean cut-out from a dirty one (a pale fringe at the edge, loose bits, red where the character has none).
 *
 * Nothing here changes a pixel and nothing here is art: it only LOOKS at an image. Every threshold was calibrated against the 114 frames the game already has (`tests/unit/tools/figure.test.ts`
 * pins them), so "clean" means "as clean as the frames the user already accepted".
 */

/** Pixels with at least this alpha are the figure (below it is a soft edge). */
export const SOLID = 128;


/** The smallest rectangle (inclusive) holding any pixel with alpha ≥ `minAlpha`, or `null` for an empty image. */
export function boundsOf(img: RgbaImage, minAlpha = 8): Box | null {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! < minAlpha) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export interface Labels {
  label: Int32Array;
  /** Pixels of each component (of `mask`, not of any bridge used to join them). */
  areas: number[];
  boxes: Box[];
}

/** Connected components of `mask`. With `bridge` > 0, pieces within that many pixels of each other are ONE component (an antenna and its tip, a sword and the hand that holds it). */
export function components(mask: Uint8Array, w: number, h: number, bridge = 0): Labels {
  const near = bridge > 0 ? dilate(mask, w, h, bridge) : mask;
  const label = new Int32Array(w * h).fill(-1);
  const areas: number[] = [];
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!near[s] || label[s] !== -1) continue;
    const id = areas.length;
    areas.push(0);
    const box: Box = { x0: w, y0: h, x1: -1, y1: -1 };
    label[s] = id;
    stack.push(s);
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      if (mask[p]) {
        areas[id]!++;
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (near[q] && label[q] === -1) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
    }
    boxes.push(box);
  }
  return { label, areas, boxes };
}

const solidMask = (img: RgbaImage, minAlpha = SOLID): Uint8Array => {
  const m = new Uint8Array(img.width * img.height);
  for (let i = 0; i < m.length; i++) if (img.data[i * 4 + 3]! >= minAlpha) m[i] = 1;
  return m;
};

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the eye

export interface EyeReading {
  /** The diameter of the circle with the eye's area, in the image's own pixels. */
  diameter: number;
  cx: number;
  cy: number;
  /** How much of its bounding box the eye fills (a circle: 0.785; a crescent: less). */
  fill: number;
}

/** Light blue or cyan: the rim and the fill of an eye, the glowing lines of the armour. */
const isGlow = (r: number, g: number, b: number): boolean => b >= 150 && g >= 120 && b - r >= 25;
const isWhite = (r: number, g: number, b: number): boolean => r >= 215 && g >= 215 && b >= 215;

/**
 * The near eye: the biggest compact blob of glowing blue-and-white pixels that holds a white highlight. The armour's glowing lines are thin, so a morphological opening (erode then dilate)
 * whose radius follows the figure's size removes them and keeps the eyes; the highlights of the eye (white) are part of the blob. `null` when no eye can be measured (turned away, dimmed,
 * or not the character). It is the one thing every pose of this character carries at a size that does not depend on the pose, so it is what a sheet is scaled by.
 */
export function eyeDiameter(img: RgbaImage): EyeReading | null {
  const { width: w, height: h, data } = img;
  const b = boundsOf(img, SOLID);
  if (!b) return null;
  const figureH = b.y1 - b.y0 + 1;
  const r = Math.max(1, Math.round(figureH / 70));
  const mask = new Uint8Array(w * h);
  const white = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3]! < 160) continue;
    const R = data[i * 4]!;
    const G = data[i * 4 + 1]!;
    const B = data[i * 4 + 2]!;
    if (isWhite(R, G, B)) {
      mask[i] = 1;
      white[i] = 1;
    } else if (isGlow(R, G, B)) mask[i] = 1;
  }
  const opened = dilate(erode(mask, w, h, r), w, h, r);
  for (let i = 0; i < opened.length; i++) if (!mask[i]) opened[i] = 0;
  // 4-connected blobs of the opened mask
  const seen = new Uint8Array(w * h);
  const minArea = (figureH / 16) ** 2;
  let best: EyeReading | null = null;
  let bestArea = 0;
  for (let s = 0; s < w * h; s++) {
    if (!opened[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let area = 0;
    let whites = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let sx = 0;
    let sy = 0;
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p / w) | 0;
      area++;
      if (white[p]) whites++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && opened[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), stack.push(p - 1);
      if (x < w - 1 && opened[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), stack.push(p + 1);
      if (y > 0 && opened[p - w] && !seen[p - w]) (seen[p - w] = 1), stack.push(p - w);
      if (y < h - 1 && opened[p + w] && !seen[p + w]) (seen[p + w] = 1), stack.push(p + w);
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const fill = area / (bw * bh);
    const aspect = bw / bh;
    // an eye is compact, roughly round, and holds a highlight; a glow, a line or a blade edge is none of these
    if (area < minArea || fill < 0.55 || aspect < 0.55 || aspect > 1.8 || whites < area * 0.012) continue;
    if (area > bestArea) {
      bestArea = area;
      best = { diameter: 2 * Math.sqrt(area / Math.PI), cx: sx / area, cy: sy / area, fill };
    }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the body

export interface Body {
  /** Pixels of the figure that are not thin parts (antennae, blade, speed of a cape): the torso, head, limbs. */
  mask: Uint8Array;
  area: number;
  /** The centre of mass of the body, in the image's pixels. */
  cx: number;
  cy: number;
  /** The lowest row the body reaches. */
  bottom: number;
  /** The middle of the lowest band of the body: where the feet are, horizontally. */
  feetX: number;
}

/**
 * The body without its thin parts: the figure's solid pixels eroded by `thin` pixels and grown back (an opening), keeping the largest piece. The centre of mass of that — and not of the
 * whole figure, whose long sword would drag it — is what stays put from one pose to the next.
 */
export function bodyOf(img: RgbaImage, thin: number): Body | null {
  const { width: w, height: h } = img;
  const solid = solidMask(img);
  const opened = dilate(erode(solid, w, h, thin), w, h, thin);
  for (let i = 0; i < opened.length; i++) if (!solid[i]) opened[i] = 0;
  const lab = components(opened, w, h);
  let id = -1;
  let big = 0;
  lab.areas.forEach((a, k) => {
    if (a > big) {
      big = a;
      id = k;
    }
  });
  // a figure all of thin parts: fall back to every solid pixel
  const mask = new Uint8Array(w * h);
  if (id >= 0) for (let i = 0; i < mask.length; i++) mask[i] = opened[i] && lab.label[i] === id ? 1 : 0;
  else mask.set(solid);
  let area = 0;
  let sx = 0;
  let sy = 0;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      area++;
      sx += x;
      sy += y;
      if (y > bottom) bottom = y;
    }
  }
  if (area === 0) return null;
  let fx0 = w;
  let fx1 = -1;
  const band = Math.max(3, Math.round(thin * 1.5));
  for (let y = Math.max(0, bottom - band + 1); y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < fx0) fx0 = x;
      if (x > fx1) fx1 = x;
    }
  }
  return { mask, area, cx: sx / area, cy: sy / area, bottom, feetX: (fx0 + fx1) / 2 };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ cleanliness

export interface Cleanliness {
  /** Pixels with any alpha (≥ 8). */
  covered: number;
  /** Solid pixels (alpha ≥ 128). */
  solid: number;
  /** Of the soft-edge pixels (alpha 16…239), the share that are PALE and grey — the fringe of the white a figure was cut from. A clean edge of this character is dark or glowing blue. */
  paleEdge: number;
  /** The share of the figure that is NOT in the biggest piece (pieces within 2 px of each other are one): loose specks, a second figure, an effect left in. */
  loose: number;
  /** The share of solid pixels that are the red of an effect (the character has none; its sword has a thin dark-red edge). */
  red: number;
  /** The share of solid pixels whose colour is neither dark, nor blue/cyan, nor white-grey: yellow, green, orange, skin tones. */
  foreign: number;
}

const isEffectRed = (r: number, g: number, b: number): boolean => r >= 120 && r > g + 50 && r > b + 50;

/** Foreign: bright enough to be a colour and saturated, but not blue — the character is black, navy, cyan and white. */
const isForeign = (r: number, g: number, b: number): boolean => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx >= 110 && mx - mn >= 40 && b < r + 10 && b < g + 10;
};

export function cleanliness(img: RgbaImage): Cleanliness {
  const { width: w, height: h, data } = img;
  let covered = 0;
  let solid = 0;
  let edge = 0;
  let pale = 0;
  let red = 0;
  let foreign = 0;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3]!;
    if (a < 8) continue;
    covered++;
    m[i] = 1;
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    if (a >= SOLID) {
      solid++;
      if (isEffectRed(r, g, b)) red++;
      else if (isForeign(r, g, b)) foreign++;
    }
    if (a >= 16 && a < 240) {
      edge++;
      if (Math.min(r, g, b) >= 190 && Math.max(r, g, b) - Math.min(r, g, b) <= 30) pale++;
    }
  }
  const lab = components(m, w, h, 2);
  const total = lab.areas.reduce((s, a) => s + a, 0);
  const biggest = Math.max(0, ...lab.areas);
  return {
    covered,
    solid,
    paleEdge: edge === 0 ? 0 : pale / edge,
    loose: total === 0 ? 0 : (total - biggest) / total,
    red: solid === 0 ? 0 : red / solid,
    foreign: solid === 0 ? 0 : foreign / solid,
  };
}


