import type { RgbaImage } from './png';
import { dilate, erode, type Box, type PoseResult } from './poses';

/**
 * THE FIGURE OF A DRAWING ON WHITE, AS A SPRITE (docs/PROMPT16-LOG.md): the second way to take the background off a pose of the user's sheet, for the protagonist's NEW design — a black body, a cape of translucent
 * blue fire whose pale tips fade into the white it was drawn on, detached embers, eyes with white highlights. `extractPose` (poses.ts) was made for the old design (dark and glowing-cyan "sure pixels" grown a few
 * pixels outward, red energy taken away, a floor shadow taken away): on this one it loses the pale tips and every ember that is not touching the figure. This one looks at ONE thing — how far each pixel is from
 * the white it was drawn on — and takes nothing else into account:
 *
 *   • INK is every pixel at least `ink` away from white (the darkest channel is `ink` of the way down from white: 0.12 by default). Nothing is dropped for its colour, its size or its distance to the rest.
 *   • What the ink encloses is the figure — the white highlights of an eye — except a gap the outline closes around (between an antenna and the head: mostly white, ringed by dark, not by glow).
 *   • Two pixels inside the outline the sheet's own pixels are kept exactly (alpha 255, the colour of the sheet): the figure is the sheet's.
 *   • Only the soft edge — the pixels from two inside the outline to three outside it — is solved: each is a mix of the colour of the figure nearby (the closest solid pixel of the figure) and of the white; the mix is the
 *     alpha, and the colour is unmixed so that the pixel, put back over the white, is the pixel of the sheet. So the sprite has no pale fringe, and over the white of the sheet it reproduces the sheet
 *     (`compositeError` measures how well).
 *
 * Nothing is painted, recoloured or moved. What is not the figure (a slash arc, an orb, sparkles, droplets that are effects) is a decision of a person (`erase.json`), not of this function.
 */

export interface MatteOptions {
  /** How far from white (0…1: `1 − darkest channel / 255`) a pixel must be to be ink. */
  ink?: number;
  /** Pixels inside the outline that keep the sheet's colours untouched. */
  core?: number;
  /** Pixels outside the outline in which the soft edge is solved. */
  rim?: number;
}

export const MATTE_DEFAULTS = { ink: 0.12, core: 2, rim: 3 } as const;

const isGlow = (r: number, g: number, b: number): boolean => b >= 150 && g >= 110 && b - r >= 25;

