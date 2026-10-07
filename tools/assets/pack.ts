import { createHash } from 'node:crypto';
import type { AtlasFrameJson, AtlasRect } from '../../src/presentation/artAtlas';
import { packPages } from './maxrects';
import type { RgbaImage } from './png';

/**
 * THE ATLAS PACKER (docs/ART-PIPELINE-2D.md, part C): frames in, atlas pages and their JSON out. Every operation it performs is TECHNICAL and lossless:
 *
 *  - TRIM: the rows and columns of a frame that are fully transparent (alpha 0) are cut off, and where the remaining pixels sit in the original frame is
 *    written down (`spriteSourceSize`, `sourceSize`) so that the original is always rebuildable and the pivot — a fraction of the ORIGINAL frame — never moves.
 *    Nothing that has even one visible pixel is ever cut: this is not an auto-crop to "the interesting part".
 *  - DEDUPE: frames whose trimmed pixels, offset and original size are identical share one rectangle of the page (a held pose is stored once).
 *  - PAD and EXTRUDE: a gutter around each frame, filled with the frame's own edge pixels, so that a sprite drawn at a fractional position never shows its
 *    neighbour. The gutter is OUTSIDE the frame's rectangle: not one pixel of the art is altered.
 *  - PACK: MaxRects pages, each as small as it can be, none larger than `maxSide`.
 *
 * It never resamples, recolours, sharpens, blends or reorders pixels: `unpackFrame` below rebuilds every original frame from the pages bit for bit, and the
 * tests prove that for every frame they pack.
 */
export interface PackOptions {
  /** Largest page side in pixels. 2048 is what every phone's GPU takes. */
  maxSide: number;
  /** Pixels between frames (and around them): at least `extrude`. */
  padding: number;
  /** Pixels of the frame's own edge repeated outwards, into the padding. */
  extrude: number;
  /** Cut the fully transparent border of each frame (recording where the pixels were). */
  trim: boolean;
}

export const DEFAULT_PACK: PackOptions = { maxSide: 2048, padding: 2, extrude: 1, trim: true };

export interface SourceFrame {
  name: string;
  image: RgbaImage;
}

/** Where a frame sits in the pages, in the atlas JSON's own terms. */
export interface PackedFrame extends AtlasFrameJson {
  /** The page it is on. */
  page: number;
  /** The frame it shares its pixels with, when it is a duplicate (the first by name). */
  sameAs?: string;
}

export interface PackedPage {
  image: RgbaImage;
}

export interface PackStats {
  frames: number;
  /** Distinct pixel rectangles stored (frames − duplicates). */
  stored: number;
  duplicates: number;
  /** Pixels of the frames as they came / as they are stored (trimmed, no duplicates) / of the pages. */
  sourcePixels: number;
  storedPixels: number;
  pagePixels: number;
}

export interface PackResult {
  pages: PackedPage[];
  /** Every frame by name. */
  frames: Record<string, PackedFrame>;
  stats: PackStats;
}

interface Prepared {
  name: string;
  /** The trimmed pixels. */
  image: RgbaImage;
  /** Where they sit inside the original frame, and its size. */
  offset: { x: number; y: number };
  source: { w: number; h: number };
  trimmed: boolean;
  key: string;
}

/** The smallest rectangle that holds every pixel with alpha > 0, or `null` for a frame with none. */
export function opaqueBounds(img: RgbaImage): AtlasRect | null {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function crop(img: RgbaImage, r: AtlasRect): RgbaImage {
  const data = new Uint8Array(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) data.set(img.data.subarray(((r.y + y) * img.width + r.x) * 4, ((r.y + y) * img.width + r.x + r.w) * 4), y * r.w * 4);
  return { width: r.w, height: r.h, data };
}

function prepare(frame: SourceFrame, trim: boolean): Prepared {
  const { image } = frame;
  const full: AtlasRect = { x: 0, y: 0, w: image.width, h: image.height };
  // a frame with nothing visible (a blink between two poses) keeps one transparent pixel: its place in the clip is the information
  const bounds = trim ? opaqueBounds(image) ?? { x: 0, y: 0, w: 1, h: 1 } : full;
  const trimmed = bounds.x !== 0 || bounds.y !== 0 || bounds.w !== image.width || bounds.h !== image.height;
  const pixels = trimmed ? crop(image, bounds) : image;
  const key = createHash('sha1')
    .update(`${pixels.width}x${pixels.height}@${bounds.x},${bounds.y}/${image.width}x${image.height}`)
    .update(pixels.data)
    .digest('hex');
  return { name: frame.name, image: pixels, offset: { x: bounds.x, y: bounds.y }, source: { w: image.width, h: image.height }, trimmed, key };
}

/** Copies `src` onto `dst` at (dx, dy) — a plain copy of the four channels, no blending. */
function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) dst.data.set(src.data.subarray(y * src.width * 4, (y + 1) * src.width * 4), ((dy + y) * dst.width + dx) * 4);
}

/** Repeats the frame's edge pixels `extrude` pixels outwards (corners included), onto the page around the frame placed at (fx, fy). */
function extrudeEdges(page: RgbaImage, fx: number, fy: number, w: number, h: number, extrude: number): void {
  for (let gy = fy - extrude; gy < fy + h + extrude; gy++) {
    for (let gx = fx - extrude; gx < fx + w + extrude; gx++) {
      if (gx >= fx && gx < fx + w && gy >= fy && gy < fy + h) continue;
      const sx = Math.min(fx + w - 1, Math.max(fx, gx));
      const sy = Math.min(fy + h - 1, Math.max(fy, gy));
      page.data.copyWithin((gy * page.width + gx) * 4, (sy * page.width + sx) * 4, (sy * page.width + sx) * 4 + 4);
    }
  }
}

