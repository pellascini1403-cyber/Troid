import { fbm, worley } from './noise';
import { clamp01, ramp, smoothstep, type Rgb } from './color';
import { makeField } from './field';
import { Rng } from './rng';
import type { Layers } from './light';

/**
 * Ancient stonework as a PERIODIC texture — dressed courses or cyclopean polygons, mortar, chips, water stains, cracks, moss and a little energy seeping out of
 * the deepest cracks — wrapping at the edges so the picture tiles in both directions. The result is an albedo, a height (in pixels) and an emissive, not lit
 * pixels: `shade` lights it.
 */
export interface StoneOptions {
  w: number;
  h: number;
  ppm: number;
  seed: number;
  /** `courses`: rows of dressed blocks. `cyclopean`: big irregular polygons fitted together. */
  style: 'courses' | 'cyclopean';
  /** courses: block height and width ranges, metres. cyclopean: the first number is the average stone size. */
  courseM: readonly [number, number];
  blockM: readonly [number, number];
  /** Width of the mortar joint, metres. */
  jointM: number;
  /** 0..1 */
  moss: number;
  cracks: number;
  stains: number;
  /** How much cyan light the cracks give out (0 = none). */
  energy: number;
  stone: (v: number) => Rgb;
  mossRamp: (v: number) => Rgb;
  /** Base value of the stone (0..1) and how much it varies from block to block. */
  tone: number;
  toneSpread: number;
}

/** What a texture is made of at one pixel: how far it is from the nearest joint, and the stone it belongs to. */
interface Cell {
  /** Pixels to the nearest joint (a little irregular). */
  de: number;
  /** A stable random number in [0, 1) for the stone. */
  id: number;
  /** Pixels from the top of the stone, for the moss. */
  dt: number;
  /** Local coordinates from the stone's centre (px), for the tilt of its face. */
  lx: number;
  ly: number;
}

/** A periodic noise sampled in pixels: `cells` lattice cells across the width of the texture, the same density down it. */
function sampler(o: { w: number; h: number }, cells: number, seed: number, octaves = 4): (x: number, y: number) => number {
  const cx = Math.max(1, Math.round(cells));
  const cy = Math.max(1, Math.round((cells * o.h) / o.w));
  return (x, y) => fbm((x / o.w) * cx, (y / o.h) * cy, seed, { octaves, px: cx, py: cy });
}

interface Course {
  y0: number;
  y1: number;
  offset: number;
  cum: number[];
  widths: number[];
  ids: number[];
}

function layoutCourses(o: StoneOptions, rng: Rng): Course[] {
  const { w, h, ppm } = o;
  const courses: Course[] = [];
  let y = 0;
  while (y < h - 1) {
    let ch = rng.range(o.courseM[0], o.courseM[1]) * ppm;
    if (h - (y + ch) < o.courseM[0] * ppm * 0.7) ch = h - y; // the last course takes what is left
    const y1 = Math.min(h, y + ch);
    const widths: number[] = [];
    let sum = 0;
    while (sum < w - 1) {
      let bw = rng.range(o.blockM[0], o.blockM[1]) * ppm;
      if (w - (sum + bw) < o.blockM[0] * ppm * 0.7) bw = w - sum;
      widths.push(bw);
      sum += bw;
    }
    const scale = w / sum;
    for (let i = 0; i < widths.length; i++) widths[i]! *= scale;
    const cum: number[] = [];
    let c = 0;
    for (const bw of widths) {
      cum.push(c);
      c += bw;
    }
    courses.push({ y0: y, y1, offset: rng.range(0, w), cum, widths, ids: widths.map(() => rng.next()) });
    y = y1;
  }
  return courses;
}

