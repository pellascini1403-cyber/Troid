import type { RgbaImage } from './png';

/**
 * THE POSES OF THE USER'S SHEET, AS SPRITES (docs/ART-PIPELINE-2D.md, part L): the protagonist's art the user handed over is a concept sheet — one pose per action on a
 * near-white background, soft ground shadows, speed lines, dust and red energy drawn around the figure. This turns one pose into a sprite frame with ONLY technical operations:
 *
 *   • a transparent background (an alpha channel where there was white), found by looking at the picture: nothing is painted, redrawn, recoloured or smoothed;
 *   • the figure's own pixels — its colours, its glows, its outline — are the sheet's, bit for bit, wherever the figure is solid; only the one-pixel soft edge is unmixed
 *     from the white it was drawn on (so it does not carry a white fringe);
 *   • what is not the figure is left out: the ground shadow, the speed lines, the dust, and the RED energy (a different layer of the drawing: the game draws its own effects).
 *
 * Nothing is resampled or moved here; placing a pose on the frame canvas is an integer translation (`placePose`). The decisions that are a person's (which rectangle is a
 * pose, which smudges are not the figure) are DATA (`art/player/source/hero.poses.json`), reviewed by looking at the result in `?lab=player`.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PoseOptions {
  /** Rectangles of the sheet (inclusive) that are never the figure: another pose's effect that reaches in, dust, speed lines. */
  exclude?: Box[];
  /** The darkest a pixel is to be sure it is the figure (luminance 0…255; default 100). */
  seedLum?: number;
  /** How far toward white a pixel may be, grown from a sure pixel, and still be the figure (`255 − min channel`; default 125). */
  growDistance?: number;
  /** How many pixels the growth reaches from a sure pixel (default 4). */
  growSteps?: number;
  /** Red energy is not the figure (default true). */
  dropRed?: boolean;
  /** Pieces of the figure smaller than this fraction of its largest piece, and apart from it, are not the figure (default 0.12). */
  minPiece?: number;
}

export interface PoseResult {
  /** RGBA, the size of the box: alpha 0 outside the figure, the figure's colours inside. */
  image: RgbaImage;
  /** The smallest rectangle (inclusive, in the box's own coordinates) holding any alpha, or `null` when nothing was found. */
  bounds: Box | null;
  stats: { solid: number; edge: number; pieces: number; droppedPieces: number };
}

const isRed = (r: number, g: number, b: number): boolean => r >= 90 && r > g + 35 && r > b + 25;
/** Light blue-white of the figure's eyes and glowing lines. */
const isGlow = (r: number, g: number, b: number): boolean => b >= 170 && g >= 130 && b - r >= 45 && r <= 200;

const inside = (b: Box, x: number, y: number): boolean => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/**
 * The whole of the operation for one pose. `sheet` is the user's image (RGB or RGBA), `box` the rectangle of the pose.
 *
 * 1. Sure pixels: dark (the figure is black and navy) or glowing cyan, and not red, not excluded.
 * 2. They grow a few pixels into anything that is not close to white: the figure's soft outline.
 * 3. Pieces: what is not touching the figure's largest piece (a speed line, a fleck) is not the figure.
 * 4. What the figure encloses is the figure (the white highlights of its eyes).
 * 5. The soft edge: each pixel on the rim is a mix of the figure and what was behind it (white, or the grey of the shadow); its coverage is solved and the colour unmixed.
 */
