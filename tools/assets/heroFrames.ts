import { createHash } from 'node:crypto';
import { extractPose, flipX, placePose, type Box } from './poses';
import type { RgbaImage } from './png';

/**
 * THE PROTAGONIST'S FRAMES FROM THE USER'S SHEET (docs/ART-PIPELINE-2D.md part L): the pure half of `npm run assets:poses`. A spec (`art/player/source/hero.poses.json`)
 * says which rectangle of the sheet is which pose, where its feet are and where the sword is held; this cuts the poses out (`poses.ts`: a transparent background and
 * nothing else), puts each on the one canvas of the set by an integer translation, and writes down the manifest that goes with them — the scale, the pivot, the clips, the
 * per-frame anchors in metres. Same sheet + same spec = the same frames, so a test can say the committed ones are not a hand's work.
 */

export interface PoseSpec {
  box: [number, number, number, number];
  /** The point of the pose (box coordinates) that stands on the pivot: its feet, or where they would be. */
  feet: [number, number];
  flip?: boolean;
  exclude?: [number, number, number, number][];
  what?: string;
}

export interface FrameSpec {
  name: string;
  pose: string;
  /** Visual scale of this frame about the feet (the poses were drawn at different sizes); 1 when absent. */
  scale?: number;
  /** Why this frame is not art of its own for the clip: it reuses a pose. Present = a stand-in. */
  standIn?: string;
}

export interface HeroSpec {
  sheet: string;
  sheetSha256: string;
  out: string;
  canvas: [number, number];
  pivotPx: [number, number];
  artPxPerMeter: number;
  poses: Record<string, PoseSpec>;
  frames: FrameSpec[];
  /** Anchors by POSE, in the pose's own pixels (after the flip), as measured on the picture. */
  anchors: Record<string, Partial<Record<'hand_r' | 'weapon_grip' | 'weapon_tip' | 'hit_origin' | 'vfx_origin' | 'projectile_origin', [number, number]>>>;
}

export interface HeroFrames {
  /** The PNG of each frame, RGBA on the common canvas. */
  frames: Map<string, RgbaImage>;
  /** The pack manifest that goes with them (`art/player/player.pack.json`). */
  manifest: Record<string, unknown>;
  /** What was found, pose by pose: for a person to read. */
  report: string[];
}

export const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

const CLIP_OF_FRAME = /^([A-Za-z0-9]+)_\d+$/;
const FIRST = new Set(['idle', 'walk', 'jump', 'dash', 'attack1', 'hurt']);
const SWORD = new Set(['attack1', 'attack2', 'aerialAttack', 'crouchAttack']);

const round = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits;