function coursesCells(o: StoneOptions, rng: Rng): (x: number, y: number) => Cell {
  const { w, h } = o;
  const courses = layoutCourses(o, rng.fork('courses'));
  const rowOf = new Int32Array(h);
  courses.forEach((c, i) => {
    for (let y = Math.floor(c.y0); y < Math.min(h, Math.ceil(c.y1)); y++) rowOf[y] = i;
  });
  return (x, y) => {
    const course = courses[rowOf[y]!]!;
    const px = (((x - course.offset) % w) + w) % w;
    let lo = 0;
    let hi = course.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (course.cum[mid]! <= px) lo = mid;
      else hi = mid - 1;
    }
    const dl = px - course.cum[lo]!;
    const dr = course.cum[lo]! + course.widths[lo]! - px;
    const dt = y - course.y0;
    const db = course.y1 - y;
    return { de: Math.min(dl, dr, dt, db), id: course.ids[lo]!, dt, lx: dl - course.widths[lo]! / 2, ly: dt - (course.y1 - course.y0) / 2 };
  };
}

function cyclopeanCells(o: StoneOptions): (x: number, y: number) => Cell {
  const { w, h, ppm } = o;
  const size = o.courseM[0] * ppm;
  const cx = Math.max(2, Math.round(w / size));
  const cy = Math.max(2, Math.round(h / size));
  const warpX = sampler(o, w / (ppm * 1.2), o.seed + 71, 3);
  const warpY = sampler(o, w / (ppm * 1.2), o.seed + 73, 3);
  const cellW = w / cx;
  const cellH = h / cy;
  return (x, y) => {
    const wx = x + (warpX(x, y) - 0.5) * ppm * 0.34;
    const wy = y + (warpY(x, y) - 0.5) * ppm * 0.34;
    const c = worley((wx / w) * cx, (wy / h) * cy, o.seed + 79, cx, cy);
    // (d2 − d1) / 2 is the distance to the line half way between two stones, in cell units
    const de = ((c.d2 - c.d1) / 2) * Math.min(cellW, cellH) * 1.6;
    return { de, id: c.id, dt: c.d1 * cellH * 0.9, lx: 0, ly: 0 };
  };
}

