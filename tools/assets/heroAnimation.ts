import { createHash } from 'node:crypto';
import { CLIP_ORDER, makeClips, type ClipSpec } from './heroClips';
import { FrameBuilder, type Canvas, type RigPose } from './heroRig';
import type { RgbaImage } from './png';
import { extractPose, flipX, type Box } from './poses';

/**
 * THE PROTAGONIST'S ANIMATION FROM THE USER'S SHEET (docs/ART-PIPELINE-2D.md part N): the pure half of `npm run assets:animate`. Three inputs and nothing else:
 *
 *   - the sheet (`hero-sheet.png`, the user's drawing, kept bit for bit) and `hero.poses.json`, which says which rectangle of it is which drawing;
 *   - `hero.rig.json`, which says where the parts of each drawing are (control points, groups, the rigid pieces) and the canvas the frames go on;
 *   - `heroClips.ts`, which says how those parts move in each frame of each clip.
 *
 * It cuts the drawings out (`poses.ts`: a transparent background and nothing else), moves them (`heroRig.ts` / `warp.ts`: the pixels are the user's, moved, never drawn) and writes down the
 * manifest that goes with the frames. Same sheet + same rig + same clips = the same frames, so a test can say the committed ones are not a hand's work.
 */

export interface SheetPose {
  box: [number, number, number, number];
  flip?: boolean;
  exclude?: [number, number, number, number][];
  what?: string;
}

export interface SheetSpec {
  sheet: string;
  sheetSha256: string;
  poses: Record<string, SheetPose>;
  unused?: Record<string, string>;
}

export interface RigFile {
  canvas: Canvas & { drawingPxPerMeter: number };
  poses: Record<string, RigPose>;
  /**
   * Clips whose frames were DRAWN BY HAND and handed over (the day a stand-in gets its own drawing): the generator leaves them alone — it makes none of their frames, deletes none of their files and
   * carries their entry of the manifest over as the artist wrote it. Their frames are `art/player/hero/<prefix>NN.png` and their entry is in `art/player/player.pack.json`, both the artist's.
   */
  delivered?: string[];
}

/** An entry of the manifest's `clips`, as far as the generator needs to read one it did not write. */
export interface ClipEntry {
  frames: string;
  count: number;
  [key: string]: unknown;
}

/** What a person (not the generator) put in the manifest: the clips handed over and the per-frame data (anchors) of their frames. */
export interface KeptManifest {
  clips: Record<string, ClipEntry>;
  frames: Record<string, unknown>;
}

/** The clips and per-frame data of the first sprite of a manifest (what `delivered` carries over); empty for anything that is not one. */
export function keptFrom(manifest: unknown): KeptManifest {
  const sprite = (manifest as { sprites?: Array<{ clips?: Record<string, ClipEntry>; frames?: Record<string, unknown> }> } | null)?.sprites?.[0];
  return { clips: sprite?.clips ?? {}, frames: sprite?.frames ?? {} };
}

/** The name of the frame `k` of a clip handed over by hand (the same two-digit rule as the generator's). */
export const frameFile = (prefix: string, k: number): string => `${prefix}${String(k).padStart(2, '0')}`;

export interface ClipReport {
  clip: string;
  frames: number;
  fps: number;
  /** The union of the figure's pixels over the frames (canvas pixels), for a person to see how far the clip reaches (none for a clip handed over: its frames are not read here). */
  reach: { x0: number; y0: number; x1: number; y1: number } | null;
  standIn: boolean;
  /** Drawn by hand and handed over: left as it is. */
  delivered?: boolean;
}

export interface HeroAnimation {
  /** The PNG of each frame, RGBA on the common canvas, by name (`idle_00`). */
  frames: Map<string, RgbaImage>;
  /** The pack manifest that goes with them (`art/player/player.pack.json`). */
  manifest: Record<string, unknown>;
  clips: ClipReport[];
  /** What was found, drawing by drawing and clip by clip: for a person to read. */
  report: string[];
}

export const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

const pad2 = (n: number): string => String(n).padStart(2, '0');
const round = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits;

/** How far from the edge of the canvas the figure must keep (the contract asks for a margin; the atlas trims it anyway). */
const EDGE_MARGIN = 4;

