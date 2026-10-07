import { PALETTE } from './palette';
import type { AnchorPoint, AtlasMeta, ClipDefinition, ClipPhases, FrameMeta, SpriteSetDefinition } from './SpriteSetDefinition';
import { frameName } from './SpriteSetDefinition';
import type { AnchorId, AnimState } from './vocabulary';

/**
 * PROCEDURAL PLACEHOLDER sprite sets (docs/GAME-SPEC-2D.md §2 "placeholder abstracto"). The protagonist's real art
 * is a separate deliverable, so until it arrives the engine runs on an abstract figure: a rounded body, a white
 * "facing" notch, a hand marker and a blade line, in neutral grey-lavender. It deliberately does NOT reproduce the
 * hero's design (no insect silhouette, no cyan/black identity), so it can never be mistaken for, or compete with,
 * the final character.
 *
 * Everything here is PURE data: a pose table in metres → the sprite-set definition, the per-frame anchors and the
 * atlas layout. Only `assets/placeholderAtlas.ts` touches a canvas. Poses are the single source for both the picture
 * and the anchors, so the sword socket can never drift from what is drawn.
 */

/**
 * The look of the placeholder: NEUTRAL on purpose. No cyan, no black armour, no insect silhouette: those belong to
 * the real protagonist, which this must never imitate or compete with (a test guards the hues).
 */
export const PLACEHOLDER_LOOK = {
  body: PALETTE.worldMist, // grey-lavender
  bodyLit: 0x8f8ca6,
  outline: 0x15141c,
  notch: PALETTE.whiteHot,
  hand: 0xd9d7e6,
  blade: 0xdfe3ee,
} as const;

/** One drawn frame. Metres relative to the FEET centre; +x forward (the art faces right), +y up. */
export interface PlaceholderPose {
  /** Rounded-rectangle body: size, bottom-centre position and lean (radians, + = top moves forward). */
  body: { w: number; h: number; x: number; y: number; lean: number };
  /** Right hand = sword grip. */
  hand: AnchorPoint;
  /** Blade direction (radians, 0 = forward, + = counter-clockwise i.e. up) and length. */
  blade: { angle: number; length: number };
}

export interface PlaceholderClip {
  fps?: number;
  loop?: boolean;
  phases?: ClipPhases;
  poses: readonly PlaceholderPose[];
}

export interface PlaceholderSpec {
  id: string;
  /** Art pixels per metre of the generated atlas. */
  artPxPerMeter: number;
  /** Frame cell in metres (every frame shares it, which keeps the pivot constant). */
  cell: { w: number; h: number };
  pivot: readonly [number, number];
  /** Standing height in metres. */
  height: number;
  /** Atlas columns. */
  columns: number;
  clips: Partial<Record<AnimState, PlaceholderClip>>;
}

export interface PlaceholderFrame {
  name: string;
  pose: PlaceholderPose;
  /** Pixel rectangle inside the atlas. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuiltPlaceholder {
  spec: PlaceholderSpec;
  def: SpriteSetDefinition;
  meta: AtlasMeta;
  frames: PlaceholderFrame[];
  atlas: { width: number; height: number };
}

/** Where every anchor is in a pose. The hand IS the grip; the tip follows the blade. */
export function poseAnchors(pose: PlaceholderPose): Record<AnchorId, AnchorPoint> {
  const { body, hand, blade } = pose;
  // a point `d` metres up the body's own axis (the body leans about its bottom centre)
  const along = (d: number): AnchorPoint => [body.x + d * Math.sin(body.lean), body.y + d * Math.cos(body.lean)];
  const dir: AnchorPoint = [Math.cos(blade.angle), Math.sin(blade.angle)];
  return {
    feet: [0, 0],
    head: along(body.h),
    hand_r: hand,
    weapon_grip: hand,
    weapon_tip: [hand[0] + blade.length * dir[0], hand[1] + blade.length * dir[1]],
    // the blow connects out along the blade, near its tip
    hit_origin: [hand[0] + 0.85 * blade.length * dir[0], hand[1] + 0.85 * blade.length * dir[1]],
    vfx_origin: along(body.h * 0.5),
    projectile_origin: [hand[0] + 0.18 * dir[0], hand[1] + 0.18 * dir[1]],
    interaction: along(body.h * 0.6),
  };
}

/** Extreme points of a pose (body corners, hand, blade tip): used to prove every frame fits its cell. */
export function poseExtent(pose: PlaceholderPose): { minX: number; maxX: number; minY: number; maxY: number } {
  const { body } = pose;
  const pts: AnchorPoint[] = [];
  const c = Math.cos(body.lean);
  const s = Math.sin(body.lean);
  for (const dx of [-body.w / 2, body.w / 2]) {
    for (const dy of [0, body.h]) {
      // rotate (dx, dy) by −lean about the base (top moves forward for lean > 0)
      pts.push([body.x + dx * c + dy * s, body.y - dx * s + dy * c]);
    }
  }
  const a = poseAnchors(pose);
  pts.push(a.hand_r, a.weapon_tip);
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

/** Builds the definition, the per-frame metadata and the atlas layout from a pose table. Deterministic and pure. */
export function buildPlaceholderSet(spec: PlaceholderSpec): BuiltPlaceholder {
  const ppm = spec.artPxPerMeter;
  const cellW = Math.round(spec.cell.w * ppm);
  const cellH = Math.round(spec.cell.h * ppm);
  const clips: SpriteSetDefinition['clips'] = {};
  const frames: PlaceholderFrame[] = [];
  const metaFrames: Record<string, FrameMeta> = {};

  for (const [state, clip] of Object.entries(spec.clips) as Array<[AnimState, PlaceholderClip]>) {
    const prefix = `${state}_`;
    const def: ClipDefinition = { frames: prefix, count: clip.poses.length };
    if (clip.fps !== undefined) def.fps = clip.fps;
    if (clip.loop !== undefined) def.loop = clip.loop;
    if (clip.phases) def.phases = clip.phases;
    clips[state] = def;
    clip.poses.forEach((pose, i) => {
      const n = frames.length;
      const name = frameName(prefix, i);
      frames.push({ name, pose, x: (n % spec.columns) * cellW, y: Math.floor(n / spec.columns) * cellH, w: cellW, h: cellH });
      const anchors = poseAnchors(pose);
      metaFrames[name] = { heightPx: anchors.head[1] * ppm, anchors };
    });
  }

  const rows = Math.ceil(frames.length / spec.columns);
  return {
    spec,
    def: {
      id: spec.id,
      atlas: `procedural:${spec.id}`,
      artPxPerMeter: ppm,
      pivot: spec.pivot,
      height: spec.height,
      clips,
      placeholder: true,
    },
    meta: { frames: metaFrames },
    frames,
    atlas: { width: spec.columns * cellW, height: rows * cellH },
  };
}
