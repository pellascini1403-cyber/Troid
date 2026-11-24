import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { heroPaths, readDelivered } from './heroRepo';
import { decodePng, encodePng, type RgbaImage } from './png';
import { DERIVED_CLIPS } from './heroDerivedClips';
import { about, apply, compose, renderFrame, RigidMls, toDrawing, type Affine, type Pin, type Pt, type Target } from './warp';

/**
 * THE POSES THE SHEET HAS NO DRAWING FOR (docs/PROMPT24-LOG.md, F5). The owner's character sheet has twelve actions; the game asks for eighteen. The owner will not draw the rest, so they are MADE here, from the owner's own drawings,
 * with the one tool the repository already has for making a drawing move without a pixel being invented — the puppet warp (`warp.ts`) — and a few rigid moves of the whole figure:
 *
 *   • the crouch, the crawl and the crouch blow are the idle, the walk and the strike with the body brought down — the head, the scarf and the sword keep their size and their drawing, and only the little body between the head and the floor is squeezed;
 *   • the second blow is the first one's drawings turned about the hand (the blade rises where the first one thrusts), the air blow is the same drawings tipped over the other way, and both start and end with the owner's own jump and fall;
 *   • the drink has the one thing the sheet cannot lend — a glass vial and the small arm that holds it — drawn here in the same dark-with-a-light-edge way as the rest, over the owner's drawing, with the head tilted back about the neck.
 *
 * PURE and deterministic: the same frames always give the same pixels, so `assets:derive --check` (and a test) can hold the committed frames to their recipe. The sword's anchors travel through the same moves as the pixels.
 */

export const CANVAS = { width: 320, height: 230 } as const;
export const PX_PER_M = 65;
export const PIVOT: Pt = { x: 160, y: 192 };

export const toPx = (m: readonly [number, number]): Pt => ({ x: PIVOT.x + m[0] * PX_PER_M, y: PIVOT.y - m[1] * PX_PER_M });
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
export const toMeters = (p: Pt): [number, number] => [r3((p.x - PIVOT.x) / PX_PER_M), r3((PIVOT.y - p.y) / PX_PER_M)];

const TARGET: Target = { width: CANVAS.width, height: CANVAS.height, scale: 1, origin: { x: 0, y: 0 } };
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------------------------------------------------------------------------------------ measuring a drawing

export interface Measure {
  /** The centre of the eye (the brightest blob), in the canvas' pixels. */
  eye: Pt;
  /** The top of the drawing (the tip of the antenna) and its bottom (the feet). */
  top: number;
  bottom: number;
}

export function measure(img: RgbaImage): Measure {
  let ex = 0;
  let ey = 0;
  let en = 0;
  let top = img.height;
  let bottom = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      const a = img.data[o + 3]!;
      if (a >= 48) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
      if (a >= 200 && img.data[o]! >= 185 && img.data[o + 1]! >= 225 && img.data[o + 2]! >= 235) {
        ex += x;
        ey += y;
        en++;
      }
    }
  }
  return { eye: en > 0 ? { x: ex / en, y: ey / en } : { x: img.width / 2, y: img.height / 2 }, top, bottom };
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ the crouch: the body brought down, the head and the scarf kept

export interface CrouchSpec {
  /** The line under the head where the body begins (canvas y, in the SOURCE drawing). */
  neckY: number;
  /** The floor (canvas y): it does not move. */
  floorY: number;
  /** How far the head comes down, px. */
  drop: number;
  /** How far the head leans forward, px (the lean fades to nothing at the floor). */
  lean: number;
}

/**
 * The head and everything above the neck line move down as one piece (so the eye, the ears and the scarf at the neck keep their size and shape), the stretch between the neck and the floor is squeezed to take up the rest, and
 * the floor stays where it is. It is a warp of y alone, plus a lean that is greatest at the head.
 */
export class CrouchWarp extends RigidMls {
  constructor(readonly spec: CrouchSpec) {
    super([{ src: { x: 0, y: 0 }, dst: { x: 1, y: 1 } } as Pin]); // not the identity: `renderFrame` skips a warp that is
  }

