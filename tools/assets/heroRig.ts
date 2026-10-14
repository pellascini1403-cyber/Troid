import { about, apply, compose, isIdentity, RigidMls, renderFrame, toDrawing, type Affine, type Drawing, type Pin, type Pt } from './warp';
import type { RgbaImage } from './png';

/**
 * THE PROTAGONIST'S RIG (docs/ART-PIPELINE-2D.md part N): what turns the user's drawings into animation frames without drawing anything. A pose of the sheet (a drawing, cut out of the sheet by
 * `poses.ts`: a transparent background and nothing else) gets a few CONTROL POINTS — the head, the chin, the tips of the antennae, the hand, the tip of the blade, the feet — and a few GROUPS that
 * move together (the head with its antennae, the sword arm, the legs). A frame says how far each group moves from where the drawing has it; `warp.ts` bends the drawing so, rigidly and smoothly,
 * and the points that are not asked to move are pins that hold the rest still. The pixels of every frame are the user's pixels (moved, never made); this module holds no art, only the rule.
 *
 * It is PURE (no I/O): `tools/assets/animate-cli.ts` reads the sheet and the rig and writes the frames; a test checks that the committed frames are what the rig produces.
 */

export type Xy = readonly [number, number];

export interface GroupSpec {
  /** The control points that move with this group. */
  points: readonly string[];
  /** What the group turns about: a control point of the pose or a place in its drawing. */
  pivot: string | Xy;
  /** What it turns about when it turns counter-clockwise (a negative `rot`), if that is another place: a hinge turns about the corner it closes on, so no gap opens on the side it turns toward. */
  pivotCcw?: string | Xy;
  /** The group this one is carried by (a sword arm by the body, antennae by the head): its own move is added to the parent's. */
  parent?: string;
}

export interface AnchorSpec {
  /** Where the anchor is in the drawing (the pixels of the pose, after any mirroring). */
  at: Xy;
  /** The group that carries it: it goes where that group goes. None = it stays with the pins. */
  group?: string;
}

/**
 * A part of the drawing that is its own PIECE: a blade does not bend, it turns. Its pixels are cut out of the drawing (the ones whose centres lie inside `polygon`: a partition, nothing is
 * drawn or filled in), moved as one rigid thing by the group that carries it, and put back over or behind the rest. Where the drawing has nothing behind the piece (a blade over the
 * background) the cut leaves nothing to reconstruct; this is only done for such pieces.
 */
export interface LayerSpec {
  polygon: readonly Xy[];
  /** The group whose move carries the piece. */
  group: string;
  z: 'over' | 'under';
}

export interface RigPose {
  /** The pose of `hero.poses.json` this is the rig of. */
  pose: string;
  /** The drawing's size relative to the others (the sheet draws some poses smaller): frame pixels per drawing pixel = the canvas' × this. Default 1. */
  scale?: number;
  /** Control points, by name, in the pixels of the pose. `feet` is mandatory: the point of the drawing that stands on the pivot. */
  points: Readonly<Record<string, Xy>>;
  groups: Readonly<Record<string, GroupSpec>>;
  /** The two eyes as (x, y, radius): what a frame may dim. */
  eyes?: ReadonlyArray<readonly [number, number, number]>;
  anchors?: Readonly<Record<string, AnchorSpec>>;
  layers?: Readonly<Record<string, LayerSpec>>;
}

export interface GroupMove {
  dx?: number;
  dy?: number;
  /** Degrees, clockwise on screen, about the group's pivot. */
  rot?: number;
  sx?: number;
  sy?: number;
}

export interface GlobalMove {
  rot?: number;
  sx?: number;
  sy?: number;
  dx?: number;
  dy?: number;
  /** What it turns/scales about: a point of the pose, or a place; default the feet. */
  about?: string | Xy;
}

/** One frame: which drawing, and how its groups are moved. */
export interface FrameSpec {
  pose: string;
  move?: Readonly<Record<string, GroupMove>>;
  global?: GlobalMove;
  /** How much the eyes are dimmed: 0 (as drawn) to 1 (almost out). */
  eyes?: number;
  /** Rest the lowest pixel of the figure on the floor (a figure that has fallen), keeping the feet's x. */
  ground?: boolean;
}

