import { boundsOf, bodyOf, cleanliness, components, eyeDiameter, headDiameter, isDark, SOLID, type Body, type Cleanliness } from './figure';
import { extractFigure, type MatteOptions } from './matte';
import { median } from './heroRepo';
import type { ClipRequest } from './kit';
import type { RgbaImage } from './png';
import { dilate, extractPose, placePose, type Box } from './poses';
import { renderFrame, toDrawing } from './warp';

/**
 * THE RECEPTION OF THE PROTAGONIST'S NEW DRAWINGS (docs/PROMPT10-LOG.md), the pure half: from a sheet (or a handful of PNGs) a generator or an artist handed back to the frames the pipeline
 * takes, and the judgement of each. TECHNICAL OPERATIONS ONLY, as in `poses.ts`: the background becomes transparent where the picture says it is background, the whole sheet is scaled by ONE
 * factor and every pose is moved by a translation to stand on the pivot — nothing is painted, recoloured, redrawn, mirrored to make a pose, or smoothed beyond the resampling of the scale. The one thing that is taken away, and only where a person says so in `erase.json`, is
 * the painted effect that came inside the figure's own picture (`erase.ts`): pixels become transparent, none is moved or changed.
 *
 *   `cutSheet`      a sheet → the poses on it (transparent, in reading order), or an error that says how many were found and why that is not what was asked for
 *   `chooseScale`   one factor for the sheet: the big eye of its poses against the big eye of the frames of the clip this one sits next to in play — or, when the head turns and the eyes of the sheet
 *                   disagree while its heads do not, the head against the head
 *   `placeFrame`    a pose → a 280 × 230 frame: scaled once, resampled once, its feet (or its centre of mass) on the pivot
 *   `judgeFrames`   the numbers that say a cut-out is clean — and the verdict a person reads before accepting (it never accepts)
 */

export type Level = 'ok' | 'warn' | 'fail';
export interface Check {
  id: string;
  level: Level;
  text: string;
}
export const worst = (levels: readonly Level[]): Level => (levels.includes('fail') ? 'fail' : levels.includes('warn') ? 'warn' : 'ok');

/** A problem with what was handed in (not a bug): the message says what to do. `boxes` (a failed cut): where the poses were looked for, for the debug picture. */
export class IntakeError extends Error {
  boxes?: Box[];
}

export interface Canvas {
  width: number;
  height: number;
  pivot: [number, number];
  artPxPerMeter: number;
  margin: number;
}

/** Every threshold of the judgement in one place. Calibrated against the frames of the design the game had before the character sheet (114 made by its generator, 90 of them in the game: see `figure.ts`), which all pass, with room; and then against the new design's own (`loose`, below). */
export const LIMITS = {
  /** Share of the soft edge that is pale grey: the fringe of the white a figure was cut from. */
  paleEdge: { warn: 0.06, fail: 0.15 },
  /**
   * Share of the figure outside its biggest piece. The old design's silhouettes were clean (0.4 % warned); the new one's scarf of fire sheds embers in every pose — small detached pieces that are part of the drawing
   * (up to 1.5 % of the figure on the sheet) — so what warns is 2 %, and a piece of another pose, an effect or a second figure (several per cent at least) still fails at 6 %.
   */
  loose: { warn: 0.02, fail: 0.06 },
  /** Share of solid pixels that are the red of an effect (the sword's own dark-red edge is ≤ 0.5 %). */
  red: { warn: 0.01, fail: 0.03 },
  /** Share of the figure of a hue the character has none of. */
  foreign: { warn: 0.01, fail: 0.04 },
  /** Red in the sheet around a pose, before the cut left it out. */
  rawRed: { warn: 0.02 },
  /** How far the centre of mass jumps between two frames, in metres. */
  massStep: { warn: 0.55, fail: 1.2 },
  /** How far outside the size the brief gave (as a share of that limit) before it is a failure rather than a warning. */
  size: { fail: 0.3 },
  /** How much the eye of a pose may differ from the median of its sheet, as a multiple of the tolerance, before it is a failure. */
  eyeFail: 2,
  /** The blade, grip to tip, in metres (the game's is 0.93). */
  blade: { min: 0.6, max: 1.3 },
  /** How far (px) an anchor may be from a pixel of the figure (alpha ≥ 40: the last pixels of a thin blade's tip are faint after the scale). */
  anchorOnFigure: 4,
} as const;

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the picture

/** The image has real transparency (more than 2 % of its pixels are not opaque). */
export function hasTransparency(img: RgbaImage): boolean {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 250) n++;
  return n > img.width * img.height * 0.02;
}

/** The colour of the background of an opaque picture: the median of its outermost 3 px. */
export function backgroundOf(img: RgbaImage): [number, number, number] {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const edge = (x: number, y: number): boolean => x < 3 || y < 3 || x >= img.width - 3 || y >= img.height - 3;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!edge(x, y)) {
        // nothing in the middle of a row is border: jump to the right-hand strip
        x = Math.max(x, img.width - 4);
        continue;
      }
      const o = (y * img.width + x) * 4;
      r.push(img.data[o]!);
      g.push(img.data[o + 1]!);
      b.push(img.data[o + 2]!);
    }
  }
  return [median(r), median(g), median(b)];
}

export function crop(img: RgbaImage, box: Box): RgbaImage {
  const w = box.x1 - box.x0 + 1;
  const h = box.y1 - box.y0 + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((box.y0 + y) * img.width + box.x0) * 4, ((box.y0 + y) * img.width + box.x0 + w) * 4), y * w * 4);
  return { width: w, height: h, data };
}

const isEffectRed = (r: number, g: number, b: number): boolean => r >= 120 && r > g + 50 && r > b + 50;

/** The mask of what is NOT background: the alpha of a transparent picture, or whatever differs from the border colour by 70 or more in a channel. */
export function figureMask(img: RgbaImage): { mask: Uint8Array; transparent: boolean; background: [number, number, number] | null } {
  const N = img.width * img.height;
  const mask = new Uint8Array(N);
  if (hasTransparency(img)) {
    for (let i = 0; i < N; i++) if (img.data[i * 4 + 3]! >= 40) mask[i] = 1;
    return { mask, transparent: true, background: null };
  }
  const bg = backgroundOf(img);
  const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  if (lum < 200) throw new IntakeError(`the background is not white or transparent (it is about rgb(${bg.map(Math.round).join(', ')})): ask the generator for a flat white background, or export the sheet with a transparent one`);
  for (let i = 0; i < N; i++) {
    const d = Math.max(Math.abs(img.data[i * 4]! - bg[0]), Math.abs(img.data[i * 4 + 1]! - bg[1]), Math.abs(img.data[i * 4 + 2]! - bg[2]));
    if (d >= 70) mask[i] = 1;
  }
  return { mask, transparent: false, background: bg };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ cutting a sheet

export interface Cut {
  /** The poses, transparent and trimmed to the figure, in reading order. */
  poses: RgbaImage[];
  /** Where each came from in the source (the sheet's coordinates), for the debug picture. */
  boxes: Box[];
  /** Frames that arrived already on the game's canvas (280 × 230, transparent): used as they are. */
  final: boolean[];
  /** The share of red in each pose's region of the source, before the cut left the red out. */
  rawRed: number[];
  notes: string[];
}

/** Reading order: rows from the top, each left to right. Two boxes are in the same row when their centres are within half the median height. */
export function readingOrder(boxes: readonly Box[]): number[] {
  const order = boxes.map((_, i) => i);
  const cy = (i: number): number => (boxes[i]!.y0 + boxes[i]!.y1) / 2;
  const medH = median(boxes.map((b) => b.y1 - b.y0 + 1));
  order.sort((a, b) => cy(a) - cy(b));
  const rows: number[][] = [];
  for (const i of order) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(cy(i) - cy(row[0]!)) <= medH * 0.5) row.push(i);
    else rows.push([i]);
  }
  return rows.flatMap((r) => r.sort((a, b) => boxes[a]!.x0 - boxes[b]!.x0));
}