  private get squeeze(): number {
    const { neckY, floorY, drop } = this.spec;
    return (floorY - neckY - drop) / (floorY - neckY);
  }
  /** Source y → frame y. */
  fy(y: number): number {
    const { neckY, floorY, drop } = this.spec;
    if (y <= neckY) return y + drop;
    if (y >= floorY) return y;
    return neckY + drop + (y - neckY) * this.squeeze;
  }
  /** Frame y → source y. */
  gy(yp: number): number {
    const { neckY, floorY, drop } = this.spec;
    if (yp >= floorY) return yp;
    if (yp <= neckY + drop) return yp - drop;
    return neckY + (yp - neckY - drop) / this.squeeze;
  }
  private lean(yp: number): number {
    return this.spec.lean * clamp01((this.spec.floorY - yp) / 130);
  }
  override map(x: number, y: number, out: Pt): Pt {
    out.x = x - this.lean(y);
    out.y = this.gy(y);
    return out;
  }
  /** Where a point of the source drawing ends up. */
  forward(p: Pt): Pt {
    const y = this.fy(p.y);
    return { x: p.x + this.lean(y), y };
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ drawing a few small things by code

function over(dst: RgbaImage, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= dst.width || y >= dst.height || a <= 0) return;
  const o = (y * dst.width + x) * 4;
  const da = dst.data[o + 3]! / 255;
  const oa = a + da * (1 - a);
  if (oa <= 0) return;
  dst.data[o] = Math.round((r * a + dst.data[o]! * da * (1 - a)) / oa);
  dst.data[o + 1] = Math.round((g * a + dst.data[o + 1]! * da * (1 - a)) / oa);
  dst.data[o + 2] = Math.round((b * a + dst.data[o + 2]! * da * (1 - a)) / oa);
  dst.data[o + 3] = Math.round(oa * 255);
}

/** Anti-aliased painting of a shape given as `(x, y) => colour | null` over a bounding box: 4 × 4 samples per pixel. */
function paint(dst: RgbaImage, box: { x0: number; y0: number; x1: number; y1: number }, shade: (x: number, y: number) => readonly [number, number, number, number] | null): void {
  const N = 4;
  for (let y = Math.floor(box.y0); y <= Math.ceil(box.y1); y++) {
    for (let x = Math.floor(box.x0); x <= Math.ceil(box.x1); x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const c = shade(x + (i + 0.5) / N, y + (j + 0.5) / N);
          if (!c) continue;
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      if (a <= 0) continue;
      over(dst, x, y, r / a, g / a, b / a, a / (N * N));
    }
  }
}

const dist = (px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } => {
  const vx = bx - ax;
  const vy = by - ay;
  const t = clamp01(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1));
  return { d: Math.hypot(px - (ax + vx * t), py - (ay + vy * t)), t };
};

/** The little arm that holds the vial: a tapered capsule in the dark of the rest of the body, with a thin cyan light along the edge that faces up. */
export function paintArm(dst: RgbaImage, from: Pt, to: Pt, w0: number, w1: number): void {
  const pad = Math.max(w0, w1) + 2;
  paint(dst, { x0: Math.min(from.x, to.x) - pad, y0: Math.min(from.y, to.y) - pad, x1: Math.max(from.x, to.x) + pad, y1: Math.max(from.y, to.y) + pad }, (x, y) => {
    const { d, t } = dist(x, y, from.x, from.y, to.x, to.y);
    const r = (w0 + (w1 - w0) * t) / 2;
    if (d > r) return null;
    const rim = r - d < 1.3 && y < (from.y + (to.y - from.y) * t) ? 0.55 : 0;
    return [10 + 40 * rim, 14 + 150 * rim, 20 + 190 * rim, 1];
  });
}

export interface VialSpec {
  /** The base of the vial and which way it points (degrees, 0 = up, clockwise on screen). */
  at: Pt;
  tilt: number;
  /** How full: 0 → 1. */
  fill: number;
}