export function extractPose(sheet: RgbaImage, box: Box, options: PoseOptions = {}): PoseResult {
  const x0 = Math.max(0, box.x0);
  const y0 = Math.max(0, box.y0);
  const x1 = Math.min(sheet.width - 1, box.x1);
  const y1 = Math.min(sheet.height - 1, box.y1);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const seedLum = options.seedLum ?? 100;
  const growDistance = options.growDistance ?? 125;
  const growSteps = options.growSteps ?? 4;
  const dropRed = options.dropRed ?? true;
  const minPiece = options.minPiece ?? 0.12;
  const exclude = options.exclude ?? [];
  const N = w * h;

  const R = new Uint8Array(N);
  const G = new Uint8Array(N);
  const B = new Uint8Array(N);
  const banned = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y0 + y) * sheet.width + (x0 + x)) * 4;
      const i = y * w + x;
      R[i] = sheet.data[s]!;
      G[i] = sheet.data[s + 1]!;
      B[i] = sheet.data[s + 2]!;
      for (const e of exclude) if (inside(e, x0 + x, y0 + y)) banned[i] = 1;
    }
  }
  const red = (i: number): boolean => dropRed && isRed(R[i]!, G[i]!, B[i]!);
  const lum = (i: number): number => 0.299 * R[i]! + 0.587 * G[i]! + 0.114 * B[i]!;
  const dist = (i: number): number => 255 - Math.min(R[i]!, G[i]!, B[i]!);

  // the ground shadow: everything light and grey from one row above the lowest dark pixel down is the floor, not the figure
  let lowest = -1;
  for (let i = N - 1; i >= 0 && lowest < 0; i--) if (!banned[i] && !red(i) && lum(i) <= 70) lowest = (i / w) | 0;
  if (lowest >= 0) {
    for (let y = lowest; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (lum(i) >= 105 && Math.max(R[i]!, G[i]!, B[i]!) - Math.min(R[i]!, G[i]!, B[i]!) <= 50) banned[i] = 1;
      }
    }
  }

  // 1 · sure pixels
  const solid = new Uint8Array(N);
  const frontier: number[] = [];
  for (let i = 0; i < N; i++) {
    if (banned[i] || red(i)) continue;
    if (lum(i) <= seedLum || isGlow(R[i]!, G[i]!, B[i]!)) {
      solid[i] = 1;
      frontier.push(i);
    }
  }
  // 2 · growth into the soft outline
  let wave = frontier;
  for (let step = 0; step < growSteps && wave.length > 0; step++) {
    const next: number[] = [];
    for (const i of wave) {
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (solid[j] || banned[j] || red(j) || dist(j) < growDistance) continue;
          solid[j] = 1;
          next.push(j);
        }
      }
    }
    wave = next;
  }

  // red energy is a different layer, but the figure's own edge may glow red (the rim of a blade): red that touches the figure, two pixels deep, stays with it
  if (dropRed) {
    const touching = dilate(solid, w, h, 2);
    for (let i = 0; i < N; i++) if (!solid[i] && touching[i] && !banned[i] && red(i) && dist(i) >= 70) solid[i] = 1;
  }

  // 3 · pieces (8-connected, bridging gaps of two pixels so an antenna and its tip are one piece)
  const near = dilate(solid, w, h, 2);
  const label = new Int32Array(N).fill(-1);
  const pieceSolid: number[] = [];
  for (let s = 0; s < N; s++) {
    if (!near[s] || label[s] !== -1) continue;
    const id = pieceSolid.length;
    pieceSolid.push(0);
    const stack = [s];
    label[s] = id;
    while (stack.length > 0) {
      const p = stack.pop()!;
      if (solid[p]) pieceSolid[id]!++;
      const x = p % w;
      const y = (p / w) | 0;
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
  }
  const biggest = Math.max(0, ...pieceSolid);
  let dropped = 0;
  const keep = pieceSolid.map((n) => n >= biggest * minPiece && n > 0);
  for (let i = 0; i < N; i++) {
    if (solid[i] && !keep[label[i]!]) {
      solid[i] = 0;
    }
  }
  for (const k of keep) if (!k) dropped++;

  // 4 · what the figure encloses is the figure: fill from the outside, whatever the outside cannot reach is inside
  const outside = new Uint8Array(N);
  const stack: number[] = [];
  const push = (i: number): void => {
    if (!solid[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  // …except white that is merely a gap the figure closes around (between an antenna and the head): only a hole ringed by glowing colour (a highlight in an eye) is the figure
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (solid[s] || outside[s] || banned[s] || seen[s]) continue;
    const cells: number[] = [s];
    seen[s] = 1;
    let white = 0;
    let glowRim = 0;
    let rim = 0;
    for (let k = 0; k < cells.length; k++) {
      const p = cells[k]!;
      if (dist(p) <= 50) white++;
      const x = p % w;
      const y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (solid[q]) {
          rim++;
          if (isGlow(R[q]!, G[q]!, B[q]!)) glowRim++;
        } else if (!outside[q] && !banned[q] && !seen[q]) {
          seen[q] = 1;
          cells.push(q);
        }
      }
    }
    const mostlyWhite = white >= cells.length * 0.7;
    if (!mostlyWhite || (rim > 0 && glowRim >= rim * 0.35)) for (const p of cells) solid[p] = 1;
  }

  // 5 · the soft edge. `core` is two pixels in from the outline: sure; `rim` is the band between the core and three pixels out: mixed.
  const core = erode(solid, w, h, 2);
  const reach = dilate(solid, w, h, 3);
  const out = new Uint8Array(N * 4);
  let edge = 0;
  let solidCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (core[i]) {
        out[o] = R[i]!;
        out[o + 1] = G[i]!;
        out[o + 2] = B[i]!;
        out[o + 3] = 255;
        solidCount++;
        continue;
      }
      if (!reach[i] || banned[i] || (red(i) && !solid[i])) continue;
      // the faint pink haze around red energy is that energy, not an edge of the figure
      if (dropRed && !solid[i] && R[i]! - G[i]! >= 14 && R[i]! - B[i]! >= 10 && dist(i) < 100) continue;
      // the rim: the figure's colour is that of the core nearby, the background's that of what is clear of the figure nearby
      const f = nearbyColour(R, G, B, w, h, x, y, 6, (j) => core[j] === 1);
      const bg = nearbyColour(R, G, B, w, h, x, y, 8, (j) => reach[j] === 0 && !red(j));
      const F = f ?? [20, 25, 40];
      const Bg = bg ?? [255, 255, 255];
      const dr = F[0] - Bg[0];
      const dg = F[1] - Bg[1];
      const db = F[2] - Bg[2];
      const dd = dr * dr + dg * dg + db * db;
      let a = dd > 400 ? ((R[i]! - Bg[0]) * dr + (G[i]! - Bg[1]) * dg + (B[i]! - Bg[2]) * db) / dd : solid[i] ? 1 : 0;
      a = Math.max(0, Math.min(1, a));
      if (a < 0.04) continue;
      // un-mix: the colour that, over the background, gives the pixel seen
      const cr = (R[i]! - (1 - a) * Bg[0]) / a;
      const cg = (G[i]! - (1 - a) * Bg[1]) / a;
      const cb = (B[i]! - (1 - a) * Bg[2]) / a;
      out[o] = clamp8(cr);
      out[o + 1] = clamp8(cg);
      out[o + 2] = clamp8(cb);
      out[o + 3] = Math.round(a * 255);
      edge++;
    }
  }

  let bx0 = w;
  let by0 = h;
  let bx1 = -1;
  let by1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (out[(y * w + x) * 4 + 3]! > 0) {
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
  }
  return {
    image: { width: w, height: h, data: out },
    bounds: bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1, y1: by1 },
    stats: { solid: solidCount, edge, pieces: pieceSolid.length - dropped, droppedPieces: dropped },
  };
}