export function buildHeroFrames(spec: HeroSpec, sheet: RgbaImage): HeroFrames {
  const report: string[] = [];
  const poses = new Map<string, { image: RgbaImage; feet: { x: number; y: number }; bounds: Box }>();
  for (const [id, p] of Object.entries(spec.poses)) {
    const [x0, y0, x1, y1] = p.box;
    const exclude = (p.exclude ?? []).map(([a, b, c, d]): Box => ({ x0: a, y0: b, x1: c, y1: d }));
    const r = extractPose(sheet, { x0, y0, x1, y1 }, { exclude });
    if (!r.bounds) throw new Error(`pose "${id}": nothing of a figure was found in its box`);
    let image = r.image;
    let feet = { x: p.feet[0], y: p.feet[1] };
    let bounds = r.bounds;
    if (p.flip) {
      image = flipX(image);
      bounds = { x0: image.width - 1 - bounds.x1, x1: image.width - 1 - bounds.x0, y0: bounds.y0, y1: bounds.y1 };
    }
    poses.set(id, { image, feet, bounds });
    report.push(`pose ${id.padEnd(6)} box ${p.box.join(',')}  figure ${bounds.x1 - bounds.x0 + 1}×${bounds.y1 - bounds.y0 + 1}  feet ${feet.x},${feet.y}${p.flip ? '  mirrored' : ''}  (${r.stats.droppedPieces} loose piece(s) left out)`);
  }

  const [cw, ch] = spec.canvas;
  const to = { x: spec.pivotPx[0], y: spec.pivotPx[1] };
  const frames = new Map<string, RgbaImage>();
  const placed = new Map<string, RgbaImage>();
  for (const f of spec.frames) {
    const pose = poses.get(f.pose);
    if (!pose) throw new Error(`frame "${f.name}": there is no pose "${f.pose}"`);
    let canvasImage = placed.get(f.pose);
    if (!canvasImage) {
      const { image, clipped } = placePose(pose.image, pose.feet, { width: cw, height: ch }, to);
      if (clipped > 0) throw new Error(`pose "${f.pose}" does not fit the ${cw}×${ch} canvas: ${clipped} pixels fall outside`);
      canvasImage = image;
      placed.set(f.pose, image);
    }
    // the picture must keep clear of the left, right and top edges of the canvas (the contract asks for a margin)
    const ox = Math.round(to.x - pose.feet.x);
    const oy = Math.round(to.y - pose.feet.y);
    const left = pose.bounds.x0 + ox;
    const right = cw - 1 - (pose.bounds.x1 + ox);
    const top = pose.bounds.y0 + oy;
    if (left < 4 || right < 4 || top < 4) throw new Error(`frame "${f.name}": the figure comes within ${Math.min(left, right, top)} px of the canvas edge`);
    frames.set(f.name, canvasImage);
  }

  // ---- the manifest
  const ppm = spec.artPxPerMeter;
  const clips: Record<string, unknown> = {};
  const frameData: Record<string, unknown> = {};
  for (const f of spec.frames) {
    const m = CLIP_OF_FRAME.exec(f.name);
    if (!m) throw new Error(`frame name "${f.name}" is not <clip>_NN`);
    const clip = m[1]!;
    const tags: string[] = [];
    if (FIRST.has(clip)) tags.push('first');
    if (SWORD.has(clip)) tags.push('sword');
    if (f.standIn !== undefined) tags.push('stand-in');
    clips[clip] = { frames: `${clip}_`, count: 1, tags, ...(f.standIn !== undefined ? { comment: `reuses ${f.standIn}` } : {}) };
    const data: Record<string, unknown> = {};
    const scale = f.scale ?? 1;
    if (scale !== 1) data['scale'] = scale;
    const pose = poses.get(f.pose)!;
    const a = spec.anchors[f.pose];
    if (a) {
      const anchors: Record<string, [number, number]> = {};
      for (const [id, p] of Object.entries(a)) {
        if (!p) continue;
        anchors[id] = [round(((p[0] - pose.feet.x) / ppm) * scale, 3), round(((pose.feet.y - p[1]) / ppm) * scale, 3)];
      }
      data['anchors'] = anchors;
    }
    if (Object.keys(data).length > 0) frameData[f.name] = data;
  }
  const standIns = spec.frames.filter((f) => f.standIn !== undefined);
  const manifest: Record<string, unknown> = {
    manifestVersion: 1,
    id: 'player',
    category: 'player',
    status: 'provisional',
    comment:
      "THE PROTAGONIST, from the user's own pose sheet (art/player/source/hero-sheet.png) — made by `npm run assets:poses` from art/player/source/hero.poses.json: technical operations only (a transparent background, nothing drawn, recoloured or smoothed). " +
      `The sheet has one pose per action, so each clip here is ONE frame, and ${standIns.length} clips are STAND-INS (tag "stand-in"): they show the pose of another clip because the sheet has none of their own — ` +
      standIns.map((f) => `${f.name.replace(/_\d+$/, '')}: ${f.standIn}`).join('; ') +
      '. `npm run assets:missing` counts them as NOT delivered. Hand over real frames for a clip and the stand-in goes away.',
    tags: ['protagonist'],
    atlases: [],
    sprites: [
      {
        id: 'hero',
        atlases: [],
        artPxPerMeter: ppm,
        height: 1.7,
        facing: 'right',
        frameSize: [cw, ch],
        pivotPx: [spec.pivotPx[0], spec.pivotPx[1]],
        missingClips: 'placeholder',
        tags: ['protagonist', 'sword'],
        clips,
        frames: frameData,
      },
    ],
  };
  report.push(`${spec.frames.length} frames on a ${cw}×${ch} canvas, feet on ${to.x},${to.y}; ${standIns.length} of them stand-ins`);
  return { frames, manifest, report };
}