export interface Canvas {
  /** Size of a frame in its own pixels. */
  width: number;
  height: number;
  /** Where the feet stand in it (the pivot of the sprite set). */
  pivot: Xy;
  /** Frame pixels per drawing pixel. */
  scale: number;
  /** The set's art pixels per metre once scaled. */
  artPxPerMeter: number;
}

export interface BuiltFrame {
  image: RgbaImage;
  /** Anchors in METRES from the feet (+x forward, +y up), as the manifest wants them. */
  anchors: Record<string, [number, number]>;
  /** The rows the figure was moved down by to rest on the floor (0 unless `ground`). */
  groundShift: number;
  /** Rows and columns of the canvas the figure's pixels reach (alpha ≥ 8), or null for an empty frame. */
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
}

const round = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits;

const place = (rig: RigPose, p: string | Xy): Pt => {
  if (typeof p !== 'string') return { x: p[0], y: p[1] };
  const q = rig.points[p];
  if (!q) throw new Error(`pose "${rig.pose}": there is no point "${p}"`);
  return { x: q[0], y: q[1] };
};

/** The rule of a group: rotate / scale about its pivot, then shift; carried by its parent's. */
function groupTransform(rig: RigPose, name: string, moves: Readonly<Record<string, GroupMove>>, seen: string[] = []): Affine {
  const g = rig.groups[name];
  if (!g) throw new Error(`pose "${rig.pose}": there is no group "${name}"`);
  if (seen.includes(name)) throw new Error(`pose "${rig.pose}": the groups ${[...seen, name].join(' → ')} carry each other`);
  const m = moves[name] ?? {};
  const pivot = (m.rot ?? 0) < 0 && g.pivotCcw !== undefined ? g.pivotCcw : g.pivot;
  const own = about(place(rig, pivot), { rot: m.rot, sx: m.sx, sy: m.sy, dx: m.dx, dy: m.dy });
  if (!g.parent) return own;
  // own first, then the parent's
  return compose(groupTransform(rig, g.parent, moves, [...seen, name]), own);
}

/** Where the control points of a pose are asked to go in a frame (before the global move). */
export function destinations(rig: RigPose, moves: Readonly<Record<string, GroupMove>>): Map<string, Pt> {
  const out = new Map<string, Pt>();
  for (const [name, q] of Object.entries(rig.points)) out.set(name, { x: q[0], y: q[1] });
  const groupOf = new Map<string, string>();
  for (const [gname, g] of Object.entries(rig.groups)) for (const p of g.points) groupOf.set(p, gname);
  for (const [pname, gname] of groupOf) {
    if (!out.has(pname)) throw new Error(`pose "${rig.pose}": the group "${gname}" names a point "${pname}" that does not exist`);
    const t = groupTransform(rig, gname, moves);
    out.set(pname, apply(t, out.get(pname)!));
  }
  return out;
}

/** The eyes of a drawing dimmed: the cyan glow and the white of the pupils fall toward the dark of the face, and so does the halo round them. 0 changes nothing. */
export function dimEyes(img: RgbaImage, eyes: ReadonlyArray<readonly [number, number, number]>, amount: number): RgbaImage {
  if (amount <= 0 || eyes.length === 0) return img;
  const out = new Uint8Array(img.data);
  const dark = [14, 20, 34];
  for (const [cx, cy, r] of eyes) {
    const reach = r * 1.35;
    const x0 = Math.max(0, Math.floor(cx - reach));
    const x1 = Math.min(img.width - 1, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach));
    const y1 = Math.min(img.height - 1, Math.ceil(cy + reach));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > reach) continue;
        const o = (y * img.width + x) * 4;
        if (out[o + 3]! === 0) continue;
        // how much the pixel is LIGHT (the glow): the dark face around the eye is left alone
        const lum = 0.299 * out[o]! + 0.587 * out[o + 1]! + 0.114 * out[o + 2]!;
        const glow = Math.max(0, Math.min(1, (lum - 40) / 120));
        // the edge of the halo fades the effect so that no ring is left
        const fall = d <= r ? 1 : 1 - (d - r) / (reach - r);
        const k = amount * glow * fall;
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(out[o + c]! * (1 - k) + dark[c]! * k);
      }
    }
  }
  return { width: img.width, height: img.height, data: out };
}

