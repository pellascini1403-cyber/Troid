import { IntakeError, type Canvas, type SwordPoints } from './intake';
import type { RgbaImage } from './png';

/**
 * WHAT A PERSON MAY TAKE OUT OF A DELIVERED DRAWING (docs/PROMPT12-LOG.md §8): the effects an artist painted INTO the figure's own picture — a slash arc, a trail of speed — where the game draws its own (the
 * frames carry no effects: docs/ART-PIPELINE-2D.md). A delivery may carry `erase.json`: per frame, the polygons (in canvas pixels, like the anchors) that enclose such an effect, and the reason. Every pixel whose
 * centre is inside a polygon becomes transparent. NOTHING ELSE CHANGES: no pixel outside moves, is recoloured, redrawn or resampled — the tool takes away, it never adds — and the picture handed in stays archived
 * beside the file, so deleting `erase.json` and handing the clip over again gives the whole drawing back.
 *
 * Refused, so that what can be taken out is effect and never figure: a polygon that covers a pixel of the body (dark and opaque — the painted effects are light, saturated blue and translucent) or any point of the
 * blade (the line from the grip to the tip of `anchors.json`, the one thing of a sword frame that is not allowed to be touched). The step comes AFTER the placement and the anchors, which are read off the placed
 * frame: erasing never moves the figure and so never invalidates them.
 */

export const MIN_ERASE_WHY = 20;

export type Point = [number, number];

/** One frame's entry of `erase.json`. */
export interface EraseEntry {
  why: string;
  polygons: Point[][];
  /**
   * Dark opaque pixels the polygons may cover although the body is dark and opaque: marks PAINTED ON the effect (the speck on a slash arc) that no polygon can leave out, listed one by one and few (at most
   * `MAX_ALLOW_DARK`). A pixel here that is not covered by a polygon, or is not dark and opaque, is a stale entry and is refused; every other dark opaque pixel a polygon covers still refuses it.
   */
  allowDark?: Point[];
}

/** The most dark pixels of one frame that may be taken out as part of an effect: a speck or two, not a way round the protection of the body. */
export const MAX_ALLOW_DARK = 12;

/** What was taken out of one frame, with the frame as it was handed in so the report can show the difference. */
export interface Erased {
  name: string;
  why: string;
  polygons: Point[][];
  /** Visible pixels (alpha > 0) that are transparent now. */
  pixels: number;
  /** One byte per pixel of the frame: 1 where a visible pixel was taken out. */
  mask: Uint8Array;
  /** The frame before the step. */
  before: RgbaImage;
}

/** A pixel of the body: dark and (nearly) opaque. The painted effects of the drawings are light blue (every one of their pixels that is opaque has blue ≥ 224) and translucent. */
export const isBodyPixel = (b: number, alpha: number): boolean => alpha >= 160 && b < 128;

/** The pair of numbers `[x, y]`, or `null`. */
const pairOf = (v: unknown): Point | null => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [v[0] as number, v[1] as number] : null);

/**
 * `erase.json`: `{ "<frame>": { "why": "…", "polygons": [[[x, y], …], …] } }`. Every polygon has at least three vertices inside the canvas; the reason (at least `MIN_ERASE_WHY` characters) says what
 * is taken out and why it is effect and not figure; a frame that is not in the clip is refused.
 */