/** A small cylindrical glass flask with a cork and softly glowing cyan liquid, 11 × 25 px: glass in the dark teal of the scene, a light line down the lit side, the liquid brighter toward its surface. */
export function paintVial(dst: RgbaImage, v: VialSpec): void {
  const t = (v.tilt * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  paint(dst, { x0: v.at.x - 22, y0: v.at.y - 32, x1: v.at.x + 22, y1: v.at.y + 8 }, (x, y) => {
    // into the vial's own space: x across, u up from the base
    const dx = x - v.at.x;
    const dy = y - v.at.y;
    const lx = dx * cos + dy * sin;
    const u = -(dy * cos - dx * sin);
    const hw = u < 16 ? 5.4 : 3.4; // the body, then the neck
    if (u < 0 || u > 23 || Math.abs(lx) > hw) {
      if (u >= 23 && u <= 27 && Math.abs(lx) <= 3.8) return [150, 108, 70, 1]; // the cork
      return null;
    }
    // the rounded base
    if (u < 3 && Math.hypot(Math.max(0, Math.abs(lx) - 2.4), u - 3) > 3) return null;
    const rimDark = hw - Math.abs(lx) < 1 || u < 1;
    const level = 14 * v.fill + 1;
    if (u <= level && u < 16) {
      const glow = 0.55 + 0.45 * clamp01((u - level + 6) / 6);
      return rimDark ? [20, 80, 110, 1] : [Math.round(70 * glow + 20), Math.round(190 * glow + 40), Math.round(240 * glow), 1];
    }
    if (lx < -hw + 1.8 && u > 3 && u < 20) return [210, 244, 255, 0.9]; // the light on the lit side
    return rimDark ? [30, 70, 90, 0.95] : [24, 54, 70, 0.55];
  });
}

/** A soft bright light over a point (the eyes at full glow): added to the colour, never beyond what is already drawn there. */
export function glowOver(dst: RgbaImage, at: Pt, radius: number, strength: number): void {
  for (let y = Math.floor(at.y - radius); y <= Math.ceil(at.y + radius); y++) {
    for (let x = Math.floor(at.x - radius); x <= Math.ceil(at.x + radius); x++) {
      if (x < 0 || y < 0 || x >= dst.width || y >= dst.height) continue;
      const k = Math.max(0, 1 - Math.hypot(x - at.x, y - at.y) / radius);
      if (k <= 0) continue;
      const o = (y * dst.width + x) * 4;
      if (dst.data[o + 3]! < 200) continue;
      const add = strength * k * k * 255;
      dst.data[o] = Math.min(255, dst.data[o]! + add * 0.55);
      dst.data[o + 1] = Math.min(255, dst.data[o + 1]! + add * 0.85);
      dst.data[o + 2] = Math.min(255, dst.data[o + 2]! + add);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------------------ one frame of a derived clip

export type Anchors = Record<string, [number, number]>;

export interface DerivedFrame {
  image: RgbaImage;
  /** The anchors the source frame had, moved through the same operations (empty for clips without a sword). */
  anchors: Anchors;
}

export interface FrameOp {
  /** The owner's frame it is made from. */
  from: string;
  /** The frame whose sword anchors it takes (a frame of the sheet without a sword — the jump, the fall, the idle — borrows those of the blow's own drawing nearest to it). */
  anchorsOf?: string;
  /** Bring the body down (the crouch). */
  crouch?: { drop?: number; eyeAt?: number; lean?: number };
  /** Turn the whole figure (degrees, clockwise on screen) about a point: 'hand' (the sword's grip), 'feet', or a canvas point. */
  turn?: { deg: number; about: 'hand' | 'feet' | Pt };
  /** Shift the whole figure, px (+x forward, +y down). */
  dx?: number;
  dy?: number;
  /** Bend the head back about the neck (degrees, negative = tilting back) — the drink. */
  head?: { deg: number };
  /** What is painted over the owner's drawing. */
  vial?: VialSpec;
  arm?: { from: Pt; to: Pt; w0: number; w1: number };
  glow?: { radius: number; strength: number };
  /** The vial/arm points are given relative to the eye (so they follow the head of the frame they are on). */
  relative?: boolean;
}

export interface Sources {
  frame(name: string): RgbaImage;
  anchors(name: string): Anchors;
}

export function sourcesFrom(root: string, manifest: { frames?: Record<string, { anchors?: Record<string, number[]> }> }): Sources {
  const paths = heroPaths(root);
  const cache = new Map<string, RgbaImage>();
  return {
    frame: (name) => {
      let img = cache.get(name);
      if (!img) {
        img = decodePng(readFileSync(join(paths.hero, `${name}.png`)));
        cache.set(name, img);
      }
      return img;
    },
    anchors: (name) => Object.fromEntries(Object.entries(manifest.frames?.[name]?.anchors ?? {}).map(([k, v]) => [k, [v[0]!, v[1]!] as [number, number]])),
  };
}

export function deriveFrame(src: Sources, op: FrameOp): DerivedFrame {
  const base = src.frame(op.from);
  const m = measure(base);
  const srcAnchors = src.anchors(op.anchorsOf ?? op.from);
  const points: Record<string, Pt> = Object.fromEntries(Object.entries(srcAnchors).map(([k, v]) => [k, toPx(v)]));

  let warp: RigidMls | null = null;
  let crouch: CrouchWarp | null = null;
  if (op.crouch) {
    const drop = op.crouch.eyeAt !== undefined ? op.crouch.eyeAt - m.eye.y : (op.crouch.drop ?? 0);
    crouch = new CrouchWarp({ neckY: m.eye.y + 30, floorY: PIVOT.y, drop, lean: op.crouch.lean ?? 0 });
    warp = crouch;
    for (const k of Object.keys(points)) points[k] = crouch.forward(points[k]!);
  }
  let headPivot: Pt | null = null;
  if (op.head) {
    // the head turns rigidly about the neck; the body and the floor are pinned
    const neck: Pt = { x: m.eye.x - 12, y: m.eye.y + 26 };
    headPivot = neck;
    const t = (op.head.deg * Math.PI) / 180;
    const rot = (p: Pt): Pt => ({ x: neck.x + (p.x - neck.x) * Math.cos(t) - (p.y - neck.y) * Math.sin(t), y: neck.y + (p.x - neck.x) * Math.sin(t) + (p.y - neck.y) * Math.cos(t) });
    const headPts: Pt[] = [m.eye, { x: m.eye.x - 4, y: m.top + 6 }, { x: m.eye.x - 26, y: m.eye.y - 10 }, { x: m.eye.x + 20, y: m.eye.y + 4 }, { x: m.eye.x - 14, y: m.eye.y - 24 }, { x: m.eye.x + 6, y: m.eye.y + 22 }];
    const pins: Pin[] = headPts.map((p) => ({ src: p, dst: rot(p) }));
    const fixed: Pt[] = [{ x: neck.x - 4, y: neck.y + 22 }, { x: neck.x - 40, y: neck.y + 8 }, { x: PIVOT.x - 14, y: PIVOT.y - 6 }, { x: PIVOT.x + 14, y: PIVOT.y - 6 }, { x: PIVOT.x, y: PIVOT.y - 40 }];
    for (const p of fixed) pins.push({ src: p, dst: p });
    warp = new RigidMls(pins);
  }

  let global: Affine | undefined;
  if (op.turn || op.dx || op.dy) {
    const hand = points['hand_r'] ?? points['weapon_grip'] ?? { x: PIVOT.x + 20, y: PIVOT.y - 40 };
    const pivot = op.turn ? (op.turn.about === 'hand' ? hand : op.turn.about === 'feet' ? PIVOT : op.turn.about) : PIVOT;
    global = about(pivot, { rot: op.turn?.deg ?? 0, dx: op.dx ?? 0, dy: op.dy ?? 0 });
    for (const k of Object.keys(points)) points[k] = apply(global, points[k]!);
  }

  const image = renderFrame(toDrawing(base), TARGET, { warp, ...(global ? { global } : {}) });

  // what is painted over the drawing (after the move, in canvas pixels; relative ones follow the eye as the move has put it)
  let eye = m.eye;
  if (crouch) eye = crouch.forward(eye);
  if (global) eye = apply(global, eye);
  if (headPivot && op.head) {
    const t = (op.head.deg * Math.PI) / 180;
    eye = { x: headPivot.x + (eye.x - headPivot.x) * Math.cos(t) - (eye.y - headPivot.y) * Math.sin(t), y: headPivot.y + (eye.x - headPivot.x) * Math.sin(t) + (eye.y - headPivot.y) * Math.cos(t) };
  }
  const at = (p: Pt): Pt => (op.relative ? { x: eye.x + p.x, y: eye.y + p.y } : p);
  if (op.arm) paintArm(image, at(op.arm.from), at(op.arm.to), op.arm.w0, op.arm.w1);
  if (op.vial) paintVial(image, { ...op.vial, at: at(op.vial.at) });
  if (op.glow) glowOver(image, eye, op.glow.radius, op.glow.strength);

  const anchors: Anchors = {};
  for (const [k, p] of Object.entries(points)) anchors[k] = toMeters(p);
  return { image, anchors };
}

export const encode = (img: RgbaImage): Buffer => encodePng(img);
export { compose };

// ------------------------------------------------------------------------------------------------------------------------------------------------ the whole set

interface ManifestShape {
  sprites: Array<{ clips: Record<string, unknown>; frames?: Record<string, { anchors: Record<string, number[]> }> }>;
}

export interface Derivation {
  frames: Array<{ name: string; clip: string; image: RgbaImage }>;
  /** What the manifest declares for each derived clip. */
  clips: Record<string, Record<string, unknown>>;
  /** The sword's anchors of every frame of a derived blow. */
  anchors: Record<string, { anchors: Anchors }>;
}

const nn = (k: number): string => String(k).padStart(2, '0');

/** Every frame of every derived clip, and what the manifest says of them: a pure function of the owner's frames and of the recipes (`heroDerivedClips.ts`). */
export function deriveAll(root: string, manifest: ManifestShape): Derivation {
  const sprite = manifest.sprites[0]!;
  // the sources read the OWNER's anchors, never the ones a previous run wrote
  const ownerFrames = Object.fromEntries(Object.entries(sprite.frames ?? {}).filter(([k]) => !Object.keys(DERIVED_CLIPS).some((c) => k.startsWith(`${c}_`) && !readDelivered(root).includes(c))));
  const src = sourcesFrom(root, { frames: ownerFrames });
  const out: Derivation = { frames: [], clips: {}, anchors: {} };
  // a clip the owner has drawn and handed over is the owner's: it is never made again
  const handedOver = new Set(readDelivered(root));
  for (const [clip, def] of Object.entries(DERIVED_CLIPS)) {
    if (handedOver.has(clip)) continue;
    def.frames.forEach((op, k) => {
      const made = deriveFrame(src, op);
      const name = `${clip}_${nn(k)}`;
      out.frames.push({ name, clip, image: made.image });
      if (def.sword) {
        const a = made.anchors;
        const grip = a['weapon_grip'] ?? a['hand_r'];
        const tip = a['weapon_tip'];
        if (!grip || !tip) throw new Error(`${name}: the sword's anchors did not come through`);
        out.anchors[name] = { anchors: { hand_r: grip, weapon_grip: grip, weapon_tip: tip, ...(a['hit_origin'] ? { hit_origin: a['hit_origin'] } : {}), ...(a['vfx_origin'] ? { vfx_origin: a['vfx_origin'] } : {}) } };
      }
    });
    out.clips[clip] = { frames: `${clip}_`, count: def.frames.length, fps: def.fps, loop: def.loop, ...(def.phases ? { phases: def.phases } : {}), tags: def.tags, comment: def.comment };
  }
  return out;
}