export interface DrawingSet {
  /** The pose images by name, as `poses.ts` cut them (straight RGBA, facing right). */
  images: ReadonlyMap<string, RgbaImage>;
  rig: Readonly<Record<string, RigPose>>;
}

/** Is the centre of pixel (x, y) inside the polygon (even-odd rule, drawing pixels)? */
function inside(poly: readonly Xy[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** A drawing cut in two by a polygon: the pixels inside it, and the pixels outside it. A partition: every pixel of the drawing is in exactly one of the two, unchanged. */
export function partition(img: RgbaImage, polygon: readonly Xy[]): { piece: RgbaImage; rest: RgbaImage } {
  const piece = new Uint8Array(img.data.length);
  const rest = new Uint8Array(img.data);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!inside(polygon, x + 0.5, y + 0.5)) continue;
      const o = (y * img.width + x) * 4;
      for (let c = 0; c < 4; c++) {
        piece[o + c] = img.data[o + c]!;
        rest[o + c] = 0;
      }
    }
  }
  return { piece: { width: img.width, height: img.height, data: piece }, rest: { width: img.width, height: img.height, data: rest } };
}

/** `top` over `bottom` (straight RGBA, same size): the usual "over", in float. */
export function over(bottom: RgbaImage, top: RgbaImage): RgbaImage {
  const out = new Uint8Array(bottom.data.length);
  for (let o = 0; o < out.length; o += 4) {
    const ta = top.data[o + 3]! / 255;
    const ba = bottom.data[o + 3]! / 255;
    const a = ta + ba * (1 - ta);
    if (a <= 1 / 512) continue;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round((top.data[o + c]! * ta + bottom.data[o + c]! * ba * (1 - ta)) / a);
    out[o + 3] = Math.round(a * 255);
  }
  return { width: bottom.width, height: bottom.height, data: out };
}

/**
 * One frame. The drawing is bent by the control points (the groups' moves, then the whole figure's move) and drawn on the set's canvas with the feet on the pivot — or, for a figure that has
 * fallen, with the lowest pixel on the floor. The pieces the rig cuts out (a blade) are turned as one rigid thing and put back. The anchors go where their groups go.
 */
export class FrameBuilder {
  private readonly drawings = new Map<string, Drawing>();

  constructor(
    private readonly set: DrawingSet,
    private readonly canvas: Canvas,
  ) {}

  private image(pose: string, dim: number): RgbaImage {
    const img = this.set.images.get(pose);
    const rig = this.set.rig[pose];
    if (!img || !rig) throw new Error(`there is no drawing "${pose}"`);
    return dim > 0 ? dimEyes(img, rig.eyes ?? [], dim) : img;
  }

  private drawing(pose: string, dim: number): Drawing {
    const key = `${pose}@${dim.toFixed(2)}`;
    let d = this.drawings.get(key);
    if (!d) {
      d = toDrawing(this.image(pose, dim));
      this.drawings.set(key, d);
    }
    return d;
  }