/** Packs the frames into pages. Throws, naming the frame, on one that cannot fit a page. Deterministic: the order of `frames` does not matter. */
export function packFrames(frames: readonly SourceFrame[], options: Partial<PackOptions> = {}): PackResult {
  const opts: PackOptions = { ...DEFAULT_PACK, ...options };
  if (opts.extrude > opts.padding) throw new Error(`extrude (${opts.extrude}) cannot be more than the padding (${opts.padding}): the edge pixels are repeated INTO the padding`);
  const names = new Set<string>();
  for (const f of frames) {
    if (names.has(f.name)) throw new Error(`frame "${f.name}" is given twice`);
    names.add(f.name);
  }
  const ordered = [...frames].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const prepared = ordered.map((f) => prepare(f, opts.trim));

  // identical frames are stored once, under the first name
  const stored: Prepared[] = [];
  const firstOf = new Map<string, Prepared>();
  for (const p of prepared) {
    if (!firstOf.has(p.key)) {
      firstOf.set(p.key, p);
      stored.push(p);
    }
  }

  const pad = opts.padding;
  for (const p of stored) {
    if (p.image.width + 2 * pad > opts.maxSide || p.image.height + 2 * pad > opts.maxSide) {
      throw new Error(`frame "${p.name}" is ${p.image.width} × ${p.image.height} (with ${pad} px of padding) and does not fit a page of ${opts.maxSide} × ${opts.maxSide}`);
    }
  }
  const layout = packPages(
    stored.map((p, id) => ({ id, w: p.image.width + 2 * pad, h: p.image.height + 2 * pad })),
    opts.maxSide,
  );

  const pages: PackedPage[] = [];
  const placed = new Map<Prepared, { page: number; rect: AtlasRect }>();
  layout.forEach((page, pageIndex) => {
    const image: RgbaImage = { width: page.width, height: page.height, data: new Uint8Array(page.width * page.height * 4) };
    for (const slot of page.slots) {
      const p = stored[slot.id]!;
      const fx = slot.x + pad;
      const fy = slot.y + pad;
      blit(image, p.image, fx, fy);
      if (opts.extrude > 0) extrudeEdges(image, fx, fy, p.image.width, p.image.height, opts.extrude);
      placed.set(p, { page: pageIndex, rect: { x: fx, y: fy, w: p.image.width, h: p.image.height } });
    }
    pages.push({ image });
  });

  const out: Record<string, PackedFrame> = {};
  for (const p of prepared) {
    const first = firstOf.get(p.key)!;
    const at = placed.get(first)!;
    const frame: PackedFrame = { frame: { ...at.rect }, page: at.page };
    if (p.trimmed) {
      frame.trimmed = true;
      frame.spriteSourceSize = { x: p.offset.x, y: p.offset.y, w: p.image.width, h: p.image.height };
    }
    frame.sourceSize = { ...p.source };
    if (first !== p) frame.sameAs = first.name;
    out[p.name] = frame;
  }
  const sourcePixels = frames.reduce((n, f) => n + f.image.width * f.image.height, 0);
  return {
    pages,
    frames: out,
    stats: {
      frames: frames.length,
      stored: stored.length,
      duplicates: frames.length - stored.length,
      sourcePixels,
      storedPixels: stored.reduce((n, p) => n + p.image.width * p.image.height, 0),
      pagePixels: pages.reduce((n, p) => n + p.image.width * p.image.height, 0),
    },
  };
}

/** The TexturePacker "hash" JSON of one page: the frames that sit on it, as the engine's atlas reader takes them. */
export function atlasJson(result: PackResult, pageIndex: number, imageFile: string): Record<string, unknown> {
  const page = result.pages[pageIndex];
  if (!page) throw new Error(`there is no page ${pageIndex}`);
  const frames: Record<string, AtlasFrameJson> = {};
  for (const name of Object.keys(result.frames)) {
    const f = result.frames[name]!;
    if (f.page !== pageIndex) continue;
    const entry: AtlasFrameJson = { frame: f.frame };
    if (f.trimmed) entry.trimmed = true;
    if (f.spriteSourceSize) entry.spriteSourceSize = f.spriteSourceSize;
    if (f.sourceSize) entry.sourceSize = f.sourceSize;
    frames[name] = entry;
  }
  return { frames, meta: { app: 'troid-assets', version: '1', image: imageFile, format: 'RGBA8888', size: { w: page.image.width, h: page.image.height }, scale: '1' } };
}

/**
 * Rebuilds a frame as it was handed in — the whole original rectangle, transparent where it was trimmed — from the page it was packed on. It is what the
 * renderer's texture (`frame`, `trim`, `orig`) draws, and the proof that packing lost nothing.
 */
export function unpackFrame(result: PackResult, name: string): RgbaImage {
  const f = result.frames[name];
  if (!f) throw new Error(`no frame "${name}"`);
  const page = result.pages[f.page]!.image;
  const size = f.sourceSize ?? { w: f.frame.w, h: f.frame.h };
  const out: RgbaImage = { width: size.w, height: size.h, data: new Uint8Array(size.w * size.h * 4) };
  const off = f.spriteSourceSize ?? { x: 0, y: 0, w: f.frame.w, h: f.frame.h };
  for (let y = 0; y < f.frame.h; y++) {
    out.data.set(page.data.subarray(((f.frame.y + y) * page.width + f.frame.x) * 4, ((f.frame.y + y) * page.width + f.frame.x + f.frame.w) * 4), ((off.y + y) * size.w + off.x) * 4);
  }
  return out;
}