const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** The mean colour of the pixels within `radius` of (x, y) that `want` accepts, or `null` when there are none. */
function nearbyColour(R: Uint8Array, G: Uint8Array, B: Uint8Array, w: number, h: number, x: number, y: number, radius: number, want: (i: number) => boolean): [number, number, number] | null {
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= h) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      if (nx < 0 || nx >= w || dx * dx + dy * dy > radius * radius) continue;
      const j = ny * w + nx;
      if (!want(j)) continue;
      n++;
      r += R[j]!;
      g += G[j]!;
      b += B[j]!;
    }
  }
  return n === 0 ? null : [r / n, g / n, b / n];
}

/** A square structuring element of radius `r` (separable running max). */
export function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (src[row + x]) last = x;
      if (x - last <= r) tmp[row + x] = 1;
    }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (src[row + x]) last = x;
      if (last - x <= r) tmp[row + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y;
      if (y - last <= r) out[y * w + x] = 1;
    }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) last = y;
      if (last - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

/** The pixels that stay set when every neighbour within `r` (square) is set: the dual of `dilate`. */
export function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = src[i] ? 0 : 1;
  // the border counts as empty: a figure touching the edge of the box has a rim there too
  const grown = dilate(inv, w, h, r);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (src[i] && !grown[i] && x >= r && y >= r && x < w - r && y < h - r) out[i] = 1;
    }
  }
  return out;
}

/**
 * Puts a pose on the frame canvas so that the point `at` of the pose (its feet, or where they would be) lands on `to` of the canvas: an integer translation, nothing resampled.
 * What falls outside the canvas is reported, not cropped silently.
 */
export function placePose(pose: RgbaImage, at: { x: number; y: number }, canvas: { width: number; height: number }, to: { x: number; y: number }): { image: RgbaImage; clipped: number } {
  const out = new Uint8Array(canvas.width * canvas.height * 4);
  const ox = Math.round(to.x - at.x);
  const oy = Math.round(to.y - at.y);
  let clipped = 0;
  for (let y = 0; y < pose.height; y++) {
    for (let x = 0; x < pose.width; x++) {
      const s = (y * pose.width + x) * 4;
      if (pose.data[s + 3] === 0) continue;
      const cx = x + ox;
      const cy = y + oy;
      if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) {
        clipped++;
        continue;
      }
      const d = (cy * canvas.width + cx) * 4;
      out[d] = pose.data[s]!;
      out[d + 1] = pose.data[s + 1]!;
      out[d + 2] = pose.data[s + 2]!;
      out[d + 3] = pose.data[s + 3]!;
    }
  }
  return { image: { width: canvas.width, height: canvas.height, data: out }, clipped };
}

/** The mirror image, left to right: a rigid operation that moves pixels and changes none. For a pose the sheet drew facing left (the contract wants the art facing right). */
export function flipX(img: RgbaImage): RgbaImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const s = (y * img.width + x) * 4;
      const d = (y * img.width + (img.width - 1 - x)) * 4;
      out[d] = img.data[s]!;
      out[d + 1] = img.data[s + 1]!;
      out[d + 2] = img.data[s + 2]!;
      out[d + 3] = img.data[s + 3]!;
    }
  }
  return { width: img.width, height: img.height, data: out };
}