function trimmed(img: RgbaImage): RgbaImage | null {
  const b = boundsOf(img, 8);
  return b ? crop(img, b) : null;
}

/** The share of red in `box` of an opaque picture, among the pixels that are not background. */
function redShare(img: RgbaImage, box: Box, mask: Uint8Array): number {
  let figure = 0;
  let red = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = y * img.width + x;
      if (!mask[i]) continue;
      figure++;
      if (isEffectRed(img.data[i * 4]!, img.data[i * 4 + 1]!, img.data[i * 4 + 2]!)) red++;
    }
  }
  return figure === 0 ? 0 : red / figure;
}

/**
 * The poses of a sheet. The pieces of each pose are joined by growing the picture of what is not background (so an antenna or a blade held a little apart stays with its figure); a speck
 * smaller than 3 % of the biggest pose is not a pose (a watermark, a stray mark). If that does not give exactly `expected` poses the grow radius is tried smaller and larger — and if no
 * radius does, the error says what was found and writes nothing: a sheet whose poses touch is a sheet to ask for again with wider gaps, not one to cut by guessing.
 */
export function cutSheet(sheet: RgbaImage, expected: number): Cut {
  const { mask, transparent } = figureMask(sheet);
  const { width: w, height: h } = sheet;
  const base = Math.min(14, Math.max(4, Math.round(Math.max(w, h) * 0.008)));
  const radii = [...new Set([base, Math.round(base * 1.5), base * 2, Math.max(2, Math.round(base * 0.7)), Math.max(2, Math.round(base * 0.45)), Math.max(2, Math.round(base * 0.3))])];
  let found: { boxes: Box[]; label: Int32Array; ids: number[] } | null = null;
  let first: Box[] | null = null;
  const tried: string[] = [];
  for (const radius of radii) {
    const lab = components(mask, w, h, radius);
    const biggest = Math.max(0, ...lab.areas);
    const ids = lab.areas.map((a, i) => (a >= biggest * 0.03 ? i : -1)).filter((i) => i >= 0);
    tried.push(`radius ${radius}: ${ids.length}`);
    first ??= ids.map((i) => lab.boxes[i]!);
    if (ids.length === expected) {
      found = { boxes: ids.map((i) => lab.boxes[i]!), label: lab.label, ids };
      break;
    }
  }
  if (!found) {
    const error = new IntakeError(`the sheet should hold ${expected} poses and they could not be told apart (${tried.join('; ')}): the poses touch or overlap, or some are missing — ask for wide empty gaps between them and one pose per slot (the picture segmentation.png shows what the cut saw)`);
    error.boxes = first ?? [];
    throw error;
  }
  const order = readingOrder(found.boxes);
  const poses: RgbaImage[] = [];
  const boxes: Box[] = [];
  const rawRed: number[] = [];
  const notes: string[] = [];
  order.forEach((k, n) => {
    const tight = found!.boxes[k]!;
    const pad = 8;
    const box: Box = { x0: Math.max(0, tight.x0 - pad), y0: Math.max(0, tight.y0 - pad), x1: Math.min(w - 1, tight.x1 + pad), y1: Math.min(h - 1, tight.y1 + pad) };
    let pose: RgbaImage | null;
    if (transparent) {
      // only the pixels of THIS pose's piece: the box of one may reach into the box of a neighbour
      const piece = crop(sheet, box);
      const id = found!.ids[k]!;
      for (let y = 0; y < piece.height; y++) {
        for (let x = 0; x < piece.width; x++) if (found!.label[(box.y0 + y) * w + box.x0 + x] !== id) piece.data[(y * piece.width + x) * 4 + 3] = 0;
      }
      pose = trimmed(piece);
      rawRed.push(0);
    } else {
      const r = extractPose(sheet, box);
      pose = r.bounds ? crop(r.image, r.bounds) : null;
      if (r.stats.droppedPieces > 0) notes.push(`pose ${n + 1}: el recorte dejó fuera ${r.stats.droppedPieces} pieza(s) suelta(s)`);
      rawRed.push(redShare(sheet, box, mask));
    }
    if (!pose) throw new IntakeError(`pose ${n + 1} of the sheet (x ${tight.x0}…${tight.x1}, y ${tight.y0}…${tight.y1}): nothing of a figure was left after the cut`);
    poses.push(pose);
    boxes.push(tight);
  });
  return { poses, boxes, final: poses.map(() => false), rawRed, notes };
}

/** How far outside the tight box of a pose the matte looks (px): room for the soft edge of the figure (`MATTE_DEFAULTS.rim`), never more than half the gap between two poses. */
export const BOX_PAD = 4;

/**
 * The poses of a sheet whose boxes a person gave (`poses.json`: one rectangle of the sheet per pose, tight around the figure, its embers and the effects painted next to it): no segmentation to guess — the
 * rectangles ARE the decision of which pixels are which pose. A transparent sheet is cut by alpha; an opaque one on white by `extractFigure` (`matte.ts`): the sheet's own pixels, only the white taken off.
 * `matte` tunes that (the defaults are the ones the protagonist's sheet was calibrated with).
 */
export function cutByBoxes(sheet: RgbaImage, boxes: readonly Box[], matte: MatteOptions = {}): Cut {
  const { transparent } = figureMask(sheet);
  const poses: RgbaImage[] = [];
  const notes: string[] = [];
  boxes.forEach((tight, n) => {
    const box: Box = { x0: Math.max(0, tight.x0 - BOX_PAD), y0: Math.max(0, tight.y0 - BOX_PAD), x1: Math.min(sheet.width - 1, tight.x1 + BOX_PAD), y1: Math.min(sheet.height - 1, tight.y1 + BOX_PAD) };
    let pose: RgbaImage | null;
    if (transparent) pose = trimmed(crop(sheet, box));
    else {
      const r = extractFigure(sheet, box, matte);
      pose = r.bounds ? crop(r.image, r.bounds) : null;
    }
    if (!pose) throw new IntakeError(`pose ${n + 1} of poses.json (x ${tight.x0}…${tight.x1}, y ${tight.y0}…${tight.y1}): nothing of a figure was found in the box`);
    poses.push(pose);
  });
  return { poses, boxes: [...boxes], final: poses.map(() => false), rawRed: poses.map(() => 0), notes };
}