export function stone(o: StoneOptions): Layers {
  const { w, h, ppm } = o;
  const rng = new Rng(o.seed);
  const cellAt = o.style === 'courses' ? coursesCells(o, rng) : cyclopeanCells(o);

  const chipN = sampler(o, w / (ppm * 0.5), o.seed + 11, 3);
  const faceN = sampler(o, w / (ppm * 0.18), o.seed + 23, 4);
  const toneN = sampler(o, w / (ppm * 1.6), o.seed + 37, 3);
  const patchN = sampler(o, w / (ppm * 3.2), o.seed + 43, 3);
  const stainCells = Math.max(1, Math.round(w / (ppm * 0.35)));
  const stainN = (x: number, y: number): number => fbm((x / w) * stainCells, (y / h) * 2, o.seed + 41, { octaves: 3, px: stainCells, py: 2 });
  const mossN = sampler(o, w / (ppm * 1.1), o.seed + 53, 4);
  const mossFine = sampler(o, w / (ppm * 0.12), o.seed + 59, 3);
  const crackCells = Math.max(2, Math.round(w / (ppm * 0.9)));
  const crackRows = Math.max(1, Math.round((crackCells * h) / w));

  const height = makeField(w, h);
  const albedo = new Float32Array(w * h * 3);
  const emissive = new Float32Array(w * h * 3);
  const jointPx = Math.max(2, o.jointM * ppm);
  const bevelPx = Math.max(3, ppm * 0.07);
  const mossAmount = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = cellAt(x, y);
      const chip = (chipN(x, y) - 0.5) * ppm * 0.16;
      const de = cell.de + chip;
      const i = y * w + x;
      const face = faceN(x, y);
      if (de < jointPx * 0.5) {
        // mortar: low and dark
        height.d[i] = -2.8 + face * 1.2;
        const c = o.stone(0.03 + face * 0.05);
        albedo[i * 3] = c[0];
        albedo[i * 3 + 1] = c[1];
        albedo[i * 3 + 2] = c[2];
        mossAmount[i] = 0.4 * smoothstep(0.35, 0.7, mossN(x, y));
        continue;
      }
      const rise = smoothstep(0, bevelPx, de - jointPx * 0.5);
      const lift = (cell.id - 0.5) * 1.8;
      height.d[i] = lift + 3.2 * Math.sin(rise * Math.PI * 0.5) + (face - 0.5) * 1.8 + (cell.id - 0.5) * 0.01 * (cell.lx + cell.ly);
      let v = o.tone + (cell.id - 0.5) * 2 * o.toneSpread + (toneN(x, y) - 0.5) * 0.2 + (face - 0.5) * 0.1;
      // big dark patches of grime, and water stains: long vertical streaks
      v -= (smoothstep(0.55, 0.8, patchN(x, y)) * 0.1);
      v -= o.stains * smoothstep(0.55, 0.8, stainN(x, y)) * 0.12;
      v += (1 - rise) * 0.04;
      const c = o.stone(clamp01(v));
      albedo[i * 3] = c[0];
      albedo[i * 3 + 1] = c[1];
      albedo[i * 3 + 2] = c[2];
      // cracks: the thin edge between two cells of a cellular noise, on a few stones only
      if (cell.id < 0.18 + 0.3 * o.cracks) {
        const cr = worley((x / w) * crackCells, (y / h) * crackRows, o.seed + 67, crackCells, crackRows);
        const line = 1 - smoothstep(0.0, 0.06, cr.d2 - cr.d1);
        if (line > 0) {
          const f = line * 0.85;
          height.d[i] = height.d[i]! - 2.4 * f;
          for (let k = 0; k < 3; k++) albedo[i * 3 + k] = albedo[i * 3 + k]! * (1 - 0.75 * f);
          if (o.energy > 0 && cell.id < 0.03 + 0.05 * o.energy) {
            // a little light in the deepest cracks
            emissive[i * 3] = 0.05 * f * o.energy;
            emissive[i * 3 + 1] = 0.36 * f * o.energy;
            emissive[i * 3 + 2] = 0.46 * f * o.energy;
          }
        }
      }
      // moss lives on the upper faces and in the low places along the joints
      const nearJoint = 1 - smoothstep(0, ppm * 0.18, de);
      const top = 1 - smoothstep(0, ppm * 0.4, cell.dt);
      const m = smoothstep(0.52 - 0.18 * o.moss, 0.78 - 0.18 * o.moss, mossN(x, y)) * (0.45 + 0.4 * nearJoint + 0.55 * top);
      mossAmount[i] = clamp01(m * (0.6 + 0.8 * mossFine(x, y))) * o.moss * 1.4;
    }
  }

  // moss over the stone: its own colour and a little height
  for (let i = 0; i < w * h; i++) {
    const m = clamp01(mossAmount[i]!);
    if (m < 0.02) continue;
    const mc = o.mossRamp(0.3 + 0.55 * (1 - m));
    for (let k = 0; k < 3; k++) albedo[i * 3 + k] = albedo[i * 3 + k]! + (mc[k]! - albedo[i * 3 + k]!) * m;
    height.d[i] = height.d[i]! + m * 1.0;
  }
  return { w, h, albedo, height, emissive };
}

/** The palette of the ruins: a cold, grey-blue stone and a dark teal moss. One place, so every piece of scenery is graded alike. */
export const STONE = ramp([
  { at: 0.0, colour: [0.01, 0.018, 0.03] },
  { at: 0.25, colour: [0.035, 0.06, 0.085] },
  { at: 0.5, colour: [0.095, 0.15, 0.2] },
  { at: 0.75, colour: [0.21, 0.31, 0.38] },
  { at: 1.0, colour: [0.5, 0.66, 0.74] },
]);
export const MOSS = ramp([
  { at: 0.0, colour: [0.03, 0.085, 0.09] },
  { at: 0.5, colour: [0.07, 0.21, 0.21] },
  { at: 1.0, colour: [0.17, 0.4, 0.38] },
]);