const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * One pose of an opaque sheet drawn on white: the pixels of `box` (inclusive, in the sheet's coordinates) as RGBA, transparent where the white is. The box must leave at least `rim` pixels of white all round the
 * figure (the soft edge is solved only inside it) and must not hold a piece of another pose.
 */
export function extractFigure(sheet: RgbaImage, box: Box, options: MatteOptions = {}): PoseResult {
  const inkAt = options.ink ?? MATTE_DEFAULTS.ink;
  const coreR = options.core ?? MATTE_DEFAULTS.core;
  const rimR = options.rim ?? MATTE_DEFAULTS.rim;
  const x0 = Math.max(0, box.x0);
  const y0 = Math.max(0, box.y0);
  const x1 = Math.min(sheet.width - 1, box.x1);
  const y1 = Math.min(sheet.height - 1, box.y1);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const N = w * h;

  const R = new Uint8Array(N);
  const G = new Uint8Array(N);
  const B = new Uint8Array(N);
  const away = new Float32Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y0 + y) * sheet.width + (x0 + x)) * 4;
      const i = y * w + x;
      R[i] = sheet.data[s]!;
      G[i] = sheet.data[s + 1]!;
      B[i] = sheet.data[s + 2]!;
      away[i] = (255 - Math.min(R[i]!, G[i]!, B[i]!)) / 255;
    }
  }

  // 1 · ink
  const ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (away[i]! >= inkAt) ink[i] = 1;

  // 2 · what the ink encloses: the background is what can be reached from the border without crossing ink; a pocket of what is left is the figure if it is not just white framed by dark
  const outside = new Uint8Array(N);
  const stack: number[] = [];
  const push = (i: number): void => {
    if (!ink[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x));
  for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1));
  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  const solid = new Uint8Array(ink);
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (ink[s] || outside[s] || seen[s]) continue;
    const cells: number[] = [s];
    seen[s] = 1;
    let white = 0;
    let rim = 0;
    let glowRim = 0;
    for (let k = 0; k < cells.length; k++) {
      const p = cells[k]!;
      if (away[p]! < 0.06) white++;
      const x = p % w;
      const y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (ink[q]) {
          rim++;
          if (isGlow(R[q]!, G[q]!, B[q]!)) glowRim++;
        } else if (!outside[q] && !seen[q]) {
          seen[q] = 1;
          cells.push(q);
        }
      }
    }
    const mostlyWhite = white >= cells.length * 0.7;
    if (!mostlyWhite || (rim > 0 && glowRim >= rim * 0.35)) for (const p of cells) solid[p] = 1;
  }

  // 3 · the sheet's own pixels where the figure is solid; the soft edge solved around and inside the outline
  const core = erode(solid, w, h, coreR);
  const reach = dilate(solid, w, h, rimR);
  // the colour of the figure nearby: the closest solid pixel of the figure (core) and the mean of the core within two pixels of it — the colour AT the edge, not the average of what is farther inside (an eye, a line of the suit)
  const coreColour = (cx: number, cy: number): [number, number, number] | null => {
    let bx = -1;
    let by = -1;
    for (const radius of [3, 6, 12, 30]) {
      let best = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= w || !core[ny * w + nx]) continue;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            bx = nx;
            by = ny;
          }
        }
      }
      if (bx >= 0) break;
    }
    if (bx < 0) return null;
    let n = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = bx + dx;
        const ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !core[ny * w + nx]) continue;
        n++;
        r += R[ny * w + nx]!;
        g += G[ny * w + nx]!;
        b += B[ny * w + nx]!;
      }
    }
    return [r / n, g / n, b / n];
  };
  const out = new Uint8Array(N * 4);
  const W: [number, number, number] = [255, 255, 255];
  let solidCount = 0;
  let edge = 0;
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
      if (!reach[i]) continue;
      const F = coreColour(x, y);
      const C: [number, number, number] = [R[i]!, G[i]!, B[i]!];
      let a: number;
      if (F) {
        const dr = F[0] - W[0];
        const dg = F[1] - W[1];
        const db = F[2] - W[2];
        const dd = dr * dr + dg * dg + db * db;
        // a figure of the colour of the white (its own white) has no soft edge to solve: it is the sheet's pixel, opaque
        a = dd > 400 ? ((C[0] - W[0]) * dr + (C[1] - W[1]) * dg + (C[2] - W[2]) * db) / dd : solid[i] ? 1 : 0;
      } else {
        // a speck with no inside of its own and no figure within reach (an ember far from the rest): what is ink is the sheet's pixel, opaque; what is only its soft edge is the least translucent colour that, over the white, is the pixel
        a = solid[i] ? 1 : 1 - Math.min(C[0], C[1], C[2]) / 255;
      }
      // never less than what puts the pixel back over the white exactly (an unmixed channel below zero would be clamped)
      a = Math.max(a, away[i]!);
      a = Math.min(1, a);
      if (a < 0.04) continue;
      out[o] = clamp8((C[0] - (1 - a) * W[0]) / a);
      out[o + 1] = clamp8((C[1] - (1 - a) * W[1]) / a);
      out[o + 2] = clamp8((C[2] - (1 - a) * W[2]) / a);
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
    stats: { solid: solidCount, edge, pieces: 1, droppedPieces: 0 },
  };
}

/**
 * How well the extracted pose, put back over white, is the sheet: over the pixels of the box that are ink in the sheet, the share whose composite differs from the sheet's pixel by more than `tolerance` levels in
 * any channel, and the biggest difference. The proof that the extraction is only a change of background.
 */
export function compositeError(sheet: RgbaImage, box: Box, pose: RgbaImage, tolerance = 12): { ink: number; differing: number; share: number; worst: number } {
  const x0 = Math.max(0, box.x0);
  const y0 = Math.max(0, box.y0);
  let ink = 0;
  let differing = 0;
  let worst = 0;
  for (let y = 0; y < pose.height; y++) {
    for (let x = 0; x < pose.width; x++) {
      const s = ((y0 + y) * sheet.width + (x0 + x)) * 4;
      const o = (y * pose.width + x) * 4;
      const a = pose.data[o + 3]! / 255;
      let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(pose.data[o + c]! * a + 255 * (1 - a) - sheet.data[s + c]!));
      worst = Math.max(worst, d);
      if (255 - Math.min(sheet.data[s]!, sheet.data[s + 1]!, sheet.data[s + 2]!) >= 255 * MATTE_DEFAULTS.ink) {
        ink++;
        if (d > tolerance) differing++;
      }
    }
  }
  return { ink, differing, share: ink === 0 ? 0 : differing / ink, worst };
}