/**
 * `scale.json` of a clip's inbox: `{ "factor": 1, "why": "…" }` — the factor a clip is scaled by when no neighbour says (the reference clip of the character, the idle: the sheet's own size), kept with the delivery so that
 * the same sources give the same frames. A factor handed in by hand (`--scale`) is for trying; this is the one that is archived.
 */
export function parseScaleFile(text: string | null): number | undefined {
  if (text === null) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new IntakeError(`scale.json is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  const o = raw as { factor?: unknown; why?: unknown } | null;
  if (typeof o?.factor !== 'number' || !(o.factor > 0 && o.factor < 10)) throw new IntakeError('scale.json needs "factor": a number between 0 and 10 (canvas pixels per pixel of the sheet)');
  if (typeof o.why !== 'string' || o.why.trim().length < MIN_WAIVER_REASON) throw new IntakeError(`scale.json needs a "why" of at least ${MIN_WAIVER_REASON} characters (why this clip is not scaled by its neighbour)`);
  return o.factor;
}

/** What `poses.json` of a clip's inbox says: one rectangle of the sheet per pose, and (optionally) how the matte is tuned. */
export interface PoseBoxes {
  boxes: Box[];
  matte: MatteOptions;
}

/**
 * `poses.json`: `{ "boxes": [[x0, y0, x1, y1], …] }` — the rectangle (inclusive, in the pixels of the clip's `sheet.png`) of each pose, in the order of the frames, tight around the figure and the pieces that go with it
 * (its embers, the effects painted beside it: those are taken out by `erase.json`, not by leaving them out of the box). Refused, with what to do: a wrong number of boxes, a box outside the sheet or one that does
 * not enclose anything.
 */
export function parsePoseBoxes(text: string, expected: number, sheet: Pick<RgbaImage, 'width' | 'height'>): PoseBoxes {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new IntakeError(`poses.json is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  const o = raw as { boxes?: unknown; matte?: unknown } | null;
  if (!Array.isArray(o?.boxes) || o.boxes.length !== expected) throw new IntakeError(`poses.json needs "boxes": ${expected} rectangles [x0, y0, x1, y1] (one per pose, in the order of the frames) and has ${Array.isArray(o?.boxes) ? o.boxes.length : 'none'}`);
  const boxes = o.boxes.map((b: unknown, k: number): Box => {
    const v = Array.isArray(b) ? b : [];
    if (v.length !== 4 || !v.every((n) => Number.isInteger(n))) throw new IntakeError(`poses.json: box ${k + 1} must be four whole numbers [x0, y0, x1, y1]`);
    const [x0, y0, x1, y1] = v as [number, number, number, number];
    if (x0 < 0 || y0 < 0 || x1 >= sheet.width || y1 >= sheet.height || x0 > x1 || y0 > y1) throw new IntakeError(`poses.json: box ${k + 1} [${v.join(', ')}] is not inside the ${sheet.width} × ${sheet.height} sheet`);
    return { x0, y0, x1, y1 };
  });
  const matte: MatteOptions = {};
  const m = (o as { matte?: Record<string, unknown> }).matte;
  if (m !== undefined) {
    for (const key of ['ink', 'core', 'rim'] as const) {
      const v = m?.[key];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > (key === 'ink' ? 1 : 12)) throw new IntakeError(`poses.json: matte.${key} must be a number${key === 'ink' ? ' between 0 and 1' : ' of pixels (0 to 12)'}`);
      matte[key] = v;
    }
  }
  return { boxes, matte };
}