/** The drawings of the sheet, cut out, by name: each is the rectangle of its pose at the size of that rectangle, facing right. */
export function cutDrawings(spec: SheetSpec, sheet: RgbaImage): { drawings: Map<string, RgbaImage>; report: string[] } {
  const drawings = new Map<string, RgbaImage>();
  const report: string[] = [];
  for (const [id, p] of Object.entries(spec.poses)) {
    const [x0, y0, x1, y1] = p.box;
    const exclude = (p.exclude ?? []).map(([a, b, c, d]): Box => ({ x0: a, y0: b, x1: c, y1: d }));
    const r = extractPose(sheet, { x0, y0, x1, y1 }, { exclude });
    if (!r.bounds) throw new Error(`pose "${id}": nothing of a figure was found in its box`);
    const image = p.flip ? flipX(r.image) : r.image;
    drawings.set(id, image);
    report.push(`drawing ${id.padEnd(6)} box ${p.box.join(',')}  figure ${r.bounds.x1 - r.bounds.x0 + 1}×${r.bounds.y1 - r.bounds.y0 + 1}${p.flip ? '  mirrored' : ''}  (${r.stats.droppedPieces} loose piece(s) left out)`);
  }
  return { drawings, report };
}

export function buildHeroAnimation(spec: SheetSpec, rigFile: RigFile, sheet: RgbaImage, kept?: KeptManifest): HeroAnimation {
  const { canvas } = rigFile;
  const delivered = new Set(rigFile.delivered ?? []);
  for (const name of delivered) {
    if (!CLIP_ORDER.includes(name)) throw new Error(`the rig says the clip "${name}" was handed over, but there is no such clip (the clips are ${CLIP_ORDER.join(', ')})`);
    const entry = kept?.clips[name];
    if (!entry || typeof entry.frames !== 'string' || typeof entry.count !== 'number' || entry.count < 1) {
      throw new Error(`the clip "${name}" is handed over by hand, but the manifest has no entry of it with \`frames\` and \`count\` (write it in art/player/player.pack.json, with its frames in art/player/hero/)`);
    }
  }
  const { drawings, report } = cutDrawings(spec, sheet);

  // each rig is the rig of one drawing
  const images = new Map<string, RgbaImage>();
  for (const [name, rig] of Object.entries(rigFile.poses)) {
    const drawing = drawings.get(rig.pose);
    if (!drawing) throw new Error(`rig "${name}": there is no drawing "${rig.pose}" in the spec`);
    images.set(name, drawing);
  }
  if (Math.abs(canvas.drawingPxPerMeter * canvas.scale - canvas.artPxPerMeter) > 0.05) {
    throw new Error(`the canvas says ${canvas.drawingPxPerMeter} drawing px/m × ${canvas.scale} = ${round(canvas.drawingPxPerMeter * canvas.scale, 2)}, not ${canvas.artPxPerMeter} art px/m`);
  }
  const builder = new FrameBuilder({ images, rig: rigFile.poses }, canvas);
  const clips = makeClips(rigFile.poses);
  for (const name of Object.keys(clips)) if (!CLIP_ORDER.includes(name)) throw new Error(`the clip "${name}" is not in CLIP_ORDER`);

  const frames = new Map<string, RgbaImage>();
  const manifestClips: Record<string, unknown> = {};
  const frameData: Record<string, unknown> = {};
  const reports: ClipReport[] = [];
  for (const name of CLIP_ORDER) {
    const clip: ClipSpec | undefined = clips[name];
    if (!clip) throw new Error(`CLIP_ORDER names "${name}" but heroClips.ts makes no such clip`);
    if (delivered.has(name)) {
      // the artist's: nothing is made, nothing is judged; the manifest keeps what they wrote (checked above: it is there)
      const entry = kept!.clips[name]!;
      manifestClips[name] = entry;
      for (const [key, value] of Object.entries(kept!.frames)) if (key.startsWith(entry.frames)) frameData[key] = value;
      reports.push({ clip: name, frames: entry.count, fps: typeof entry.fps === 'number' ? entry.fps : 0, reach: null, standIn: false, delivered: true });
      report.push(`clip ${name.padEnd(13)} ${String(entry.count).padStart(2)} frames  HANDED OVER by the artist: left as they are`);
      continue;
    }
    let x0 = canvas.width;
    let y0 = canvas.height;
    let x1 = -1;
    let y1 = -1;
    clip.frames.forEach((spec, k) => {
      const frameName = `${name}_${pad2(k)}`;
      const built = builder.build(spec);
      const b = built.bounds;
      if (!b) throw new Error(`frame "${frameName}" is empty`);
      if (b.x0 < EDGE_MARGIN || b.y0 < EDGE_MARGIN || canvas.width - 1 - b.x1 < EDGE_MARGIN || canvas.height - 1 - b.y1 < EDGE_MARGIN) {
        throw new Error(`frame "${frameName}": the figure comes within ${Math.min(b.x0, b.y0, canvas.width - 1 - b.x1, canvas.height - 1 - b.y1)} px of the canvas edge (x ${b.x0}…${b.x1}, y ${b.y0}…${b.y1} of ${canvas.width}×${canvas.height})`);
      }
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1);
      y1 = Math.max(y1, b.y1);
      frames.set(frameName, built.image);
      if (Object.keys(built.anchors).length > 0) frameData[frameName] = { anchors: built.anchors };
    });
    const tags = [...(clip.tags ?? []), ...(clip.standIn !== undefined ? ['stand-in'] : [])];
    manifestClips[name] = {
      frames: `${name}_`,
      count: clip.frames.length,
      fps: clip.fps,
      loop: clip.loop,
      ...(clip.phases ? { phases: clip.phases } : {}),
      tags,
      comment: clip.standIn !== undefined ? clip.standIn : clip.note,
    };
    reports.push({ clip: name, frames: clip.frames.length, fps: clip.fps, reach: { x0, y0, x1, y1 }, standIn: clip.standIn !== undefined });
    report.push(`clip ${name.padEnd(13)} ${String(clip.frames.length).padStart(2)} frames at ${String(clip.fps).padStart(2)} fps${clip.loop ? ' loop' : ' once'}${clip.standIn !== undefined ? '  STAND-IN' : ''}  reach x ${x0}…${x1}, y ${y0}…${y1}`);
  }

  const standIns = reports.filter((r) => r.standIn);
  const handed = reports.filter((r) => r.delivered);
  const total = [...frames.values()].length;
  const manifest: Record<string, unknown> = {
    manifestVersion: 1,
    id: 'player',
    category: 'player',
    status: 'provisional',
    comment:
      "THE PROTAGONIST, from the user's own pose sheet (art/player/source/hero-sheet.png) — made by `npm run assets:animate` from art/player/source/hero.poses.json (which drawing is which), hero.rig.json (where the parts of each drawing are) and tools/assets/heroClips.ts (how they move): " +
      `${total} frames in ${reports.length - handed.length} clips, every pixel of every frame a pixel of the user's drawings, moved and never drawn, recoloured or smoothed (a rigid, smooth warp bends the body, the head, the antennae, the legs; the blade of the sword is a rigid piece that turns about its hilt). ` +
      (handed.length > 0 ? `${handed.length} more clip(s) were drawn by hand and handed over (${handed.map((r) => r.clip).join(', ')}): their frames and their entry here are the artist's, and \`npm run assets:animate\` leaves them alone. ` : '') +
      `${standIns.length} clips are STAND-INS (tag "stand-in"): the motion is real but the sheet has no drawing of their action, so the drawing of another one is what moves — ` +
      standIns.map((r) => `${r.clip}: ${clips[r.clip]!.standIn}`).join('; ') +
      '. `npm run assets:missing` counts them as NOT delivered. Hand over drawn frames for a clip and the stand-in goes away.',
    tags: ['protagonist'],
    atlases: [],
    sprites: [
      {
        id: 'hero',
        atlases: [],
        artPxPerMeter: canvas.artPxPerMeter,
        height: 1.7,
        facing: 'right',
        frameSize: [canvas.width, canvas.height],
        pivotPx: [canvas.pivot[0], canvas.pivot[1]],
        missingClips: 'placeholder',
        tags: ['protagonist', 'sword'],
        clips: manifestClips,
        frames: frameData,
      },
    ],
  };
  report.push(`${total} frames on a ${canvas.width}×${canvas.height} canvas, feet on ${canvas.pivot[0]},${canvas.pivot[1]}, ${canvas.artPxPerMeter} art px/m; ${standIns.length} of ${reports.length} clips are stand-ins${handed.length > 0 ? `, ${handed.length} handed over by hand` : ''}`);
  return { frames, manifest, clips: reports, report };
}
