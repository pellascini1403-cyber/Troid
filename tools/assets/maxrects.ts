/**
 * Rectangle packing for atlas pages (docs/ART-PIPELINE-2D.md, part C): MAXRECTS with the "best short side fit" rule, the packer most atlas tools use.
 * Pure and deterministic — the same boxes give the same pages, byte for byte, on any machine — and with no knowledge of pixels: boxes in, positions out.
 *
 * What it adds to the textbook algorithm is the page policy of the game: the SMALLEST square bin that takes everything that is left (a hero's frames
 * should not cost a 2048 × 2048 page when 1024 × 640 holds them), pages no larger than `maxSide`, and every page cropped to what it uses and rounded up to
 * a multiple of `align` pixels.
 */
export interface Box {
  id: number;
  w: number;
  h: number;
}

export interface Slot {
  id: number;
  x: number;
  y: number;
}

export interface PackedPage {
  width: number;
  height: number;
  slots: Slot[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class Bin {
  private free: Rect[];

  constructor(width: number, height: number) {
    this.free = [{ x: 0, y: 0, w: width, h: height }];
  }

  /** Places a box where it leaves the least room around it (short side first, then long side, then top-left). `null` when it fits nowhere. */
  insert(w: number, h: number): { x: number; y: number } | null {
    let best: Rect | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const f of this.free) {
      if (f.w < w || f.h < h) continue;
      const left = f.w - w;
      const above = f.h - h;
      const short = Math.min(left, above);
      const long = Math.max(left, above);
      const better = short < bestShort || (short === bestShort && (long < bestLong || (long === bestLong && best !== null && (f.y < best.y || (f.y === best.y && f.x < best.x)))));
      if (better) {
        best = f;
        bestShort = short;
        bestLong = long;
      }
    }
    if (!best) return null;
    const placed: Rect = { x: best.x, y: best.y, w, h };
    this.cut(placed);
    return { x: placed.x, y: placed.y };
  }

  /** Takes `used` out of every free rectangle it touches, leaving the (up to four) pieces around it, and drops the pieces another one already contains. */
  private cut(used: Rect): void {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) {
        next.push(f);
        continue;
      }
      if (used.x > f.x) next.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
      if (used.x + used.w < f.x + f.w) next.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - (used.x + used.w), h: f.h });
      if (used.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
      if (used.y + used.h < f.y + f.h) next.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - (used.y + used.h) });
    }
    this.free = next.filter((a, i) => !next.some((b, j) => i !== j && contains(b, a) && (!contains(a, b) || j < i)));
  }
}

const contains = (outer: Rect, inner: Rect): boolean => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const roundUp = (n: number, to: number): number => Math.ceil(n / to) * to;

/** Packs every box of the list into a `side × side` bin, or none of them (`null`). */
function packAll(boxes: readonly Box[], side: number): Slot[] | null {
  const bin = new Bin(side, side);
  const slots: Slot[] = [];
  for (const b of boxes) {
    const at = bin.insert(b.w, b.h);
    if (!at) return null;
    slots.push({ id: b.id, ...at });
  }
  return slots;
}

/**
 * Packs boxes into as few pages as the limit allows, each as small as it can be. Throws, naming the box, on one that cannot fit a page at all.
 * `align` is what a page's width and height are rounded up to (4: what texture compressors and some GPUs like).
 */
export function packPages(boxes: readonly Box[], maxSide: number, align = 4): PackedPage[] {
  for (const b of boxes) {
    if (!(b.w >= 1 && b.h >= 1) || !Number.isInteger(b.w) || !Number.isInteger(b.h)) throw new Error(`box ${b.id} is ${b.w} × ${b.h}: sizes must be whole and positive`);
    if (b.w > maxSide || b.h > maxSide) throw new Error(`box ${b.id} is ${b.w} × ${b.h}: it does not fit a page of ${maxSide} × ${maxSide}`);
  }
  // biggest first (the usual order that wastes least), ties by id so that the result never depends on the input order of equal boxes
  const sorted = [...boxes].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.id - b.id);
  const pages: PackedPage[] = [];
  let rest = sorted;
  while (rest.length > 0) {
    const area = rest.reduce((n, b) => n + b.w * b.h, 0);
    let slots: Slot[] | null = null;
    let left: Box[] = [];
    // the smallest square bin that takes everything that is left…
    for (let side = Math.min(maxSide, roundUp(Math.ceil(Math.sqrt(area)), 32)); side <= maxSide && !slots; side += 32) slots = packAll(rest, Math.min(side, maxSide));
    // …or, if even a full page does not, a full page of as many as fit (the rest go to the next one)
    if (!slots) {
      const bin = new Bin(maxSide, maxSide);
      slots = [];
      for (const b of rest) {
        const at = bin.insert(b.w, b.h);
        if (at) slots.push({ id: b.id, ...at });
        else left.push(b);
      }
    } else left = [];
    const byId = new Map(rest.map((b) => [b.id, b]));
    let width = 0;
    let height = 0;
    for (const s of slots) {
      const b = byId.get(s.id)!;
      width = Math.max(width, s.x + b.w);
      height = Math.max(height, s.y + b.h);
    }
    pages.push({ width: Math.min(maxSide, roundUp(width, align)), height: Math.min(maxSide, roundUp(height, align)), slots });
    rest = left;
  }
  return pages;
}