  build(spec: FrameSpec): BuiltFrame {
    const rig = this.set.rig[spec.pose];
    if (!rig) throw new Error(`there is no rig for the pose "${spec.pose}"`);
    const { canvas } = this;
    const k = canvas.scale * (rig.scale ?? 1);
    const moves = spec.move ?? {};
    for (const g of Object.keys(moves)) if (!rig.groups[g]) throw new Error(`pose "${spec.pose}": a frame moves the group "${g}", which does not exist`);
    const to = destinations(rig, moves);
    const pins: Pin[] = [];
    for (const [name, q] of Object.entries(rig.points)) pins.push({ src: { x: q[0], y: q[1] }, dst: to.get(name)! });
    const warp = new RigidMls(pins);

    const feet = place(rig, 'feet');
    const gm = spec.global;
    const global: Affine | undefined = gm ? about(place(rig, gm.about ?? 'feet'), { rot: gm.rot, sx: gm.sx, sy: gm.sy, dx: gm.dx, dy: gm.dy }) : undefined;
    // the frame space in which the feet (before the global move) are the origin of the canvas' pivot
    const origin: Pt = { x: feet.x - canvas.pivot[0] / k, y: feet.y - canvas.pivot[1] / k };
    const dim = Math.max(0, Math.min(1, spec.eyes ?? 0));
    const dimKey = Math.round(dim * 20) / 20;
    // a figure that is to rest on the floor is first drawn on a canvas taller than the sprite, so that what a topple sends below the feet is not lost before it is found
    const extra = spec.ground ? GROUND_ROOM : 0;
    const target = { width: canvas.width, height: canvas.height + extra, scale: k, origin };

    // the pieces that are moved: a piece whose group is at rest stays in the drawing
    const moved: Array<{ name: string; z: 'over' | 'under'; t: Affine }> = [];
    for (const [name, layer] of Object.entries(rig.layers ?? {})) {
      const t = groupTransform(rig, layer.group, moves);
      if (!isIdentity(t)) moved.push({ name, z: layer.z, t });
    }
    let main: Drawing = this.drawing(spec.pose, dimKey);
    const pieces: Array<{ z: 'over' | 'under'; drawing: Drawing; t: Affine }> = [];
    if (moved.length > 0) {
      // cut the drawing by each moved piece in turn (a piece is cut from what the earlier cuts left)
      let rest = this.image(spec.pose, dimKey);
      for (const m of moved) {
        const { piece, rest: r } = partition(rest, rig.layers![m.name]!.polygon);
        rest = r;
        pieces.push({ z: m.z, drawing: toDrawing(piece), t: m.t });
      }
      main = toDrawing(rest);
    }

    let image = renderFrame(main, target, { warp, global });
    for (const p of pieces) {
      const piece = renderFrame(p.drawing, target, { warp: null, global: global ? compose(global, p.t) : p.t });
      image = p.z === 'over' ? over(image, piece) : over(piece, image);
    }

    let groundShift = 0;
    let result = image;
    if (spec.ground) {
      const low = lowestRow(image, 96);
      if (low >= 0) {
        groundShift = Math.round(canvas.pivot[1]) - low;
        result = shiftRows(image, groundShift);
      }
      result = cropRows(result, canvas.height);
    }

    // anchors: where the group that carries each one has taken it
    const anchors: Record<string, [number, number]> = {};
    for (const [id, a] of Object.entries(rig.anchors ?? {})) {
      let p: Pt = { x: a.at[0], y: a.at[1] };
      if (a.group) p = apply(groupTransform(rig, a.group, moves), p);
      if (global) p = apply(global, p);
      const px = (p.x - origin.x) * k;
      const py = (p.y - origin.y) * k + groundShift;
      anchors[id] = [round((px - canvas.pivot[0]) / canvas.artPxPerMeter, 3), round((canvas.pivot[1] - py) / canvas.artPxPerMeter, 3)];
    }
    return { image: result, anchors, groundShift, bounds: boundsOf(result) };
  }
}

export function lowestRow(img: RgbaImage, minAlpha: number): number {
  for (let y = img.height - 1; y >= 0; y--) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]! >= minAlpha) return y;
  return -1;
}

/** The first `rows` rows of an image. */
export function cropRows(img: RgbaImage, rows: number): RgbaImage {
  if (rows >= img.height) return img;
  return { width: img.width, height: rows, data: img.data.slice(0, rows * img.width * 4) };
}

/** Rows below the sprite's canvas that a figure resting on the floor is drawn on before it is found (what a topple sends under the feet). */
const GROUND_ROOM = 128;

export function shiftRows(img: RgbaImage, dy: number): RgbaImage {
  if (dy === 0) return img;
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= img.height) continue;
    out.set(img.data.subarray(sy * img.width * 4, (sy + 1) * img.width * 4), y * img.width * 4);
  }
  return { width: img.width, height: img.height, data: out };
}

export function boundsOf(img: RgbaImage, minAlpha = 8): { x0: number; y0: number; x1: number; y1: number } | null {
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