/** A handful of separate PNGs, one pose each: transparent ones are trimmed, opaque ones are cut from their background like a sheet's pose; ones already on the game's canvas are used as they are. */
export function cutLoose(images: readonly RgbaImage[], canvas: Pick<Canvas, 'width' | 'height'>): Cut {
  const poses: RgbaImage[] = [];
  const boxes: Box[] = [];
  const final: boolean[] = [];
  const rawRed: number[] = [];
  const notes: string[] = [];
  images.forEach((img, n) => {
    const whole: Box = { x0: 0, y0: 0, x1: img.width - 1, y1: img.height - 1 };
    boxes.push(whole);
    if (hasTransparency(img)) {
      const ready = img.width === canvas.width && img.height === canvas.height;
      final.push(ready);
      const t = trimmed(img);
      if (!t) throw new IntakeError(`file ${n + 1}: the picture is empty`);
      poses.push(ready ? img : t);
      rawRed.push(0);
      return;
    }
    const { mask } = figureMask(img);
    const r = extractPose(img, whole);
    if (!r.bounds) throw new IntakeError(`file ${n + 1}: nothing of a figure was found on the background`);
    if (r.stats.droppedPieces > 0) notes.push(`archivo ${n + 1}: el recorte dejó fuera ${r.stats.droppedPieces} pieza(s) suelta(s)`);
    poses.push(crop(r.image, r.bounds));
    final.push(false);
    rawRed.push(redShare(img, whole, mask));
  });
  if (final.some((f) => f) && !final.every((f) => f)) notes.push('algunos archivos ya son fotogramas de 280 × 230 y otros no: los que lo son conservan su tamaño, los demás se escalan');
  return { poses, boxes, final, rawRed, notes };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ scaling

export interface Scaling {
  /** Canvas pixels per pixel of the delivered picture. */
  factor: number;
  /** What the factor came from: the big eye, the head (when it turns: see `scaleProxy`), a factor given by hand, or frames that arrived on the game's canvas. */
  how: 'eye' | 'head' | 'given' | 'final';
  /** What tells a pose drawn at another scale from one that is only turned: the big eye, or the head. It also decides what `judgeFrames` compares between the poses. */
  proxy: 'eye' | 'head';
  /** The eye the sheet is brought to, in canvas pixels. */
  target: number | null;
  /** The big eye of each pose, in the delivered picture's own pixels, or `null`. */
  eyes: Array<number | null>;
  /** The median of the measurable eyes, in the delivered picture's pixels. */
  median: number | null;
  /** The head of each pose (the biggest circle inside the figure: see `headDiameter`), in the delivered picture's own pixels. */
  heads: Array<number | null>;
  /** The median of the heads, in the delivered picture's pixels. */
  headMedian: number | null;
  /** The poses (0-based) the scale was read from, when only some can be measured (a pose lying on the floor has no head to measure), or `null` for all. */
  only: number[] | null;
  /** The head the sheet is brought to when it is scaled by the head, in canvas pixels, or `null`. */
  headTarget: number | null;
}

/** How far a set of measurements strays from its median: the biggest distance, as a share of the median (0 for fewer than two). */
export function spreadOf(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = median(values);
  return m > 0 ? Math.max(...values.map((v) => Math.abs(v - m) / m)) : 0;
}

/**
 * What a sheet is measured by. The big eye, as always — unless the eyes of its poses disagree by more than the tolerance (or most of them cannot be seen) while its HEADS agree within it: then the
 * poses are the same size and the head is turned (an eye seen narrower, smaller, or not at all), and the head is the measure that is true. A real difference of scale shows in both measures,
 * so it still fails by the eye: nothing here lets a pose that was drawn at another size through.
 */
export function scaleProxy(eyes: ReadonlyArray<number | null>, heads: ReadonlyArray<number | null>, tolerance: number): 'eye' | 'head' {
  const e = eyes.filter((v): v is number => v !== null);
  const h = heads.filter((v): v is number => v !== null);
  const eyesSeen = e.length >= Math.max(1, Math.ceil(eyes.length / 2));
  if (eyesSeen && spreadOf(e) <= tolerance) return 'eye';
  return h.length > 0 && h.length === heads.length && spreadOf(h) <= tolerance ? 'head' : 'eye';
}

export interface ScaleOptions {
  /** The head of the frames of the neighbouring clip, in canvas pixels (`clipHead`). Without it the sheet is scaled by the eye only, as it always was. */
  headTarget?: number | null;
  /** How far the size of a pose may stray from its sheet's median before it is told apart (`requests.json`: `scale.tolerance`). */
  tolerance?: number;
  /** What the sheet is measured by, when it is not for the tool to choose: the head (a head that turns changes what the eye measures, and the new design's does in most of its poses). */
  proxy?: 'eye' | 'head';
  /** The poses (0-based) the measurement is read from: the others are not measurable (lying down) and are left out of the median — and out of the judgement of the scale. */
  only?: readonly number[];
}

/**
 * ONE factor for the whole delivery: the median big eye of its poses becomes `target` (the big eye of the frames of the neighbouring clip) — or, when the head turns (`scaleProxy`), the median head
 * of its poses becomes `headTarget`. A `given` factor overrides the measurement; frames that arrived on the game's canvas keep their size.
 */
export function chooseScale(cut: Cut, target: number | null, given?: number, options: ScaleOptions = {}): Scaling {
  const only = options.only ? [...options.only] : null;
  const eyes = cut.poses.map((p) => eyeDiameter(p)?.diameter ?? null);
  const heads = cut.poses.map((p) => headDiameter(p));
  const measured = <T>(values: readonly T[]): T[] => (only ? only.map((k) => values[k]!) : [...values]);
  const eyesUsed = measured(eyes);
  const headsUsed = measured(heads);
  const seen = eyesUsed.filter((e): e is number => e !== null);
  const med = seen.length > 0 ? median(seen) : null;
  const headsSeen = headsUsed.filter((h): h is number => h !== null);
  const headMedian = headsSeen.length > 0 ? median(headsSeen) : null;
  const headTarget = options.headTarget ?? null;
  const proxy = options.proxy ?? (headTarget === null ? 'eye' : scaleProxy(eyesUsed, headsUsed, options.tolerance ?? 0.14));
  const known = { proxy, target, eyes, median: med, heads, headMedian, headTarget, only };
  if (cut.final.length > 0 && cut.final.every((f) => f)) return { factor: 1, how: 'final', ...known };
  if (given !== undefined) {
    if (!(given > 0 && given < 10)) throw new IntakeError(`--scale ${given}: the factor is canvas pixels per pixel of the delivered picture and must be between 0 and 10`);
    return { factor: given, how: 'given', ...known };
  }
  if (proxy === 'head') {
    if (headMedian === null || headTarget === null) throw new IntakeError('the sheet is to be scaled by the size of its head, and there is no head to measure in the poses or in the frames of the neighbouring clip: pass the factor yourself with --scale <canvas pixels per pixel of the sheet>');
    return { factor: headTarget / headMedian, how: 'head', ...known };
  }
  if (target === null) throw new IntakeError('the frames of the neighbouring clip have no measurable eye to scale this sheet against: pass the factor yourself with --scale <canvas pixels per pixel of the sheet>');
  if (seen.length < Math.max(1, Math.ceil(eyesUsed.length / 2))) {
    throw new IntakeError(`the big eye could be measured in only ${seen.length} of ${eyesUsed.length} poses (it needs a round, glowing eye with its white highlights in view): the scale cannot be taken from the sheet — pass it with --scale <canvas pixels per pixel of the sheet>`);
  }
  return { factor: target / med!, how: 'eye', ...known };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ placing

export interface Placement {
  /** Always the centre of mass of the body (torso and head, without the sword, the antennae or the cape): it is what the player's body box is centred on. */
  anchorX: 'mass';
  /** `ground`: the lowest solid pixel of the figure on the pivot row. `mass`: the centre of mass 1.0 m above the pivot (a body in the air). */
  anchorY: 'ground' | 'mass';
  /**
   * What the body is made of. `solid` (the default): every solid pixel, opened to drop its thin parts. `dark`: only the near-black pixels (and what they enclose), opened — for a figure whose cape is a big light flame that
   * would drag the centre of mass toward itself, and whose sword may dip below its feet: then `ground` is the sole of the foot (the lowest dark pixel of the body), not the lowest pixel of anything.
   */
  body?: 'solid' | 'dark';
}

export interface Placed {
  image: RgbaImage;
  /** How many canvas pixels the figure would reach beyond each edge (0 = none). */
  clipped: { left: number; right: number; top: number; bottom: number };
  /** How far (canvas px) the lowest point of the figure is below the lowest point of the body proper: a big gap means a thin part (a blade, a hand) dips below the feet and the feet may float. */
  groundGap: number;
  /** The translation the author asked for on top (canvas px). */
  nudge: { dx: number; dy: number };
}

/** The height above the pivot, in metres, at which the centre of mass of an airborne body is put. */
export const AIR_HEIGHT_M = 1.0;

/** A frame whose lowest point is more than this many canvas pixels under the body's own lowest part is flagged (the soles of the boots are thin: the opened body is 3–5 px short of them in the frames of the game). */
export const GROUND_GAP_WARN = 8;

/**
 * A pose on the game's canvas. Scaled by `factor` and resampled ONCE (the P9 renderer, area sampling), with the anchor of the pose landing exactly on its target:
 *   x      → the centre of mass of the body on the pivot column;
 *   ground → the lowest solid pixel of the figure on the pivot row; mass → the centre of mass 1.0 m above the pivot (a body in the air).
 * `nudge` is a translation in canvas pixels the author asks for on top, after looking at the contact sheet (the lowest point may be a blade, not a foot).
 */
export function placeFrame(pose: RgbaImage, factor: number, placement: Placement, canvas: Canvas, nudge = { dx: 0, dy: 0 }): Placed {
  const thin = Math.max(1, Math.round(3 / factor));
  const dark = placement.body === 'dark';
  const body = bodyOf(pose, thin, dark);
  if (!body) throw new IntakeError('a pose has no body to anchor (it is all thin parts or empty)');
  const pb = boundsOf(pose, 8)!;
  const lowest = dark ? feetRow(pose, body, thin) : (boundsOf(pose, SOLID)?.y1 ?? pb.y1);
  const ax = body.cx + 0.5;
  const ay = placement.anchorY === 'ground' ? lowest + 1 : body.cy + 0.5;
  const tx = canvas.pivot[0] + 0.5 + nudge.dx;
  const ty = (placement.anchorY === 'ground' ? canvas.pivot[1] + 1 : canvas.pivot[1] - AIR_HEIGHT_M * canvas.artPxPerMeter + 0.5) + nudge.dy;
  const samples = Math.min(8, Math.max(3, Math.ceil(1.5 / factor)));
  // at the size of the sheet itself (factor 1) the pose is moved by WHOLE pixels and copied: not one pixel is resampled, so the frame is the sheet's own
  const image =
    factor === 1
      ? placePose(pose, { x: 0, y: 0 }, canvas, { x: Math.round(tx - ax), y: Math.round(ty - ay) }).image
      : renderFrame(toDrawing(pose), { width: canvas.width, height: canvas.height, scale: factor, origin: { x: ax - tx / factor, y: ay - ty / factor } }, { warp: null, samples });
  const left = (pb.x0 - ax) * factor + tx;
  const right = (pb.x1 + 1 - ax) * factor + tx;
  const top = (pb.y0 - ay) * factor + ty;
  const bottom = (pb.y1 + 1 - ay) * factor + ty;
  return {
    image,
    clipped: { left: Math.max(0, Math.ceil(-left)), right: Math.max(0, Math.ceil(right - canvas.width)), top: Math.max(0, Math.ceil(-top)), bottom: Math.max(0, Math.ceil(bottom - canvas.height)) },
    groundGap: dark ? 0 : Math.max(0, (lowest - body.bottom) * factor),
    nudge,
  };
}

/** The sole of the foot: the lowest solid DARK pixel within reach of the body proper (the opening that drops the thin parts also takes a pixel or two off the rounded feet; a sword that dips below them is not within it). */
function feetRow(pose: RgbaImage, body: Body, thin: number): number {
  const reach = dilate(body.mask, pose.width, pose.height, thin + 1);
  for (let y = pose.height - 1; y > body.bottom; y--) {
    for (let x = 0; x < pose.width; x++) {
      const i = y * pose.width + x;
      if (reach[i] && pose.data[i * 4 + 3]! >= SOLID && isDark(pose.data[i * 4]!, pose.data[i * 4 + 1]!, pose.data[i * 4 + 2]!)) return y;
    }
  }
  return body.bottom;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the sword

export interface SwordPoints {
  /** Where the hand holds the blade, in canvas pixels. */
  grip: [number, number];
  tip: [number, number];
}

/** The anchors of the manifest for a frame, in metres from the pivot (+x forward, +y up): the hand IS the grip, and the VFX and the hit are on the blade by the same proportions as the slash rig's. */
export function manifestAnchors(p: SwordPoints, canvas: Canvas): Record<string, [number, number]> {
  const m = (x: number, y: number): [number, number] => [Math.round(((x - canvas.pivot[0]) / canvas.artPxPerMeter) * 1000) / 1000, Math.round(((canvas.pivot[1] - y) / canvas.artPxPerMeter) * 1000) / 1000];
  const along = (t: number): [number, number] => [p.grip[0] + t * (p.tip[0] - p.grip[0]), p.grip[1] + t * (p.tip[1] - p.grip[1])];
  return {
    hand_r: m(...p.grip),
    weapon_grip: m(...p.grip),
    weapon_tip: m(...p.tip),
    hit_origin: m(...along(0.85)),
    vfx_origin: m(...along(0.48)),
  };
}

/** The anchors of the manifest for a frame of the cast, in metres from the pivot (forward and up): the hand, and where the bolt leaves (`anchors.json`: `"grip"` is the hand, `"tip"` the origin of the bolt). */
export function castManifestAnchors(p: SwordPoints, canvas: Canvas): Record<string, [number, number]> {
  const m = (x: number, y: number): [number, number] => [Math.round(((x - canvas.pivot[0]) / canvas.artPxPerMeter) * 1000) / 1000, Math.round(((canvas.pivot[1] - y) / canvas.artPxPerMeter) * 1000) / 1000];
  return { hand_r: m(...p.grip), projectile_origin: m(...p.tip) };
}

/** The farthest the bolt may leave from the hand, in metres (the old drawings' was 0.22). */
export const CAST_ORIGIN_MAX = 0.8;

/** What `anchors.json` says, checked: every frame has a grip and a tip inside the canvas. Problems come back as text, not exceptions, so the report can list them all. */
export function parseAnchors(text: string | null, frames: readonly string[], canvas: Canvas): { points: Map<string, SwordPoints>; problems: string[] } {
  const points = new Map<string, SwordPoints>();
  const problems: string[] = [];
  if (text === null) return { points, problems: ['no hay anchors.json para este clip'] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { points, problems: [`anchors.json no es JSON válido (${e instanceof Error ? e.message : String(e)})`] };
  }
  const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [v[0] as number, v[1] as number] : null);
  for (const name of frames) {
    const e = (raw as Record<string, { grip?: unknown; tip?: unknown }> | null)?.[name];
    const grip = pair(e?.grip);
    const tip = pair(e?.tip);
    if (!grip || !tip) {
      problems.push(`${name}: necesita "grip": [x, y] y "tip": [x, y]`);
      continue;
    }
    const inside = ([x, y]: [number, number]): boolean => x >= 0 && y >= 0 && x < canvas.width && y < canvas.height;
    if (!inside(grip) || !inside(tip)) {
      problems.push(`${name}: un ancla queda fuera del lienzo de ${canvas.width} × ${canvas.height}`);
      continue;
    }
    if (grip[0] === 0 && grip[1] === 0 && tip[0] === 0 && tip[1] === 0) {
      problems.push(`${name}: las anclas siguen siendo los ceros de la plantilla`);
      continue;
    }
    points.set(name, { grip, tip });
  }
  for (const k of Object.keys((raw as Record<string, unknown>) ?? {})) if (!frames.includes(k)) problems.push(`${k}: anclas de un fotograma que este clip no tiene`);
  return { points, problems };
}

/** The distance (px) from `p` to the nearest pixel of the figure (alpha ≥ 40) in `img`, up to `max`; `max + 1` when there is none within it. */
export function distanceToFigure(img: RgbaImage, p: [number, number], max: number): number {
  const cx = Math.round(p[0]);
  const cy = Math.round(p[1]);
  let best = max + 1;
  for (let dy = -max; dy <= max; dy++) {
    for (let dx = -max; dx <= max; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      if (img.data[(y * img.width + x) * 4 + 3]! >= 40) best = Math.min(best, Math.hypot(dx, dy));
    }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ judging

export interface FrameJudgement {
  name: string;
  role: string;
  phase: string | null;
  bounds: Box | null;
  /** The smallest distance from the figure to an edge of the canvas, in pixels. */
  margin: number;
  heightM: number;
  widthM: number;
  eye: number | null;
  /** (eye − median of the sheet) / median, or `null`. */
  eyeDeviation: number | null;
  /** The head (the biggest circle inside the figure), in canvas pixels, and its deviation from the median of the clip. */
  head: number | null;
  headDeviation: number | null;
  mass: { x: number; y: number } | null;
  /** How far the centre of mass moved from the previous frame, in metres. */
  massStep: number | null;
  clean: Cleanliness;
  blade: number | null;
  checks: Check[];
  level: Level;
}

export interface JudgeInput {
  names: readonly string[];
  frames: readonly RgbaImage[];
  clipped: ReadonlyArray<Placed['clipped']>;
  groundGap: readonly number[];
  request: ClipRequest;
  canvas: Canvas;
  scaling: Scaling;
  tolerance: number;
  rawRed: readonly number[];
  anchors: Map<string, SwordPoints>;
  anchorProblems: readonly string[];
}

const pct = (v: number): string => `${(v * 100).toFixed(1)} %`;

function limitCheck(id: string, value: number, lim: { warn: number; fail: number }, text: (v: string) => string): Check | null {
  if (value > lim.fail) return { id, level: 'fail', text: text(pct(value)) };
  if (value > lim.warn) return { id, level: 'warn', text: text(pct(value)) };
  return null;
}

export interface ClipJudgement {
  frames: FrameJudgement[];
  /** The checks of the clip as a whole (its scale, its eye against the neighbour's). */
  checks: Check[];
  /** The median big eye of the finished frames, in canvas pixels. */
  eye: number | null;
  /** The median head of the finished frames, in canvas pixels. */
  head: number | null;
  level: Level;
}

export function judgeFrames(input: JudgeInput): ClipJudgement {
  const { canvas, request, scaling, tolerance } = input;
  const out: FrameJudgement[] = [];
  // the poses are judged against each other: the eye of each against the median of the finished clip — or, when the head turns and the sheet was scaled by the head, the head of each
  const readings = input.frames.map((f) => eyeDiameter(f)?.diameter ?? null);
  // a clip some of whose poses cannot be measured (lying on the floor: no head to see) is judged by the ones that can (`scale.only` of its request)
  const measurable = (k: number): boolean => !scaling.only || scaling.only.includes(k);
  const seen = readings.filter((e, k): e is number => e !== null && measurable(k));
  const eyeMedian = seen.length > 0 ? median(seen) : null;
  const headReadings = input.frames.map((f) => headDiameter(f));
  const headSeen = headReadings.filter((h, k): h is number => h !== null && measurable(k));
  const headMedian = headSeen.length > 0 ? median(headSeen) : null;
  let prev: { frame: RgbaImage; mass: { x: number; y: number } | null } | null = null;
  input.frames.forEach((frame, k) => {
    const name = input.names[k]!;
    const spec = request.frames[k]!;
    const checks: Check[] = [];
    const b = boundsOf(frame, 8);
    if (!b) {
      checks.push({ id: 'empty', level: 'fail', text: 'el fotograma está vacío' });
      out.push({ name, role: spec.role, phase: spec.phase, bounds: null, margin: 0, heightM: 0, widthM: 0, eye: null, eyeDeviation: null, head: null, headDeviation: null, mass: null, massStep: null, clean: cleanliness(frame), blade: null, checks, level: 'fail' });
      prev = { frame, mass: null };
      return;
    }
    const margin = Math.min(b.x0, b.y0, canvas.width - 1 - b.x1, canvas.height - 1 - b.y1);
    const c = input.clipped[k]!;
    const cutBy = c.left + c.right + c.top + c.bottom;
    if (cutBy > 0) checks.push({ id: 'clipped', level: 'fail', text: `la figura no cabe en el lienzo de ${canvas.width} × ${canvas.height} (se sale: izquierda ${c.left}, derecha ${c.right}, arriba ${c.top}, abajo ${c.bottom} px): la pose es más grande de lo que admite el clip` });
    else if (margin < canvas.margin) checks.push({ id: 'margin', level: 'fail', text: `la figura queda a ${margin} px del borde del lienzo (el contrato pide ${canvas.margin})` });

    if (request.placement.anchorY === 'ground' && (input.groundGap[k] ?? 0) > GROUND_GAP_WARN) {
      checks.push({ id: 'ground', level: 'warn', text: `el punto más bajo de la figura está ${Math.round(input.groundGap[k]!)} px por debajo de lo más bajo de su cuerpo: una hoja o una mano baja más que los pies, y los pies pueden quedar flotando sobre la línea del suelo — mira la hoja de contacto y, si es así, baja el fotograma con placement.json (dy)` });
    }

    const heightM = (b.y1 - b.y0 + 1) / canvas.artPxPerMeter;
    const widthM = (b.x1 - b.x0 + 1) / canvas.artPxPerMeter;
    for (const [what, v, [lo, hi]] of [['height', heightM, request.limits.heightM], ['width', widthM, request.limits.widthM]] as const) {
      if (v >= lo && v <= hi) continue;
      const off = v < lo ? (lo - v) / lo : (v - hi) / hi;
      checks.push({ id: `size-${what}`, level: off > LIMITS.size.fail ? 'fail' : 'warn', text: `la figura mide ${v.toFixed(2)} m de ${what === 'height' ? 'alto' : 'ancho'}; el encargo de este clip dice ${lo}–${hi} m` });
    }

    const eye = readings[k]!;
    const head = headReadings[k]!;
    let eyeDeviation: number | null = null;
    let headDeviation: number | null = null;
    if (eye !== null && eyeMedian !== null) eyeDeviation = (eye - eyeMedian) / eyeMedian;
    if (head !== null && headMedian !== null) headDeviation = (head - headMedian) / headMedian;
    if (!measurable(k)) checks.push({ id: 'scale', level: 'ok', text: 'esta pose no se mide para la escala (la cabeza no se ve entera: tumbada, caída o deshecha); la escala del clip se lee de las demás' });
    else if (scaling.proxy === 'head') {
      // the head turns, so the eye is no fair measure of the size of the pose (it is seen narrower, smaller, or not at all): the head is
      if (head !== null && headMedian !== null && headDeviation !== null) {
        const dev = Math.abs(headDeviation);
        if (dev > tolerance * LIMITS.eyeFail) checks.push({ id: 'head', level: 'fail', text: `la cabeza mide ${head.toFixed(1)} px, un ${pct(dev)} de diferencia con los ${headMedian.toFixed(1)} px del clip: esta pose se dibujó a otra escala` });
        else if (dev > tolerance) checks.push({ id: 'head', level: 'warn', text: `la cabeza mide ${head.toFixed(1)} px, un ${pct(dev)} de diferencia con los ${headMedian.toFixed(1)} px del clip: comprueba que la pose está a la misma escala que las demás` });
      }
    } else if (eye !== null && eyeMedian !== null && eyeDeviation !== null) {
      const dev = Math.abs(eyeDeviation);
      if (dev > tolerance * LIMITS.eyeFail) checks.push({ id: 'eye', level: 'fail', text: `el ojo grande mide ${eye.toFixed(1)} px, un ${pct(dev)} de diferencia con los ${eyeMedian.toFixed(1)} px del clip: esta pose se dibujó a otra escala` });
      else if (dev > tolerance) checks.push({ id: 'eye', level: 'warn', text: `el ojo grande mide ${eye.toFixed(1)} px, un ${pct(dev)} de diferencia con los ${eyeMedian.toFixed(1)} px del clip: comprueba que la pose está a la misma escala que las demás (una cabeza vuelta se lee más pequeña)` });
    } else if (eye === null) checks.push({ id: 'eye', level: 'ok', text: 'ningún ojo grande a la vista en esta pose (de espaldas, apagado u oculto): no se mide' });

    const clean = cleanliness(frame);
    for (const chk of [
      limitCheck('edge', clean.paleEdge, LIMITS.paleEdge, (v) => `${v} del borde suave es gris pálido: un resto del fondo blanco del que se recortó la figura — el recorte no está limpio`),
      limitCheck('loose', clean.loose, LIMITS.loose, (v) => `${v} de la figura son piezas sueltas aparte del cuerpo (motas, una segunda figura, un efecto que se coló)`),
      limitCheck('red', clean.red, LIMITS.red, (v) => `${v} de la figura es rojo de efecto (el personaje no tiene; la espada tiene un fino borde rojo oscuro, muy por debajo del 1 %)`),
      limitCheck('colour', clean.foreign, LIMITS.foreign, (v) => `${v} de la figura es de un tono que el personaje no tiene (amarillo, verde, naranja, tonos de piel)`),
    ]) {
      if (chk) checks.push(chk);
    }
    const raw = input.rawRed[k] ?? 0;
    if (raw > LIMITS.rawRed.warn) checks.push({ id: 'sheet-red', level: 'warn', text: `${pct(raw)} de la pose en la hoja entregada es rojo: el recorte deja fuera la energía roja, así que una hoja o un miembro dibujado en rojo puede haber perdido su color — mira la hoja de contacto` });

    const body = bodyOf(frame, 3, request.placement.body === 'dark');
    const mass = body ? { x: body.cx, y: body.cy } : null;
    let massStep: number | null = null;
    if (prev && prev.mass && mass) {
      massStep = Math.hypot(mass.x - prev.mass.x, mass.y - prev.mass.y) / canvas.artPxPerMeter;
      if (massStep > LIMITS.massStep.fail) checks.push({ id: 'mass', level: 'fail', text: `el centro de masa del cuerpo salta ${massStep.toFixed(2)} m respecto al fotograma anterior` });
      else if (massStep > LIMITS.massStep.warn) checks.push({ id: 'mass', level: 'warn', text: `el centro de masa del cuerpo salta ${massStep.toFixed(2)} m respecto al fotograma anterior (un paso grande para un fotograma)` });
    }
    if (prev && prev.frame.data.length === frame.data.length && prev.frame.data.every((v, i) => v === frame.data[i])) checks.push({ id: 'repeat', level: 'warn', text: 'idéntico al fotograma anterior (repetir una pose no aporta nada)' });

    let blade: number | null = null;
    if (request.anchors === 'cast') {
      const p = input.anchors.get(name);
      if (!p) checks.push({ id: 'cast', level: 'fail', text: input.anchorProblems.find((t) => t.startsWith(`${name}:`)) ?? 'sin anclas para este fotograma: el disparo necesita la mano y el punto de salida del proyectil (anchors.json: "grip" = la mano, "tip" = la salida)' });
      else {
        const reach = Math.hypot(p.tip[0] - p.grip[0], p.tip[1] - p.grip[1]) / canvas.artPxPerMeter;
        if (reach > CAST_ORIGIN_MAX) checks.push({ id: 'cast', level: 'fail', text: `el proyectil sale a ${reach.toFixed(2)} m de la mano (se admite hasta ${CAST_ORIGIN_MAX} m)` });
        if (distanceToFigure(frame, p.grip, LIMITS.anchorOnFigure + 1) > LIMITS.anchorOnFigure) checks.push({ id: 'cast', level: 'fail', text: `el ancla de la mano (${p.grip.join(', ')}) no está sobre la figura` });
      }
    }
    if (request.sword) {
      const p = input.anchors.get(name);
      if (!p) checks.push({ id: 'sword', level: 'fail', text: input.anchorProblems.find((t) => t.startsWith(`${name}:`)) ?? 'sin anclas para este fotograma: la espada necesita su empuñadura y su punta (anchors.json)' });
      else {
        blade = Math.hypot(p.tip[0] - p.grip[0], p.tip[1] - p.grip[1]) / canvas.artPxPerMeter;
        const [bladeMin, bladeMax] = request.limits.bladeM ?? [LIMITS.blade.min, LIMITS.blade.max];
        if (blade < bladeMin || blade > bladeMax) checks.push({ id: 'sword', level: 'fail', text: `de la empuñadura a la punta hay ${blade.toFixed(2)} m; ${request.limits.bladeM ? 'la hoja de este personaje' : 'la hoja del juego mide 0.93 m'} (se admite ${bladeMin}–${bladeMax} m)` });
        const g = distanceToFigure(frame, p.grip, LIMITS.anchorOnFigure + 1);
        const t = distanceToFigure(frame, p.tip, LIMITS.anchorOnFigure + 1);
        if (g > LIMITS.anchorOnFigure) checks.push({ id: 'sword', level: 'fail', text: `el ancla de la empuñadura (${p.grip.join(', ')}) no está sobre la figura` });
        if (t > LIMITS.anchorOnFigure) checks.push({ id: 'sword', level: 'fail', text: `el ancla de la punta (${p.tip.join(', ')}) no está sobre la figura` });
      }
    }
    out.push({ name, role: spec.role, phase: spec.phase, bounds: b, margin, heightM, widthM, eye, eyeDeviation, head, headDeviation, mass, massStep, clean, blade, checks, level: worst(checks.map((x) => x.level)) });
    prev = { frame, mass };
  });

  const clip: Check[] = [];
  // what the blow must DO (the second blow comes forward, the blow in the air comes down): read off the anchors, in metres from the pivot, as the end-to-end scenario reads it off the game
  const phases = request.manifest.phases;
  if (request.sword && phases && request.intent && input.names.every((n) => input.anchors.has(n))) {
    const height = (a: number, b: number): number[] => input.names.slice(a, b + 1).map((n) => (canvas.pivot[1] - input.anchors.get(n)!.tip[1]) / canvas.artPxPerMeter);
    const startup = height(...phases.startup);
    const active = height(...phases.active);
    if (request.intent.tipRises !== undefined) {
      const rise = Math.max(...active) - Math.min(...startup);
      if (rise < request.intent.tipRises) clip.push({ id: 'intent', level: 'fail', text: `el segundo golpe tiene que SUBIR (la punta, al menos ${request.intent.tipRises} m entre la preparación y la fase activa) y sube ${rise.toFixed(2)} m: ¿es el golpe que pide el encargo (un corte ascendente, de abajo y atrás a arriba y delante)?` });
    }
    if (request.intent.tipDrops !== undefined) {
      const drop = Math.max(...startup) - Math.min(...active);
      if (drop < request.intent.tipDrops) clip.push({ id: 'intent', level: 'warn', text: `el tajo en el aire tiene que BAJAR (la punta, al menos ${request.intent.tipDrops} m entre la preparación y la fase activa) y baja ${drop.toFixed(2)} m: ¿es el golpe que pide el encargo?` });
    }
    if (request.intent.tipAdvances !== undefined) {
      const ahead = (a: number, b: number): number[] => input.names.slice(a, b + 1).map((n) => (input.anchors.get(n)!.tip[0] - canvas.pivot[0]) / canvas.artPxPerMeter);
      const advance = Math.max(...ahead(...phases.active)) - Math.min(...ahead(...phases.startup));
      if (advance < request.intent.tipAdvances) clip.push({ id: 'intent', level: 'fail', text: `el golpe tiene que AVANZAR (la punta, al menos ${request.intent.tipAdvances} m hacia delante entre la preparación y la fase activa) y avanza ${advance.toFixed(2)} m: ¿es el golpe que pide el encargo (la hoja pasa de detrás del cuerpo a delante)?` });
    }
  }
  if ((scaling.how === 'eye' || scaling.how === 'head') && scaling.factor > 1) {
    clip.push({ id: 'resolution', level: scaling.factor > 2 ? 'fail' : 'warn', text: `la imagen entregada es MÁS PEQUEÑA que los fotogramas (la escala es ×${scaling.factor.toFixed(2)}): sus píxeles se agrandan y el dibujo se ve borroso — pide una hoja de al menos el doble de tamaño que los fotogramas` });
  }
  if (scaling.proxy === 'head') {
    if (headMedian !== null && scaling.headTarget !== null && Math.abs(headMedian - scaling.headTarget) / scaling.headTarget > tolerance) {
      clip.push({ id: 'neighbour', level: 'warn', text: `la cabeza del clip mide ${headMedian.toFixed(1)} px y la de su vecino en el juego ${scaling.headTarget.toFixed(1)} px (${pct(Math.abs(headMedian - scaling.headTarget) / scaling.headTarget)} de diferencia)` });
    }
  } else if (eyeMedian !== null && scaling.target !== null && Math.abs(eyeMedian - scaling.target) / scaling.target > tolerance) {
    clip.push({ id: 'neighbour', level: 'warn', text: `el ojo grande del clip mide ${eyeMedian.toFixed(1)} px y el de su vecino en el juego ${scaling.target.toFixed(1)} px (${pct(Math.abs(eyeMedian - scaling.target) / scaling.target)} de diferencia)` });
  }
  return { frames: out, checks: clip, eye: eyeMedian, head: headMedian, level: worst([...out.map((f) => f.level), ...clip.map((c) => c.level)]) };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ failures accepted on purpose

/** The shortest reason a person may give for accepting a failure: a word is not a reason. */
export const MIN_WAIVER_REASON = 20;

/** A failure of the judgement that a person accepted on purpose, with what they said and what the tool had said. */
export interface Waived {
  /** `"<frame>:<check>"` (a check of one frame) or `"<check>"` (a check of the clip). */
  key: string;
  reason: string;
  /** The texts of the failures it covers, as the tool wrote them. */
  was: string[];
}

/**
 * `waivers.json` of a clip's inbox: `{ "<frame>:<check>": "why", "<check>": "why" }` — the failures a person accepts ON PURPOSE (a drawing that has no visible sword where the clip needs its anchors,
 * a pose that has to move by a translation to fit). The file is what makes the acceptance explicit and reviewable: it is archived with the delivery, the report lists every waived failure with its reason,
 * and a waiver that matches no failure is refused (a stale one would silently accept whatever comes next). Nothing here lowers a threshold; it only lets a named failure through with its reason attached.
 */
export function parseWaivers(text: string | null): Record<string, string> {
  if (text === null) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new IntakeError(`waivers.json is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new IntakeError('waivers.json must be an object: { "<frame>:<check>": "why this failure is accepted", … }');
  const out: Record<string, string> = {};
  for (const [key, reason] of Object.entries(raw)) {
    if (typeof reason !== 'string' || reason.trim().length < MIN_WAIVER_REASON) throw new IntakeError(`waivers.json: "${key}" needs a reason of at least ${MIN_WAIVER_REASON} characters (say why this failure is accepted)`);
    out[key] = reason.trim();
  }
  return out;
}

/** The judgement with the failures named in `waivers` turned into warnings that say they were accepted and why. A waiver that matches no failure is an error. */
export function applyWaivers(judgement: ClipJudgement, waivers: Record<string, string>): { judgement: ClipJudgement; waived: Waived[] } {
  const keys = Object.keys(waivers);
  if (keys.length === 0) return { judgement, waived: [] };
  const waived: Waived[] = [];
  const turn = (check: Check): Check => ({ ...check, level: 'warn', text: `FALLO ACEPTADO A PROPÓSITO (waivers.json; el motivo, en el informe) — ${check.text}` });
  const touched = new Map<string, string[]>();
  const frames = judgement.frames.map((f) => {
    const checks = f.checks.map((c) => {
      const reason = waivers[`${f.name}:${c.id}`];
      if (reason === undefined || c.level !== 'fail') return c;
      const k = `${f.name}:${c.id}`;
      touched.set(k, [...(touched.get(k) ?? []), c.text]);
      return turn(c);
    });
    return checks.some((c, i) => c !== f.checks[i]) ? { ...f, checks, level: worst(checks.map((c) => c.level)) } : f;
  });
  const clipChecks = judgement.checks.map((c) => {
    const reason = waivers[c.id];
    if (reason === undefined || c.level !== 'fail') return c;
    touched.set(c.id, [...(touched.get(c.id) ?? []), c.text]);
    return turn(c);
  });
  const unused = keys.filter((k) => !touched.has(k));
  if (unused.length > 0) {
    const failing = [...judgement.frames.flatMap((f) => f.checks.filter((c) => c.level === 'fail').map((c) => `${f.name}:${c.id}`)), ...judgement.checks.filter((c) => c.level === 'fail').map((c) => c.id)];
    throw new IntakeError(`waivers.json: ${unused.map((k) => `"${k}"`).join(', ')} ${unused.length === 1 ? 'does' : 'do'} not match any failure of this delivery (a waiver is for a failure that is there; the failures now: ${failing.length === 0 ? 'none' : [...new Set(failing)].join(', ')}) — remove it`);
  }
  for (const k of keys) waived.push({ key: k, reason: waivers[k]!, was: touched.get(k)! });
  return { judgement: { ...judgement, frames, checks: clipChecks, level: worst([...frames.map((f) => f.level), ...clipChecks.map((c) => c.level)]) }, waived };
}