export function parseErase(text: string | null, names: readonly string[], canvas: Pick<Canvas, 'width' | 'height'>): Record<string, EraseEntry> {
  if (text === null) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new IntakeError(`erase.json is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new IntakeError('erase.json must be an object: { "<frame>": { "why": "what is taken out and why it is an effect", "polygons": [[[x, y], …], …] }, … }');
  const out: Record<string, EraseEntry> = {};
  for (const [name, v] of Object.entries(raw)) {
    if (!names.includes(name)) throw new IntakeError(`erase.json: "${name}" is not a frame of this clip (${names.join(', ')})`);
    const entry = v as { why?: unknown; polygons?: unknown } | null;
    if (typeof entry?.why !== 'string' || entry.why.trim().length < MIN_ERASE_WHY) throw new IntakeError(`erase.json: "${name}" needs a "why" of at least ${MIN_ERASE_WHY} characters (what is taken out, and why it is an effect and not the figure)`);
    if (!Array.isArray(entry.polygons) || entry.polygons.length === 0) throw new IntakeError(`erase.json: "${name}" needs "polygons": a list of polygons, each a list of at least three [x, y] vertices in canvas pixels`);
    const polygons: Point[][] = entry.polygons.map((poly: unknown, i: number) => {
      const vertices = Array.isArray(poly) ? poly.map(pairOf) : [];
      if (vertices.length < 3 || vertices.some((p) => p === null)) throw new IntakeError(`erase.json: "${name}" polygon ${i + 1} needs at least three [x, y] vertices (numbers)`);
      const ps = vertices as Point[];
      if (ps.some(([x, y]) => x < 0 || y < 0 || x > canvas.width || y > canvas.height)) throw new IntakeError(`erase.json: "${name}" polygon ${i + 1} has a vertex outside the canvas of ${canvas.width} × ${canvas.height}`);
      return ps;
    });
    const allow = (entry as { allowDark?: unknown }).allowDark;
    let allowDark: Point[] | undefined;
    if (allow !== undefined) {
      const pts = Array.isArray(allow) ? allow.map(pairOf) : [];
      if (pts.length === 0 || pts.length > MAX_ALLOW_DARK || pts.some((p) => p === null || !Number.isInteger(p[0]) || !Number.isInteger(p[1]) || p[0] < 0 || p[1] < 0 || p[0] >= canvas.width || p[1] >= canvas.height)) {
        throw new IntakeError(`erase.json: "${name}" allowDark must be a list of 1 to ${MAX_ALLOW_DARK} whole-number pixels [x, y] inside the canvas (the dark specks painted on the effect)`);
      }
      allowDark = pts as Point[];
    }
    out[name] = { why: entry.why.trim(), polygons, ...(allowDark ? { allowDark } : {}) };
  }
  return out;
}

/** Whether the point is inside the polygon (even-odd rule). */
export function insidePolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The frames with the pixels inside the polygons of `erase` made transparent (the others come back as they are, the same object). `anchors` are the sword's grip and tip of each frame, when the clip has them:
 * a polygon over their line is refused, and so is one over the body.
 */
export function applyErase(frames: readonly RgbaImage[], names: readonly string[], erase: Readonly<Record<string, EraseEntry>>, anchors: ReadonlyMap<string, SwordPoints> = new Map()): { frames: RgbaImage[]; erased: Erased[] } {
  const erased: Erased[] = [];
  const out = frames.map((frame, k) => {
    const name = names[k]!;
    const entry = erase[name];
    if (!entry) return frame;
    const inAny = (x: number, y: number): boolean => entry.polygons.some((p) => insidePolygon(x, y, p));

    const sword = anchors.get(name);
    if (sword) {
      const length = Math.hypot(sword.tip[0] - sword.grip[0], sword.tip[1] - sword.grip[1]);
      const steps = Math.max(1, Math.ceil(length * 2));
      for (let s = 0; s <= steps; s++) {
        const x = sword.grip[0] + ((sword.tip[0] - sword.grip[0]) * s) / steps;
        const y = sword.grip[1] + ((sword.tip[1] - sword.grip[1]) * s) / steps;
        if (inAny(x + 0.5, y + 0.5)) throw new IntakeError(`erase.json: "${name}" covers the blade (the line from the grip ${sword.grip.join(',')} to the tip ${sword.tip.join(',')} of anchors.json, at ${x.toFixed(1)},${y.toFixed(1)}): a polygon takes out the painted effect, never the sword — draw it clear of the blade`);
      }
    }

    const data = new Uint8Array(frame.data);
    const mask = new Uint8Array(frame.width * frame.height);
    let pixels = 0;
    const body: string[] = [];
    const allowed = new Set((entry.allowDark ?? []).map(([x, y]) => `${x},${y}`));
    const allowedUsed = new Set<string>();
    const hits = entry.polygons.map(() => 0);
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const o = (y * frame.width + x) * 4;
        if (data[o + 3] === 0) continue;
        let inside = false;
        entry.polygons.forEach((p, i) => {
          if (!insidePolygon(x + 0.5, y + 0.5, p)) return;
          hits[i]!++;
          inside = true;
        });
        if (!inside) continue;
        if (isBodyPixel(data[o + 2]!, data[o + 3]!)) {
          if (allowed.has(`${x},${y}`)) allowedUsed.add(`${x},${y}`);
          else {
            body.push(`${x},${y}`);
            continue;
          }
        }
        data.fill(0, o, o + 4);
        mask[y * frame.width + x] = 1;
        pixels++;
      }
    }
    if (body.length > 0) throw new IntakeError(`erase.json: "${name}" covers ${body.length} pixel(s) of the body (dark and opaque; the first at ${body[0]}): a polygon takes out the painted effect, never the figure — draw it clear of the figure`);
    const stale = [...allowed].filter((k) => !allowedUsed.has(k));
    if (stale.length > 0) throw new IntakeError(`erase.json: "${name}" allowDark ${stale.map((k) => `(${k})`).join(', ')} ${stale.length === 1 ? 'is' : 'are'} not a dark opaque pixel inside a polygon — remove ${stale.length === 1 ? 'it' : 'them'}: a dark pixel may be taken out only where it is there, covered, and listed`);
    // a polygon that encloses nothing is a stale one (the drawing or its placement moved): it would silently accept whatever comes next
    const empty = hits.flatMap((n, i) => (n === 0 ? [i + 1] : []));
    if (empty.length > 0) throw new IntakeError(`erase.json: "${name}" polygon ${empty.join(', ')} ${empty.length === 1 ? 'encloses' : 'enclose'} no visible pixel of the frame — remove ${empty.length === 1 ? 'it' : 'them'} (or move ${empty.length === 1 ? 'it' : 'them'} to where the effect is now)`);
    erased.push({ name, why: entry.why, polygons: entry.polygons, pixels, mask, before: frame });
    return { width: frame.width, height: frame.height, data };
  });
  return { frames: out, erased };
}
