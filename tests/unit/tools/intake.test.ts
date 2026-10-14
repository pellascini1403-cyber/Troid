import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { animate } from '../../../tools/assets/animate';
import { bodyOf, boundsOf, eyeDiameter, headDiameter, SOLID } from '../../../tools/assets/figure';
import { CLIP_ORDER } from '../../../tools/assets/heroClips';
import { clipEye, readClips, readDelivered } from '../../../tools/assets/heroRepo';
import {
  applyWaivers,
  chooseScale,
  cutLoose,
  cutSheet,
  IntakeError,
  judgeFrames,
  LIMITS,
  manifestAnchors,
  MIN_WAIVER_REASON,
  parseAnchors,
  parseWaivers,
  placeFrame,
  scaleProxy,
  spreadOf,
  type Canvas,
  type Cut,
  type Scaling,
  type SwordPoints,
} from '../../../tools/assets/intake';
import { acceptClip, addDelivered, prepareClip, readInbox, statusOf, writeReport } from '../../../tools/assets/intakeRun';
import { buildKit, buildReadme, readKitSources, type ClipRequest, type Requests } from '../../../tools/assets/kit';
import { decodePng, encodePng, type RgbaImage } from '../../../tools/assets/png';
import { renderFrame, toDrawing } from '../../../tools/assets/warp';

/**
 * THE RECEPTION OF THE PROTAGONIST'S NEW DRAWINGS (tools/assets/intake*.ts, docs/PROMPT10-LOG.md). No drawing has been made yet — no image generator was available — so the tool is tested on what it will
 * be given: a SHEET built from the frames the game already has (enlarged, laid on white with a soft ground shadow, like a generator's sheet), cut, scaled by the eye, placed and judged; the same
 * frames made worse in the ways a bad delivery is worse (a white fringe, red energy left in, a stray speck, a pose drawn at another scale…); and a whole delivery handed over through `delivered` in a
 * COPY of the repository, where the generator and the checks of the pipeline must find nothing to correct.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const canvas: Canvas = { width: 280, height: 230, pivot: [120, 192], artPxPerMeter: 65, margin: 4 };
const frame = (name: string): RgbaImage => decodePng(readFileSync(join(root, 'art', 'player', 'hero', `${name}.png`)));
const SWORD_FRAMES = ['attack1_00', 'attack1_01', 'attack1_02', 'attack1_03', 'attack1_04', 'attack1_05', 'attack1_06'] as const;

/**
 * THE REQUEST THE TESTS JUDGE BY: a blow of seven frames in the three phases of the simulation, with the sword — the definition `attack2` had when it was asked for. The tests of the tool judge and deliver the seven
 * frames of the first blow (which the generator draws clean), so they ask for what those frames are and not for whatever the data of a clip of the game says today: the clips are handed over, redefined to the
 * drawings that came (their count, their phases, their limits) and handed over again, and the tool must keep being tested on a fixed ask.
 */
const BLOW: ClipRequest = {
  group: 'B',
  priority: 1,
  status: 'requested',
  title: 'Second blow (the tests\' fixture)',
  titleEs: 'Segundo golpe (el de las pruebas)',
  why: 'a blow of seven frames with a sword',
  gameplay: { seconds: null, ticks: 17, note: '3 ticks of wind-up, 3 active, 11 of recovery' },
  manifest: { fps: 28, loop: false, tags: ['sword'], phases: { startup: [0, 1], active: [2, 3], recovery: [4, 6] } },
  placement: { anchorX: 'mass', anchorY: 'ground' },
  scaleLike: 'attack1',
  scaleWhy: 'the second blow chains from the first',
  sword: true,
  intent: { tipRises: 0.4, es: 'the tip rises at least 0.4 m between the wind-up and the active phase' },
  limits: { heightM: [1.4, 2.7], widthM: [1.5, 3.4] },
  references: { sheet: ['pose7', 'pose8', 'pose12'], frames: ['attack1_00', 'attack1_02', 'attack1_06', 'cast_03', 'idle_00'], note: 'the sword of the drawing 7/12' },
  frames: ['coil', 'load', 'cut', 'cut-end', 'follow-through', 'recover', 'settle'].map((role, k) => ({ role, phase: k < 2 ? ('startup' as const) : k < 4 ? ('active' as const) : ('recovery' as const), en: role, es: role })),
};

/**
 * A pose made of exactly what the measurements look at: a dark dome `head` pixels across, a round glowing eye `eye` pixels across with white highlights (none when `eye` is `null`: the head has
 * turned away) and a body much slimmer than the head. Nothing of the game's art, so no delivery can take it from under a test.
 */
function pose(head: number, eye: number | null): RgbaImage {
  const w = Math.ceil(head * 1.4);
  const h = Math.ceil(head * 1.7);
  const data = new Uint8Array(w * h * 4);
  const paint = (x: number, y: number, rgba: readonly [number, number, number, number]): void => {
    if (x >= 0 && y >= 0 && x < w && y < h) data.set(rgba, (y * w + x) * 4);
  };
  const disc = (cx: number, cy: number, r: number, rgba: readonly [number, number, number, number]): void => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) paint(x, y, rgba);
  };
  const cx = w / 2;
  const cy = head / 2 + 2;
  disc(cx, cy, head / 2, [16, 16, 32, 255]);
  for (let y = Math.round(cy + head * 0.4); y < h - 1; y++) for (let x = Math.round(cx - head * 0.18); x <= Math.round(cx + head * 0.18); x++) paint(x, y, [16, 16, 32, 255]);
  if (eye !== null) {
    const ex = cx + head * 0.1;
    disc(ex, cy, eye / 2, [150, 225, 245, 255]);
    for (const [dx, dy, k] of [[-0.18, -0.2, 0.14], [0.12, 0.12, 0.08], [0.2, -0.1, 0.07]] as const) disc(ex + dx * eye, cy + dy * eye, Math.max(1.5, k * eye), [255, 255, 255, 255]);
  }
  return { width: w, height: h, data };
}

/** The poses as `cutSheet` would hand them over: as they are, in the order given. */
const cutOf = (poses: readonly RgbaImage[]): Cut => ({
  poses: [...poses],
  boxes: poses.map((p) => ({ x0: 0, y0: 0, x1: p.width - 1, y1: p.height - 1 })),
  final: poses.map(() => false),
  rawRed: poses.map(() => 0),
  notes: [],
});

interface SheetOptions {
  /** Enlargement of each pose (one number, or one per pose). */
  up: number | readonly number[];
  cols: number;
  gap: number;
  /** A soft grey ellipse under each pose's feet, as generators draw despite being told not to. */
  shadow?: boolean;
  /** A transparent background instead of white. */
  transparent?: boolean;
  /** Each pose starts at this share of the previous pose's width: they overlap. */
  overlap?: number;
}

/** A sheet like a generator's: the frames enlarged, in rows, on white (or transparent), with their ground shadows. `frames` are the sources, to compare with what comes out. */
function composeSheet(names: readonly string[], o: SheetOptions): { sheet: RgbaImage; frames: RgbaImage[] } {
  const frames = names.map(frame);
  const upOf = (i: number): number => (typeof o.up === 'number' ? o.up : o.up[i]!);
  const pieces = frames.map((f, i) => {
    const b = boundsOf(f, 8)!;
    const w = Math.ceil((b.x1 - b.x0 + 1) * upOf(i)) + 2;
    const h = Math.ceil((b.y1 - b.y0 + 1) * upOf(i)) + 2;
    return renderFrame(toDrawing(f), { width: w, height: h, scale: upOf(i), origin: { x: b.x0, y: b.y0 } }, { warp: null, samples: 2 });
  });
  const rows = Math.ceil(names.length / o.cols);
  const cellW = Math.max(...pieces.map((p) => p.width)) + o.gap;
  const cellH = Math.max(...pieces.map((p) => p.height)) + o.gap;
  const W = cellW * o.cols + o.gap;
  const H = cellH * rows + o.gap;
  const data = new Uint8Array(W * H * 4);
  if (!o.transparent) data.fill(255);
  let prevRight = 0;
  pieces.forEach((p, i) => {
    let cx = o.gap + (i % o.cols) * cellW + Math.round((cellW - o.gap - p.width) / 2);
    if (o.overlap !== undefined && i % o.cols > 0) cx = prevRight - Math.round(pieces[i - 1]!.width * (1 - o.overlap));
    const cy = o.gap + Math.floor(i / o.cols) * cellH + (cellH - o.gap - p.height);
    prevRight = cx + p.width;
    if (o.shadow) {
      const sx = cx + p.width / 2;
      const sy = cy + p.height - 2;
      const rx = Math.round(p.width * 0.45);
      for (let y = -14; y <= 14; y++) {
        for (let x = -rx; x <= rx; x++) {
          const k = Math.sqrt((x / rx) ** 2 + (y / 14) ** 2);
          if (k > 1) continue;
          const a = 0.22 * (1 - k);
          const px = Math.round(sx + x);
          const py = Math.round(sy + y);
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          const d = (py * W + px) * 4;
          for (let c = 0; c < 3; c++) data[d + c] = Math.round(data[d + c]! * (1 - a) + 90 * a);
        }
      }
    }
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const s = (y * p.width + x) * 4;
        const a = p.data[s + 3]! / 255;
        if (a === 0) continue;
        const d = ((cy + y) * W + (cx + x)) * 4;
        if (o.transparent) {
          data.set(p.data.subarray(s, s + 4), d);
          continue;
        }
        for (let c = 0; c < 3; c++) data[d + c] = Math.round(p.data[s + c]! * a + data[d + c]! * (1 - a));
      }
    }
  });
  return { sheet: { width: W, height: H, data }, frames };
}

const lowestSolid = (img: RgbaImage): number => boundsOf(img, SOLID)!.y1;
const copy = (img: RgbaImage): RgbaImage => ({ ...img, data: new Uint8Array(img.data) });

/** The share of pixels of `a` and `b` that are solid in both, over those solid in either, with `b` shifted by (dx, dy). */
function iou(a: RgbaImage, b: RgbaImage, dx: number, dy: number): number {
  let inter = 0;
  let uni = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const sx = x - dx;
      const sy = y - dy;
      const inB = sx >= 0 && sy >= 0 && sx < b.width && sy < b.height ? b.data[(sy * b.width + sx) * 4 + 3]! >= SOLID : false;
      const inA = a.data[(y * a.width + x) * 4 + 3]! >= SOLID;
      if (inA && inB) inter++;
      if (inA || inB) uni++;
    }
  }
  return uni === 0 ? 0 : inter / uni;
}

/** The anchors a person would read off the grid: the originals' anchors, carried by the offset between the placed frame and its source, and snapped onto the figure. */
function anchorsFor(names: readonly string[], placed: readonly RgbaImage[], sources: readonly RgbaImage[], sourceNames: readonly string[]): Map<string, SwordPoints> {
  const manifest = (JSON.parse(readFileSync(join(root, 'art', 'player', 'player.pack.json'), 'utf8')) as { sprites: Array<{ frames: Record<string, { anchors: Record<string, [number, number]> }> }> }).sprites[0]!.frames;
  const out = new Map<string, SwordPoints>();
  placed.forEach((mine, k) => {
    const bm = bodyOf(mine, 3)!;
    const bo = bodyOf(sources[k]!, 3)!;
    const a = manifest[sourceNames[k]!]!.anchors;
    const toPx = (m: [number, number]): [number, number] => [Math.round(120 + m[0] * 65 + bm.cx - bo.cx), Math.round(192 - m[1] * 65 + bm.cy - bo.cy)];
    const snap = ([x, y]: [number, number]): [number, number] => {
      let best: [number, number] = [x, y];
      let bd = 1e9;
      for (let yy = y - 8; yy <= y + 8; yy++) {
        for (let xx = x - 8; xx <= x + 8; xx++) {
          if (xx < 0 || yy < 0 || xx >= mine.width || yy >= mine.height || mine.data[(yy * mine.width + xx) * 4 + 3]! < SOLID) continue;
          const d = Math.hypot(xx - x, yy - y);
          if (d < bd) {
            bd = d;
            best = [xx, yy];
          }
        }
      }
      return best;
    };
    out.set(names[k]!, { grip: snap(toPx(a['weapon_grip']!)), tip: snap(toPx(a['weapon_tip']!)) });
  });
  return out;
}

let built: { sheet: RgbaImage; frames: RgbaImage[] };
let cut: Cut;
let scaling: Scaling;
let placed: ReturnType<typeof placeFrame>[];
let target: number;
beforeAll(() => {
  built = composeSheet(SWORD_FRAMES, { up: 3, cols: 4, gap: 90, shadow: true });
  cut = cutSheet(built.sheet, SWORD_FRAMES.length);
  target = clipEye(root, 'attack1')!;
  scaling = chooseScale(cut, target);
  placed = cut.poses.map((p) => placeFrame(p, scaling.factor, { anchorX: 'mass', anchorY: 'ground' }, canvas));
}, 120_000);

describe('cutting a sheet', () => {
  it('finds exactly the poses that were asked for, in reading order — rows from the top, each left to right — whatever the shadows under them', () => {
    expect(cut.poses).toHaveLength(7);
    const b = cut.boxes;
    for (let i = 1; i < 4; i++) expect(b[i]!.x0, `pose ${i + 1} is to the right of pose ${i}`).toBeGreaterThan(b[i - 1]!.x1);
    for (let i = 5; i < 7; i++) expect(b[i]!.x0, `pose ${i + 1} is to the right of pose ${i}`).toBeGreaterThan(b[i - 1]!.x1);
    expect(b[4]!.y0, 'the second row is under the first').toBeGreaterThan(Math.max(b[0]!.y1, b[1]!.y1, b[2]!.y1, b[3]!.y1));
    // and the right pose is in the right place: each one is as big as the frame it was made from, times the enlargement
    cut.poses.forEach((p, i) => {
      const f = boundsOf(built.frames[i]!, SOLID)!;
      expect(p.width / ((f.x1 - f.x0 + 1) * 3), `pose ${i + 1} width`).toBeGreaterThan(0.93);
      expect(p.width / ((f.x1 - f.x0 + 1) * 3), `pose ${i + 1} width`).toBeLessThan(1.07);
      expect(p.height / ((f.y1 - f.y0 + 1) * 3), `pose ${i + 1} height`).toBeGreaterThan(0.93);
      expect(p.height / ((f.y1 - f.y0 + 1) * 3), `pose ${i + 1} height`).toBeLessThan(1.07);
    });
  });

  it('leaves the ground shadows out: the cut ends where the figure\'s feet end, and nothing pale and grey is left in the last rows', () => {
    for (const [i, p] of cut.poses.entries()) {
      const f = boundsOf(built.frames[i]!, 8)!;
      // the figure alone is (rows of the frame) x 3 tall: a shadow under the feet would add its own height to that
      expect(Math.abs(p.height / ((f.y1 - f.y0 + 1) * 3) - 1), `pose ${i + 1}: the height of the cut against the figure's`).toBeLessThan(0.025);
      let pale = 0;
      for (let y = Math.floor(p.height * 0.96); y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          const o = (y * p.width + x) * 4;
          if (p.data[o + 3]! >= SOLID && Math.min(p.data[o]!, p.data[o + 1]!, p.data[o + 2]!) >= 150 && Math.max(p.data[o]!, p.data[o + 1]!, p.data[o + 2]!) - Math.min(p.data[o]!, p.data[o + 1]!, p.data[o + 2]!) <= 30) pale++;
        }
      }
      expect(pale, `pose ${i + 1}: pale grey pixels in the last rows`).toBe(0);
    }
  });

  it('uses a transparent sheet as it is: the alpha says where the figure is, and each pose keeps only its own piece', () => {
    const t = composeSheet(SWORD_FRAMES.slice(0, 4), { up: 3, cols: 2, gap: 80, transparent: true });
    const c = cutSheet(t.sheet, 4);
    expect(c.poses).toHaveLength(4);
    expect(c.rawRed).toEqual([0, 0, 0, 0]);
    for (const p of c.poses) expect(boundsOf(p, 8)).toEqual({ x0: 0, y0: 0, x1: p.width - 1, y1: p.height - 1 });
  });

  it('refuses a sheet that does not hold the poses asked for, and says what it found — and where, for the debug picture', () => {
    expect(() => cutSheet(built.sheet, 8)).toThrow(IntakeError);
    try {
      cutSheet(built.sheet, 8);
    } catch (e) {
      expect((e as Error).message).toMatch(/should hold 8 poses/);
      expect((e as Error).message).toMatch(/radius \d+: 7/);
      expect((e as IntakeError).boxes).toHaveLength(7);
    }
    expect(() => cutSheet(built.sheet, 6)).toThrow(/should hold 6 poses/);
  });

  it('refuses poses that touch or overlap: it does not guess where one ends and the next begins', () => {
    const touching = composeSheet(SWORD_FRAMES.slice(0, 4), { up: 3, cols: 4, gap: 10, overlap: 0.55 });
    expect(() => cutSheet(touching.sheet, 4)).toThrow(/could not be told apart/);
  });

  it('refuses a dark background (asks for white or transparent) and a picture with no figure', () => {
    const dark: RgbaImage = { width: 200, height: 200, data: new Uint8Array(200 * 200 * 4).fill(30) };
    for (let i = 3; i < dark.data.length; i += 4) dark.data[i] = 255;
    expect(() => cutSheet(dark, 1)).toThrow(/background is not white/);
    const blank: RgbaImage = { width: 200, height: 200, data: new Uint8Array(200 * 200 * 4).fill(255) };
    expect(() => cutSheet(blank, 1)).toThrow(/could not be told apart/);
  });

  it('separate PNGs: a transparent one is trimmed, one already on the game\'s canvas is used as it is, an opaque one is cut from its background', () => {
    const f = frame('idle_00');
    const loose = cutLoose([f, composeSheet(['idle_00'], { up: 2, cols: 1, gap: 30, shadow: true }).sheet], canvas);
    expect(loose.final).toEqual([true, false]);
    expect(loose.poses[0]).toBe(f);
    expect(loose.poses[1]!.width).toBeLessThan(f.width * 2);
    expect(eyeDiameter(loose.poses[1]!)).not.toBeNull();
    expect(loose.notes.join(' ')).toMatch(/ya son fotogramas/);
  });
});

describe('scaling by the eye and placing on the canvas', () => {
  it('one factor for the whole sheet, taken from the big eye against the neighbouring clip\'s: a sheet enlarged 3x comes back at a third', () => {
    expect(scaling.how).toBe('eye');
    expect(scaling.factor).toBeGreaterThan(1 / 3 - 0.012);
    expect(scaling.factor).toBeLessThan(1 / 3 + 0.012);
    expect(scaling.target).toBeCloseTo(target, 6);
    expect(scaling.eyes.every((e) => e !== null)).toBe(true);
    // the poses keep the sizes relative to each other that their drawer gave them: one factor, not one per pose
    for (const f of placed) expect(eyeDiameter(f.image)!.diameter / target).toBeGreaterThan(0.88);
  });

  it('a factor given by hand wins; no measurable eye and no factor is an error that says how to go on; a bad factor is refused', () => {
    expect(chooseScale(cut, target, 0.25)).toMatchObject({ factor: 0.25, how: 'given' });
    expect(() => chooseScale(cut, target, 0)).toThrow(/between 0 and 10/);
    expect(() => chooseScale(cut, null)).toThrow(/--scale/);
    // poses with no eye at all (the head turned away, the light out): the eye cannot scale them, and no factor is an error that says what to pass
    const eyeless = cutOf([pose(80, null), pose(80, null), pose(80, null), pose(80, null)]);
    expect(() => chooseScale(eyeless, target)).toThrow(/only 0 of 4 poses/);
    expect(chooseScale(eyeless, target, 0.33).how).toBe('given');
  });

  it('places the figure: the centre of mass of its body on the pivot column, its lowest pixel on the pivot row — and it is the same figure (the shapes agree after the round trip)', () => {
    placed.forEach((p, i) => {
      const b = bodyOf(p.image, 3)!;
      expect(Math.abs(b.cx - 120), `pose ${i + 1}: mass x`).toBeLessThan(1);
      // (the last pixels of a thin blade's tip fade below half alpha when the sheet is brought down: a couple of rows)
      expect(lowestSolid(p.image), `pose ${i + 1}: the lowest pixel`).toBeGreaterThanOrEqual(canvas.pivot[1] - 3);
      expect(lowestSolid(p.image), `pose ${i + 1}: the lowest pixel`).toBeLessThanOrEqual(canvas.pivot[1]);
      expect(p.clipped).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
      // against the frame it was made from, brought to the same place: the cut, the enlargement and the return lose very little
      const src = built.frames[i]!;
      const bs = bodyOf(src, 3)!;
      expect(iou(p.image, src, Math.round(b.cx - bs.cx), Math.round(b.cy - bs.cy)), `pose ${i + 1}: the shape of the figure`).toBeGreaterThan(0.88);
    });
  });

  it('puts an airborne body at 1.0 m above the pivot, and a nudge moves the frame by what it says', () => {
    const air = placeFrame(cut.poses[2]!, scaling.factor, { anchorX: 'mass', anchorY: 'mass' }, canvas);
    expect(Math.abs(bodyOf(air.image, 3)!.cy - (192 - 65)), 'the centre of mass is 65 px above the pivot row').toBeLessThan(1);
    const base = placed[2]!;
    const moved = placeFrame(cut.poses[2]!, scaling.factor, { anchorX: 'mass', anchorY: 'ground' }, canvas, { dx: 6, dy: -4 });
    const a = boundsOf(base.image, SOLID)!;
    const b = boundsOf(moved.image, SOLID)!;
    expect(b.x0 - a.x0).toBeGreaterThanOrEqual(5);
    expect(b.x0 - a.x0).toBeLessThanOrEqual(7);
    expect(a.y1 - b.y1).toBeGreaterThanOrEqual(3);
    expect(a.y1 - b.y1).toBeLessThanOrEqual(5);
  });

  it('says so when the figure does not fit the canvas — it is reported, never cropped quietly', () => {
    const huge = placeFrame(cut.poses[0]!, scaling.factor * 1.7, { anchorX: 'mass', anchorY: 'ground' }, canvas);
    expect(huge.clipped.left + huge.clipped.right + huge.clipped.top + huge.clipped.bottom).toBeGreaterThan(0);
  });

  it('flags a blade that dips under the feet (the lowest point is not a foot) so the frame can be lowered by hand — and not a frame whose lowest point IS the feet', () => {
    expect(placed[0]!.groundGap).toBeLessThan(8);
    expect(placed[6]!.groundGap).toBeLessThan(8);
    // the lunge with the blade low: the sword goes under the boots
    expect(Math.max(...placed.map((p) => p.groundGap))).toBeGreaterThan(8);
  });
});

describe('scaling by the head when the head turns (an eye seen small, or not at all, is not a pose drawn small)', () => {
  const TOL = 0.14;
  const HEAD_TARGET = 40;
  // a neighbour whose head is 2.5 times its eye, as the game's frames are (and the poses below: a head of 80 with an eye of 32 when it faces us)
  const EYE_TARGET = 16;
  const opts = { headTarget: HEAD_TARGET, tolerance: TOL };
  /** Four poses of one size whose head turns: the eye is seen big, then smaller, then tiny, then not at all. */
  const turning = (): RgbaImage[] => [pose(80, 32), pose(80, 24), pose(80, 16), pose(80, null)];

  it('measures the heads that were drawn, whatever the eye does, and says how far a set of measurements strays from its median', () => {
    for (const p of turning()) expect(Math.abs(headDiameter(p)! - 80), 'the head').toBeLessThan(1.2);
    expect(eyeDiameter(pose(80, 32))!.diameter).toBeGreaterThan(30);
    expect(eyeDiameter(pose(80, 16))!.diameter).toBeLessThan(18);
    expect(eyeDiameter(pose(80, null))).toBeNull();
    expect(spreadOf([10, 10, 10])).toBe(0);
    expect(spreadOf([8, 10, 13])).toBeCloseTo(0.3, 6);
    expect(spreadOf([7])).toBe(0);
    expect(spreadOf([])).toBe(0);
  });

  it('chooses what a sheet is measured by: the eye when the eyes agree (whatever the heads do), the head when the eyes disagree and the heads do not, the eye again when both disagree', () => {
    expect(scaleProxy([24, 24, 24, 24], [76, 80, 84, 80], TOL)).toBe('eye');
    expect(scaleProxy([24, 24, 24, 24], [40, 80, 120, 80], TOL)).toBe('eye');
    expect(scaleProxy([32, 24, 16, null], [80, 80, 80, 80], TOL)).toBe('head');
    expect(scaleProxy([32, 24, 16, null], [80, 80, 80, 90], TOL)).toBe('head');
    // a real difference of scale shows in both measures: it is not let through as "a turned head"
    expect(scaleProxy([18, 24, 24, 36], [60, 80, 80, 120], TOL)).toBe('eye');
    // the heads agree only if each is within the tolerance of their median
    expect(scaleProxy([32, 24, 16, null], [80, 80, 80, 100], TOL)).toBe('eye');
    // eyes in too few poses to say anything: the heads, if they agree
    expect(scaleProxy([null, null, null, 24], [80, 80, 80, 80], TOL)).toBe('head');
    expect(scaleProxy([null, null, null, 24], [60, 80, 100, 80], TOL)).toBe('eye');
  });

  it('eyes that agree: the factor is what it always was — the eye against the neighbour\'s — and the heads are not asked', () => {
    const s = chooseScale(cutOf([pose(76, 24), pose(80, 24), pose(84, 24), pose(80, 24)]), EYE_TARGET, undefined, opts);
    expect(s.how).toBe('eye');
    expect(s.proxy).toBe('eye');
    expect(s.factor).toBeCloseTo(EYE_TARGET / s.median!, 9);
  });

  it('the head turns: the eyes disagree (a third and more) and the heads do not, so the sheet comes back to the NEIGHBOUR\'S HEAD — one factor, and the poses keep their sizes', () => {
    const s = chooseScale(cutOf(turning()), EYE_TARGET, undefined, opts);
    expect(s.how).toBe('head');
    expect(s.proxy).toBe('head');
    expect(s.factor).toBeCloseTo(HEAD_TARGET / s.headMedian!, 9);
    expect(s.factor).toBeGreaterThan(0.49);
    expect(s.factor).toBeLessThan(0.51);
    // by the eye, the same sheet would have come back a third too big: the median eye (24) is the turned head's, not the face's (32)
    expect(EYE_TARGET / s.median!).toBeGreaterThan(s.factor * 1.25);
    expect(s.heads.every((h) => h !== null)).toBe(true);
  });

  it('a real difference of scale is NOT let through as a turned head: both measures disagree, so it is the eye that judges, and fails', () => {
    const wrong = cutOf([pose(60, 18), pose(80, 24), pose(80, 24), pose(120, 36)]);
    const s = chooseScale(wrong, EYE_TARGET, undefined, opts);
    expect(s.how).toBe('eye');
    expect(s.proxy).toBe('eye');
    const frames = wrong.poses.map((p) => placeFrame(p, s.factor, { anchorX: 'mass', anchorY: 'ground' }, canvas).image);
    const j = judgeAny(frames, s);
    expect(j.frames[3]!.checks.some((c) => c.id === 'eye' && c.level === 'fail')).toBe(true);
    expect(j.level).toBe('fail');
  });

  it('too few eyes in view to scale by: the heads do, if they agree (no error); if they do not, the error says what to pass, as before', () => {
    const turnedAway = cutOf([pose(80, null), pose(80, null), pose(80, null), pose(80, 24)]);
    expect(chooseScale(turnedAway, EYE_TARGET, undefined, opts)).toMatchObject({ how: 'head', proxy: 'head' });
    expect(() => chooseScale(turnedAway, EYE_TARGET)).toThrow(/only 1 of 4 poses/);
    const uneven = cutOf([pose(60, null), pose(80, null), pose(100, null), pose(80, 24)]);
    expect(() => chooseScale(uneven, EYE_TARGET, undefined, opts)).toThrow(/only 1 of 4 poses/);
  });

  it('without the neighbour\'s head the choice is what it was; a factor given by hand still wins — and what is judged still follows the head', () => {
    expect(chooseScale(cutOf(turning()), EYE_TARGET)).toMatchObject({ how: 'eye', proxy: 'eye', headTarget: null });
    expect(chooseScale(cutOf(turning()), EYE_TARGET, 0.5, opts)).toMatchObject({ factor: 0.5, how: 'given', proxy: 'head' });
    // the eye of the neighbour could be missing: the head can still scale the sheet
    expect(chooseScale(cutOf(turning()), null, undefined, opts)).toMatchObject({ how: 'head' });
  });

  /** `judgeFrames` as the delivery does it, for a clip with no sword and generous limits (only the scale of the poses is in question). */
  function judgeAny(frames: readonly RgbaImage[], scaling: Scaling) {
    const request = BLOW;
    return judgeFrames({
      names: frames.map((_, k) => `attack2_0${k}`),
      frames,
      clipped: frames.map(() => ({ left: 0, right: 0, top: 0, bottom: 0 })),
      groundGap: frames.map(() => 0),
      request: { ...request, sword: false, limits: { heightM: [0.1, 5], widthM: [0.1, 5] } },
      canvas,
      scaling,
      tolerance: TOL,
      rawRed: frames.map(() => 0),
      anchors: new Map(),
      anchorProblems: [],
    });
  }
  const finish = (poses: readonly RgbaImage[], factor: number): RgbaImage[] => poses.map((p) => placeFrame(p, factor, { anchorX: 'mass', anchorY: 'ground' }, canvas).image);

  it('judges a clip scaled by the head by its heads: the eye that went small is no remark, a head a fifth off is warned, a third off failed', () => {
    const sheet = chooseScale(cutOf(turning()), EYE_TARGET, undefined, opts);
    const good = judgeAny(finish(turning(), sheet.factor), sheet);
    expect(good.level, good.frames.flatMap((f) => f.checks.filter((c) => c.level !== 'ok').map((c) => `${f.name} ${c.id}: ${c.text}`)).join('\n')).toBe('ok');
    expect(good.frames.map((f) => f.eye === null ? null : Math.round(f.eye))).not.toEqual([null, null, null, null]);
    expect(good.frames.every((f) => f.head !== null && Math.abs(f.headDeviation!) < 0.03)).toBe(true);
    expect(good.frames[0]!.eyeDeviation!, 'the eye of the first pose is far from the median: reported, not judged').toBeGreaterThan(0.2);
    expect(good.frames.flatMap((f) => f.checks).some((c) => c.id === 'eye')).toBe(false);
    // the same frames judged by the eye (what the tool did before) fail the first pose: that is the false alarm this removes
    const byEye = judgeAny(finish(turning(), sheet.factor), { ...sheet, proxy: 'eye' });
    expect(byEye.frames[0]!.checks.some((c) => c.id === 'eye' && c.level === 'fail')).toBe(true);
    // a head a fifth bigger than the others is warned, a third bigger is a failure
    const fifth = judgeAny(finish([pose(80, 24), pose(80, 24), pose(80, 24), pose(96, 28)], sheet.factor), sheet);
    expect(fifth.frames[3]!.checks.find((c) => c.id === 'head')?.level).toBe('warn');
    const third = judgeAny(finish([pose(80, 24), pose(80, 24), pose(80, 24), pose(110, 33)], sheet.factor), sheet);
    expect(third.frames[3]!.checks.find((c) => c.id === 'head')?.level).toBe('fail');
    expect(third.level).toBe('fail');
  });

  it('compares the clip with its neighbour by the head too: a head far from the neighbour\'s is a warning that says so', () => {
    const sheet = chooseScale(cutOf(turning()), EYE_TARGET, undefined, opts);
    const big = judgeAny(finish(turning(), sheet.factor * 1.3), sheet);
    const note = big.checks.find((c) => c.id === 'neighbour');
    expect(note?.level).toBe('warn');
    expect(note?.text).toMatch(/cabeza/);
    expect(judgeAny(finish(turning(), sheet.factor), sheet).checks.find((c) => c.id === 'neighbour')).toBeUndefined();
  });
});

describe('judging a delivery', () => {
  const names = SWORD_FRAMES.map((_, k) => `attack2_0${k}`);
  const request = BLOW;
  const tolerance = 0.14;
  const judge = (frames: readonly RgbaImage[], extra: Partial<Parameters<typeof judgeFrames>[0]> = {}) =>
    judgeFrames({
      names: names.slice(0, frames.length),
      frames,
      clipped: frames.map(() => ({ left: 0, right: 0, top: 0, bottom: 0 })),
      groundGap: frames.map(() => 0),
      request: { ...request, sword: false },
      canvas,
      scaling,
      tolerance,
      rawRed: frames.map(() => 0),
      anchors: new Map(),
      anchorProblems: [],
      ...extra,
    });
  const ids = (j: ReturnType<typeof judge>, k: number): string[] => j.frames[k]!.checks.filter((c) => c.level !== 'ok').map((c) => `${c.level}:${c.id}`);

  it('a clean delivery has no failure: what the cut, the scale and the placement make of good drawings is accepted', () => {
    const j = judge(placed.map((p) => p.image));
    expect(j.frames.flatMap((f) => f.checks.filter((c) => c.level === 'fail').map((c) => `${f.name} ${c.id}: ${c.text}`))).toEqual([]);
    expect(j.level).not.toBe('fail');
    for (const f of j.frames) {
      expect(f.clean.paleEdge, `${f.name}: a pale fringe`).toBeLessThan(LIMITS.paleEdge.warn);
      expect(f.margin, `${f.name}: the margin`).toBeGreaterThanOrEqual(canvas.margin);
    }
  });

  it('a white fringe at the edge — what is left when a figure is cut from white badly — is caught', () => {
    const dirty = copy(placed[2]!.image);
    const base = copy(dirty);
    for (let y = 2; y < dirty.height - 2; y++) {
      for (let x = 2; x < dirty.width - 2; x++) {
        const o = (y * dirty.width + x) * 4;
        if (base.data[o + 3]! >= 8) continue;
        // two pixels out from the figure's own edge: the halo of white a bad cut leaves
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) if (base.data[((y + dy) * base.width + (x + dx)) * 4 + 3]! >= 8) near = true;
        if (near) dirty.data.set([238, 238, 240, 120], o);
      }
    }
    const j = judge([dirty]);
    expect(ids(j, 0).some((x) => /:edge$/.test(x)), ids(j, 0).join(' ')).toBe(true);
    expect(j.level).not.toBe('ok');
  });

  it('red energy fused with the figure (the arcs of the user\'s drawings 8–10) is a failure; the sword\'s own thin dark-red edge is not', () => {
    const arc = copy(placed[2]!.image);
    let painted = 0;
    const b = boundsOf(arc, SOLID)!;
    for (let y = b.y0; y <= b.y1 && painted < 700; y++) for (let x = b.x0; x <= b.x1 && painted < 700; x++) if (arc.data[(y * arc.width + x) * 4 + 3]! >= SOLID && (x + y) % 5 === 0) (arc.data.set([210, 30, 34, 255], (y * arc.width + x) * 4), painted++);
    const j = judge([arc]);
    expect(ids(j, 0)).toContain('fail:red');
    // the frames of the game carry the sword's edge and are well inside the limit
    expect(judge([placed[3]!.image]).frames[0]!.clean.red).toBeLessThan(LIMITS.red.warn);
  });

  it('a hue the character does not have (yellow, green, skin tones) and a stray speck apart from the body are caught', () => {
    const tinted = copy(placed[1]!.image);
    let n = 0;
    for (let i = 0; i < tinted.data.length && n < 600; i += 4) if (tinted.data[i + 3]! >= SOLID && (i / 4) % 7 === 0) (tinted.data.set([230, 200, 40, 255], i), n++);
    expect(ids(judge([tinted]), 0)).toContain('fail:colour');
    const speck = copy(placed[1]!.image);
    for (let y = 8; y < 20; y++) for (let x = 8; x < 20; x++) speck.data.set([20, 24, 40, 255], (y * speck.width + x) * 4);
    expect(ids(judge([speck]), 0).some((x) => /:loose$/.test(x))).toBe(true);
  });

  it('a pose drawn at another scale is told apart by its eye: warned a little off, failed a lot off', () => {
    const odd = composeSheet(SWORD_FRAMES, { up: [3, 3, 3, 3.5, 3, 3, 4.35], cols: 4, gap: 90, shadow: true });
    const c = cutSheet(odd.sheet, 7);
    const s = chooseScale(c, target);
    const frames = c.poses.map((p) => placeFrame(p, s.factor, { anchorX: 'mass', anchorY: 'ground' }, canvas).image);
    const j = judge(frames, { scaling: s });
    expect(ids(j, 3), 'a pose 17 % too big').toContain('warn:eye');
    expect(ids(j, 6), 'a pose 45 % too big').toContain('fail:eye');
    expect(ids(j, 0).some((x) => /:eye$/.test(x)), 'a pose at the sheet\'s scale').toBe(false);
  });

  it('a figure that does not fit the canvas, or comes within the margin, fails; a repeated frame is warned; a jump of the body between frames is flagged', () => {
    const f = placed[0]!.image;
    expect(ids(judge([f], { clipped: [{ left: 0, right: 12, top: 0, bottom: 0 }] }), 0)).toContain('fail:clipped');
    const edge = copy(f);
    const b = boundsOf(f, 8)!;
    for (let y = 0; y < edge.height; y++) for (let x = 0; x < edge.width; x++) if (x < 2 && y >= b.y0 && y <= b.y0 + 5) edge.data.set([20, 20, 30, 255], (y * edge.width + x) * 4);
    expect(ids(judge([edge]), 0)).toContain('fail:margin');
    expect(ids(judge([f, f]), 1)).toContain('warn:repeat');
    const far = renderFrame(toDrawing(f), { width: 280, height: 230, scale: 1, origin: { x: -80, y: 0 } }, { warp: null, samples: 1 });
    expect(ids(judge([f, far]), 1).some((x) => /:mass$/.test(x))).toBe(true);
    // the size the brief gave for the clip is checked too
    const small = renderFrame(toDrawing(f), { width: 280, height: 230, scale: 0.4, origin: { x: -90, y: -100 } }, { warp: null, samples: 3 });
    expect(ids(judge([small]), 0).some((x) => /size-height/.test(x))).toBe(true);
  });

  it('a clip handed over at a size SMALLER than the frames is flagged: its pixels would be enlarged and go soft', () => {
    const j = judge(placed.map((p) => p.image), { scaling: { ...scaling, factor: 1.4 } });
    expect(j.checks.map((c) => `${c.level}:${c.id}`)).toContain('warn:resolution');
    expect(judge(placed.map((p) => p.image), { scaling: { ...scaling, factor: 2.4 } }).level).toBe('fail');
  });

  it('a clip with a sword needs its anchors in every frame: none is a failure; the grip and the tip on the figure and a blade of the game\'s length are accepted; a tip in the void or a stub of a blade are not', () => {
    const swordRequest = { ...request, sword: true };
    const frames = placed.map((p) => p.image);
    const withSword = (anchors: Map<string, SwordPoints>, problems: string[] = []) => judge(frames, { request: swordRequest, anchors, anchorProblems: problems });
    expect(ids(withSword(new Map()), 0)).toContain('fail:sword');
    const good = anchorsFor(names, frames, built.frames, SWORD_FRAMES);
    const ok = withSword(good);
    expect(ok.frames.flatMap((f) => f.checks.filter((c) => c.id === 'sword')).map((c) => c.text)).toEqual([]);
    expect(ok.frames[0]!.blade).toBeGreaterThan(0.8);
    expect(ok.frames[0]!.blade).toBeLessThan(1.05);
    const g0 = good.get(names[0]!)!;
    const off = new Map(good);
    off.set(names[0]!, { grip: g0.grip, tip: [g0.grip[0] + 70, 8] });
    expect(ids(withSword(off), 0)).toContain('fail:sword');
    const stub = new Map(good);
    stub.set(names[0]!, { grip: g0.grip, tip: [g0.grip[0] + 6, g0.grip[1]] });
    expect(withSword(stub).frames[0]!.checks.map((c) => c.text).join(' ')).toMatch(/de la empuñadura a la punta hay 0\.\d\d m/);
  });
});

describe('what a blow must do', () => {
  const requests = JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')).clips as Record<string, { sword: boolean; intent?: { tipRises?: number; tipDrops?: number; tipAdvances?: number }; frames: unknown[] }>;
  const names = SWORD_FRAMES.map((_, k) => `attack1_0${k}`);
  const judgeBlow = (request: Parameters<typeof judgeFrames>[0]['request']) => {
    const frames = placed.map((p) => p.image);
    return judgeFrames({
      names,
      frames,
      clipped: frames.map(() => ({ left: 0, right: 0, top: 0, bottom: 0 })),
      groundGap: frames.map(() => 0),
      request,
      canvas,
      scaling,
      tolerance: 0.14,
      rawRed: frames.map(() => 0),
      anchors: anchorsFor(names, frames, built.frames, SWORD_FRAMES),
      anchorProblems: [],
    });
  };

  it('the second blow is asked to come FORWARD (the drawn one is a low slash from behind the body to in front of it) and the blow in the air to come DOWN, as the end-to-end scenario has them', () => {
    expect(requests['attack2']!.intent).toMatchObject({ tipAdvances: 1 });
    expect(requests['attack2']!.intent).not.toHaveProperty('tipRises');
    expect(requests['aerialAttack']!.intent).toMatchObject({ tipDrops: 0.4 });
    expect(requests['crouchAttack']!.intent).toBeUndefined();
  });

  it('a blow that must ADVANCE is judged by how far its tip travels forward of the pivot between the wind-up and the cut: the distance it reports is the one the rule uses', () => {
    const phases = { startup: [0, 1], active: [2, 3], recovery: [4, 6] } as never;
    const asks = (tipAdvances: number) => judgeBlow({ ...BLOW, manifest: { ...BLOW.manifest, phases }, intent: { tipAdvances, es: '' } });
    const far = asks(9);
    expect(far.checks.map((c) => `${c.level}:${c.id}`)).toContain('fail:intent');
    const text = far.checks.find((c) => c.id === 'intent')!.text;
    expect(text).toMatch(/tiene que AVANZAR.*y avanza -?\d+\.\d\d m/);
    expect(far.level).toBe('fail');
    // the distance it says is the one the rule uses: asking a little less lets the blow through, asking a little more does not
    const advance = Number(/y avanza (-?\d+\.\d\d) m/.exec(text)![1]);
    expect(asks(advance - 0.05).checks.map((c) => c.id)).not.toContain('intent');
    expect(asks(advance + 0.05).checks.map((c) => `${c.level}:${c.id}`)).toContain('fail:intent');
  });

  it('a blow that goes the wrong way is caught before it is accepted: the first blow\'s drawings (the tip comes DOWN) are no second blow (a failure) and they are what the blow in the air does (no remark)', () => {
    // `attack1` is phased 0–1 / 2–3 / 4–6 like the second blow and the one in the air: its tip is raised in the wind-up and low in the cut
    const phases = { startup: [0, 1], active: [2, 3], recovery: [4, 6] } as never;
    const base = BLOW;
    const asSecond = judgeBlow({ ...base, sword: true, manifest: { ...base.manifest, phases }, intent: { tipRises: 0.4, es: '' } });
    expect(asSecond.checks.map((c) => `${c.level}:${c.id}`)).toContain('fail:intent');
    expect(asSecond.checks.find((c) => c.id === 'intent')!.text).toMatch(/tiene que SUBIR/);
    expect(asSecond.level).toBe('fail');
    const asAir = judgeBlow({ ...base, sword: true, manifest: { ...base.manifest, phases }, intent: { tipDrops: 0.4, es: '' } });
    expect(asAir.checks.map((c) => c.id)).not.toContain('intent');
    // a clip with no intent is not asked anything
    expect(judgeBlow({ ...base, sword: true, manifest: { ...base.manifest, phases }, intent: undefined }).checks.map((c) => c.id)).not.toContain('intent');
  });
});

describe('accepting a failure on purpose (waivers.json)', () => {
  const names = SWORD_FRAMES.map((_, k) => `attack1_0${k}`);
  const REASON = 'The pose is drawn with no sword in sight: its anchors are an estimate that only keeps the manifest whole.';
  const judge = (extra: Partial<Parameters<typeof judgeFrames>[0]> = {}) => {
    const frames = placed.map((p) => p.image);
    return judgeFrames({ names, frames, clipped: frames.map(() => ({ left: 0, right: 0, top: 0, bottom: 0 })), groundGap: frames.map(() => 0), request: BLOW, canvas, scaling, tolerance: 0.14, rawRed: frames.map(() => 0), anchors: new Map(), anchorProblems: [], ...extra });
  };

  it('reads waivers.json: nothing when there is none; an object of reasons — each long enough to be one — and everything else is said, not guessed', () => {
    expect(parseWaivers(null)).toEqual({});
    expect(parseWaivers(JSON.stringify({ 'x_00:sword': `  ${REASON}  ` }))).toEqual({ 'x_00:sword': REASON });
    expect(() => parseWaivers('{ nope')).toThrow(/not valid JSON/);
    expect(() => parseWaivers('[]')).toThrow(/must be an object/);
    expect(() => parseWaivers('"fine"')).toThrow(/must be an object/);
    expect(() => parseWaivers(JSON.stringify({ 'x_00:sword': 'ok' }))).toThrow(new RegExp(`"x_00:sword" needs a reason of at least ${MIN_WAIVER_REASON} characters`));
    expect(() => parseWaivers(JSON.stringify({ 'x_00:sword': 7 }))).toThrow(/needs a reason/);
  });

  it('turns the failure it names — and only that one — into a warning that says it was accepted on purpose, and keeps what the tool said and why it was accepted', () => {
    const j = judge();
    expect(j.level).toBe('fail');
    expect(j.frames.every((f) => f.checks.some((c) => c.id === 'sword' && c.level === 'fail'))).toBe(true);
    const { judgement, waived } = applyWaivers(j, { [`${names[1]}:sword`]: REASON });
    expect(judgement.frames[1]!.level).toBe('warn');
    const turned = judgement.frames[1]!.checks.find((c) => c.id === 'sword')!;
    expect(turned.level).toBe('warn');
    expect(turned.text).toMatch(/^FALLO ACEPTADO A PROPÓSITO/);
    expect(turned.text).toContain(j.frames[1]!.checks.find((c) => c.id === 'sword')!.text);
    // the others stay failures, and so does the clip
    for (const k of [0, 2, 3, 4, 5, 6]) expect(judgement.frames[k]!.level, names[k]).toBe('fail');
    expect(judgement.level).toBe('fail');
    expect(waived).toEqual([{ key: `${names[1]}:sword`, reason: REASON, was: [j.frames[1]!.checks.find((c) => c.id === 'sword')!.text] }]);
    // what was judged is not touched: the waiver builds a new judgement
    expect(j.frames[1]!.level).toBe('fail');
    // every failure waived: the clip is no longer a failure (the frames are warnings), and nothing is waived without being listed
    const all = applyWaivers(j, Object.fromEntries(names.map((n) => [`${n}:sword`, REASON])));
    expect(all.judgement.level).not.toBe('fail');
    expect(all.waived).toHaveLength(7);
  });

  it('waives a failure of the clip as a whole by its check alone (the blow that does not do what was asked)', () => {
    const frames = placed.map((p) => p.image);
    const j = judge({ anchors: anchorsFor(names, frames, built.frames, SWORD_FRAMES) });
    expect(j.checks.map((c) => `${c.level}:${c.id}`)).toContain('fail:intent');
    const { judgement, waived } = applyWaivers(j, { intent: REASON });
    expect(judgement.checks.find((c) => c.id === 'intent')!.level).toBe('warn');
    expect(judgement.level).not.toBe('fail');
    expect(waived[0]!.key).toBe('intent');
  });

  it('refuses a waiver that matches no failure — a stale one would accept whatever comes next — and says which failures there are', () => {
    const j = judge();
    expect(() => applyWaivers(j, { 'attack1_09:sword': REASON })).toThrow(IntakeError);
    expect(() => applyWaivers(j, { 'attack1_09:sword': REASON })).toThrow(/"attack1_09:sword" does not match any failure of this delivery.*attack1_00:sword/);
    // a check that passes, or one that is only a warning, is not a failure to accept
    expect(() => applyWaivers(j, { [`${names[0]}:loose`]: REASON })).toThrow(/does not match any failure/);
    const twice = judge({ request: { ...BLOW, sword: false }, frames: [placed[0]!.image, placed[0]!.image], names: names.slice(0, 2), clipped: [placed[0]!.clipped, placed[0]!.clipped], groundGap: [0, 0], rawRed: [0, 0] });
    expect(twice.frames[1]!.checks.map((c) => `${c.level}:${c.id}`)).toContain('warn:repeat');
    expect(() => applyWaivers(twice, { [`${names[1]}:repeat`]: REASON })).toThrow(/does not match any failure/);
    // and with no waivers nothing changes
    expect(applyWaivers(j, {})).toEqual({ judgement: j, waived: [] });
  });
});

describe('the anchors of the sword', () => {
  it('reads anchors.json: a grip and a tip per frame, inside the canvas; everything wrong with it is listed, not thrown', () => {
    const frames = ['x_00', 'x_01'];
    const good = parseAnchors(JSON.stringify({ x_00: { grip: [150, 170], tip: [210, 120] }, x_01: { grip: [152, 171], tip: [215, 118] } }), frames, canvas);
    expect(good.problems).toEqual([]);
    expect(good.points.get('x_01')).toEqual({ grip: [152, 171], tip: [215, 118] });
    expect(parseAnchors(null, frames, canvas).problems).toEqual(['no hay anchors.json para este clip']);
    expect(parseAnchors('{ nope', frames, canvas).problems[0]).toMatch(/no es JSON válido/);
    const bad = parseAnchors(JSON.stringify({ x_00: { grip: [150, 170] }, x_01: { grip: [0, 0], tip: [0, 0] }, x_09: { grip: [1, 1], tip: [2, 2] } }), frames, canvas);
    expect(bad.problems).toEqual(['x_00: necesita "grip": [x, y] y "tip": [x, y]', 'x_01: las anclas siguen siendo los ceros de la plantilla', 'x_09: anclas de un fotograma que este clip no tiene']);
    expect(parseAnchors(JSON.stringify({ x_00: { grip: [150, 170], tip: [999, 120] }, x_01: { grip: [1, 1], tip: [5, 5] } }), frames, canvas).problems[0]).toMatch(/fuera del lienzo/);
  });

  it('writes the manifest\'s anchors in metres from the pivot (forward and up), the hand being the grip, with the VFX and the hit on the blade by the slash rig\'s proportions', () => {
    const a = manifestAnchors({ grip: [185, 170], tip: [250, 120] }, canvas);
    expect(a['hand_r']).toEqual([1, 0.338]);
    expect(a['weapon_grip']).toEqual(a['hand_r']);
    expect(a['weapon_tip']).toEqual([2, 1.108]);
    // 0.48 and 0.85 of the way from the grip to the tip
    expect(a['vfx_origin']![0]).toBeCloseTo(1 + 0.48 * 1, 2);
    expect(a['hit_origin']![0]).toBeCloseTo(1 + 0.85 * 1, 2);
    expect(a['vfx_origin']![1]).toBeCloseTo(0.338 + 0.48 * (1.108 - 0.338), 2);
  });
});

describe('what is in the inbox, the rig\'s list of clips handed over, and the state of the clips', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'troid-inbox-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('reads one sheet, or one PNG per pose in natural order (2 before 10), and tells a non-PNG how to become one', () => {
    expect(readInbox(join(tmp, 'nothing'))).toBeNull();
    const a = join(tmp, 'poses');
    mkdirSync(a);
    const png = encodePng({ width: 2, height: 2, data: new Uint8Array(16).fill(255) });
    for (const n of ['dash_10.png', 'dash_2.png', 'dash_1.png', 'anchors.json', 'placement.json', 'waivers.json', '.DS_Store']) writeFileSync(join(a, n), n.endsWith('.png') ? png : '{}');
    const poses = readInbox(a)!;
    expect(poses.mode).toBe('poses');
    expect(poses.files).toEqual(['dash_1.png', 'dash_2.png', 'dash_10.png']);
    writeFileSync(join(a, 'sheet.png'), png);
    expect(readInbox(a)).toMatchObject({ mode: 'sheet', files: ['sheet.png'], ignored: ['dash_1.png', 'dash_2.png', 'dash_10.png'] });
    const b = join(tmp, 'jpeg');
    mkdirSync(b);
    writeFileSync(join(b, 'sheet.webp'), 'x');
    expect(() => readInbox(b)).toThrow(/only PNG is read: convert sheet\.webp/);
  });

  it('adds a clip to `delivered` in the hand-formatted rig without touching a character of the rest of the file', () => {
    const rig = '{\n  "comment": "…`delivered` lists…",\n  "canvas": {"width": 280},\n  "delivered": [],\n  "poses": {}\n}\n';
    const one = addDelivered(rig, 'dash');
    expect(one).toBe(rig.replace('"delivered": []', '"delivered": ["dash"]'));
    const two = addDelivered(one, 'attack2');
    expect(JSON.parse(two).delivered).toEqual(['dash', 'attack2']);
    expect(addDelivered(two, 'dash')).toBe(two);
    expect(two.replace('"delivered": ["dash", "attack2"]', '"delivered": []')).toBe(rig);
    expect(() => addDelivered('{ "poses": {} }', 'dash')).toThrow(/no "delivered" list/);
  });

  it('says what each of the eighteen clips is made of: the sheet\'s drawing, a stand-in, or drawn anew — and which are still asked for', () => {
    const rows = statusOf(root);
    expect(rows.map((r) => r.clip)).toEqual(Object.keys(readClips(root)));
    expect(rows).toHaveLength(18);
    const requests = JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')).clips as Record<string, { status: string }>;
    for (const r of rows) expect(r.requested, r.clip).toBe(requests[r.clip]?.status === 'requested');
    expect(rows.find((r) => r.clip === 'idle')).toMatchObject({ kind: 'own', requested: false });
    // a clip that is still asked for is not made of a drawing of its own — or is the walk, whose legs the sheet's one drawing only bent; the clips drawn anew are the rig's list of those handed over
    for (const r of rows.filter((x) => x.requested && x.clip !== 'walk')) expect(r.kind, `${r.clip} is asked for, so it is a stand-in`).toBe('stand-in');
    expect(rows.filter((r) => r.kind === 'delivered').map((r) => r.clip).sort()).toEqual([...readDelivered(root)].sort());
    for (const r of rows.filter((x) => x.kind === 'delivered')) expect(r.requested, `${r.clip} was handed over: it is no longer asked for`).toBe(false);
  });
});

describe('the production kit', () => {
  it('is what the requests, the user\'s sheet and the game\'s frames produce: nobody edited a brief by hand, and no leftover folder of a clip no longer asked for stays', () => {
    const files = buildKit(readKitSources(root));
    const dir = join(root, 'art', 'player', 'requests');
    for (const [rel, content] of files) {
      const want = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
      expect(existsSync(join(dir, rel)), `${rel} is committed`).toBe(true);
      expect(Buffer.compare(readFileSync(join(dir, rel)), want), `${rel} is what \`npm run assets:intake -- kit\` writes`).toBe(0);
    }
    const folders = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    expect(folders).toEqual([...new Set([...files.keys()].filter((f) => f.includes('/')).map((f) => f.split('/')[0]!))].sort());
  }, 60_000);

  it('says so when nothing is asked for any more — what was delivered, how each delivery differs from what was asked — and goes back to asking when a clip is requested again', () => {
    const data = JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')) as Requests;
    const all = structuredClone(data);
    for (const c of Object.values(all.clips)) c.status = 'delivered';
    const done = buildReadme(all);
    expect(done).toMatch(/no queda ningún clip por pedir/);
    expect(done).not.toMatch(/Los tres pasos/);
    for (const [id, c] of Object.entries(all.clips)) {
      expect(done, `${id} is in the table`).toContain(`| \`${id}\` | ${c.frames.length} | ${c.delivery?.asked?.frames ?? c.frames.length} |`);
      if (c.delivery) expect(done, `${id}: what differs from the ask`).toContain(c.delivery.note);
    }
    // one clip asked for again: the kit is the one it always was
    const again = structuredClone(all);
    again.clips['dash']!.status = 'requested';
    expect(buildReadme(again)).toMatch(/Los tres pasos/);
    expect(buildReadme(again)).not.toMatch(/no queda ningún clip por pedir/);
  });

  it('asks for what the pipeline can take: every clip is a clip of the generator, its frames add up to what its phases cover, and its timing keeps the length the game gives the action', () => {
    const data = JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')) as {
      clips: Record<string, { frames: unknown[]; manifest: { fps: number; loop: boolean; phases: { startup: [number, number]; active: [number, number]; recovery: [number, number] } | null }; scaleLike: string; placement: { anchorY: string }; sword: boolean }>;
    };
    const order = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'crouch', 'crouchWalk', 'dash', 'attack1', 'attack2', 'aerialAttack', 'crouchAttack', 'hurt', 'death', 'cast', 'drink', 'interact'];
    let total = 0;
    for (const [id, c] of Object.entries(data.clips)) {
      expect(order, `${id} is a clip the pipeline knows (CLIP_ORDER)`).toContain(id);
      expect(order, `${id}: the clip its size is matched to`).toContain(c.scaleLike);
      total += c.frames.length;
      const p = c.manifest.phases;
      if (p) {
        expect(p.startup[0], `${id}: the phases begin at frame 0`).toBe(0);
        expect(p.active[0], `${id}: active follows startup`).toBe(p.startup[1] + 1);
        expect(p.recovery[0], `${id}: recovery follows active`).toBe(p.active[1] + 1);
        expect(p.recovery[1] + 1, `${id}: the phases cover every frame`).toBe(c.frames.length);
      }
      expect(c.sword, `${id}: only the blows carry the sword`).toBe(Boolean(p));
    }
    expect(total).toBe(Object.values(data.clips).reduce((n, c) => n + c.frames.length, 0));
    // the clips that last what the game's action lasts (heroAnimation.test.ts checks the same on the committed art)
    const seconds = (id: string): number => data.clips[id]!.frames.length / data.clips[id]!.manifest.fps;
    expect(Math.abs(seconds('dash') - 10 / 60)).toBeLessThan(0.02);
    expect(Math.abs(seconds('drink') - 0.4)).toBeLessThan(0.02);
    expect(Math.abs(seconds('interact') - 12 / 60)).toBeLessThan(0.1);
    expect(seconds('death')).toBeGreaterThan(0.6);
    expect(seconds('death')).toBeLessThan(1);
  });
});

describe('handing a clip over, in a copy of the repository', () => {
  let tmp = '';
  // Every blow of the game has been handed over by now, so a delivery REPLACES one (`replace`): in the copy, `attack2` is made to ask for what the test's sheet holds — the seven frames of the first blow, which the generator
  // draws clean and whose anchors the manifest has — so what is exercised is the tool and not the drawings of a delivery (which carry their own baked effects, their anchors and their waivers)
  const clip = 'attack2';
  const replace = true;
  const spec = BLOW;
  const N = spec.frames.length;
  const source: string[] = [...SWORD_FRAMES];
  const delivered0 = readDelivered(root);
  const names = source.map((_, k) => `${clip}_0${k}`);
  const inbox = (): string => join(tmp, 'art', 'player', 'inbox', clip);
  const hash = (dirPath: string): string => readdirSync(dirPath).sort().map((f) => `${f}:${readFileSync(join(dirPath, f)).length}:${readFileSync(join(dirPath, f)).subarray(0, 64).toString('hex')}`).join('|');
  const archiveDir = (): string => join(tmp, 'art', 'player', 'source', 'delivered', clip);
  const state = (): { hero: string; manifest: string; rig: string; requests: string; archive: string } => ({
    hero: hash(join(tmp, 'art', 'player', 'hero')),
    archive: existsSync(archiveDir()) ? hash(archiveDir()) : '',
    manifest: readFileSync(join(tmp, 'art', 'player', 'player.pack.json'), 'utf8'),
    rig: readFileSync(join(tmp, 'art', 'player', 'source', 'hero.rig.json'), 'utf8'),
    requests: readFileSync(join(tmp, 'art', 'player', 'requests', 'requests.json'), 'utf8'),
  });

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'troid-intake-'));
    // the copy starts with an EMPTY inbox: what a person has dropped in the real one (sheets, reports) is theirs, and must not change what this test asserts
    const realInbox = join(root, 'art', 'player', 'inbox');
    cpSync(join(root, 'art'), join(tmp, 'art'), { recursive: true, filter: (src) => src !== realInbox && !src.startsWith(`${realInbox}${sep}`) });
    // in the copy the clip asks for the test's blow (the data of the real one is what its own delivery needed, not what the tool is tested on); no clip of the copy is asked for, as in the repository
    const requestsFile = join(tmp, 'art', 'player', 'requests', 'requests.json');
    const data = JSON.parse(readFileSync(requestsFile, 'utf8')) as { clips: Record<string, unknown> };
    data.clips[clip] = { ...(data.clips[clip] as object), ...BLOW, intent: undefined, delivery: undefined, status: 'delivered' };
    writeFileSync(requestsFile, `${JSON.stringify(data, null, 2)}\n`);
    mkdirSync(inbox(), { recursive: true });
    writeFileSync(join(inbox(), 'sheet.png'), encodePng(composeSheet(source, { up: 3, cols: 4, gap: 90, shadow: true }).sheet));
  }, 120_000);
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('prepares the clip and writes the report a person looks at; with no anchors the sword is a failure and nothing can be accepted', () => {
    const p = prepareClip(tmp, clip);
    expect(p.frames).toHaveLength(N);
    expect(p.names).toEqual(names);
    expect(p.judgement.level).toBe('fail');
    expect(p.judgement.frames.every((f) => f.checks.some((c) => c.id === 'sword' && c.level === 'fail'))).toBe(true);
    const dir = writeReport(tmp, p);
    for (const f of ['contact.png', 'anchors-grid.png', 'anchors.template.json', 'report.md', 'report.json', ...names.map((n) => `frames/${n}.png`)]) expect(existsSync(join(dir, f)), f).toBe(true);
    const contact = decodePng(readFileSync(join(dir, 'contact.png')));
    expect(contact.width).toBeGreaterThan(1000);
    expect(contact.height).toBeGreaterThan(1500);
    expect(JSON.parse(readFileSync(join(dir, 'anchors.template.json'), 'utf8'))).toHaveProperty(names[0]!);
    expect(readFileSync(join(dir, 'report.md'), 'utf8')).toMatch(/Veredicto: FALLO/);
    const before = state();
    expect(() => acceptClip(tmp, clip, { replace, pack: false, verify: false })).toThrow(/has failures/);
    expect(state(), 'a refused delivery changes nothing').toEqual(before);
    // the user's originals and the repository's frames are untouched by the preparation
    expect(readFileSync(join(tmp, 'art', 'player', 'source', 'hero-sheet.png')).equals(readFileSync(join(root, 'art', 'player', 'source', 'hero-sheet.png')))).toBe(true);
  }, 120_000);

  it('does not accept what it has not shown: with the anchors in place but no report of THEM, it asks to look first; when the delivery changes after the report, it asks again', () => {
    const p0 = prepareClip(tmp, clip);
    const anchors = anchorsFor(names, p0.frames, source.map(frame), source);
    writeFileSync(join(inbox(), 'anchors.json'), JSON.stringify(Object.fromEntries([...anchors].map(([k, v]) => [k, v])), null, 2));
    // the last report is the one of the delivery WITHOUT anchors: it does not match
    expect(() => acceptClip(tmp, clip, { replace, pack: false, verify: false })).toThrow(/changed since the report/);
    const p1 = prepareClip(tmp, clip);
    expect(p1.judgement.level, p1.judgement.frames.flatMap((f) => f.checks.filter((c) => c.level === 'fail').map((c) => `${f.name}: ${c.text}`)).join('\n')).not.toBe('fail');
    writeReport(tmp, p1);
    // and a clip that nobody has put in the inbox has nothing to accept
    expect(() => prepareClip(tmp, 'drink')).toThrow(/nothing in art\/player\/inbox\/drink/);
  }, 120_000);

  it('hands the clip over through `delivered`: the frames, the manifest entry with the anchors, the rig, the kit — and the generator and the art checks find nothing to correct', () => {
    const logs: string[] = [];
    const result = acceptClip(tmp, clip, { replace, pack: false, verify: true, log: (l) => logs.push(l) });
    expect(result.frames).toBe(N);
    const hero = join(tmp, 'art', 'player', 'hero');
    // the stand-in's own frames are gone, the new ones are there
    expect(readdirSync(hero).filter((f) => f.startsWith(`${clip}_`)).sort()).toEqual(names.map((n) => `${n}.png`));
    const manifest = JSON.parse(readFileSync(join(tmp, 'art', 'player', 'player.pack.json'), 'utf8')) as { sprites: Array<{ clips: Record<string, { count: number; tags: string[]; fps: number; phases: unknown; frames: string }>; frames: Record<string, { anchors: Record<string, number[]> }> }> };
    const sprite = manifest.sprites[0]!;
    expect(sprite.clips[clip]).toMatchObject({ frames: `${clip}_`, count: N, fps: spec.manifest.fps, tags: spec.manifest.tags, phases: spec.manifest.phases });
    expect(sprite.clips[clip]!.tags).not.toContain('stand-in');
    expect(Object.keys(sprite.frames).filter((k) => k.startsWith(`${clip}_`))).toEqual(names);
    for (const n of names) expect(Object.keys(sprite.frames[n]!.anchors).sort()).toEqual(['hand_r', 'hit_origin', 'vfx_origin', 'weapon_grip', 'weapon_tip']);
    // the other clips are as they were, and the manifest says one clip was drawn anew
    expect(sprite.clips['attack1']).toEqual(readClips(root)['attack1']);
    if (!replace) expect(readClips(root)[clip]!.tags).toContain('stand-in');
    const handed = [...new Set([...delivered0, clip])];
    expect(JSON.parse(readFileSync(join(tmp, 'art', 'player', 'source', 'hero.rig.json'), 'utf8')).delivered).toEqual(handed);
    // (the manifest names them in the generator's order)
    expect((manifest as unknown as { comment: string }).comment).toContain(`${handed.length} more clip(s) were drawn by hand and handed over (${CLIP_ORDER.filter((c) => handed.includes(c)).join(', ')})`);
    // the generator, run again, finds nothing to correct; the committed frames of the OTHER clips are the ones the rig makes
    expect(animate({ specPath: join(tmp, 'art', 'player', 'source', 'hero.poses.json'), check: true, log: () => undefined }).drift).toBe(0);
    // the status, the kit and the requests know it is delivered
    expect(statusOf(tmp).find((r) => r.clip === clip)).toMatchObject({ kind: 'delivered', frames: N, requested: false });
    expect(existsSync(join(tmp, 'art', 'player', 'requests', clip))).toBe(false);
    expect(JSON.parse(readFileSync(join(tmp, 'art', 'player', 'requests', 'requests.json'), 'utf8')).clips[clip].status).toBe('delivered');
    expect(readFileSync(join(tmp, 'art', 'player', 'requests', 'README.md'), 'utf8')).not.toContain(`${clip}/brief.md`);
    expect(logs.join('\n')).toContain(`"${clip}" handed over: ${N} frames`);
    // the sheet the frames came from stays with them, with the anchors and the report: the same sources give the same frames
    expect(readdirSync(archiveDir()).sort()).toEqual(['anchors.json', 'delivery.json', 'report.md', 'sheet.png']);
    expect(readFileSync(join(archiveDir(), 'sheet.png')).equals(readFileSync(join(inbox(), 'sheet.png')))).toBe(true);
    expect(readFileSync(join(archiveDir(), 'anchors.json'), 'utf8')).toBe(readFileSync(join(inbox(), 'anchors.json'), 'utf8'));
    expect(JSON.parse(readFileSync(join(archiveDir(), 'delivery.json'), 'utf8'))).toMatchObject({ clip, level: expect.stringMatching(/ok|warn/) });
  }, 240_000);

  it('does not overwrite approved drawings: a clip already handed over is refused unless the replacement is asked for by name', () => {
    expect(() => acceptClip(tmp, clip, { pack: false, verify: false })).toThrow(/already handed over: its drawings are approved/);
  });

  it('puts every file back when the delivery fails half way (here the generator refuses: the spec\'s sheet hash is wrong)', () => {
    const poses = join(tmp, 'art', 'player', 'source', 'hero.poses.json');
    const original = readFileSync(poses, 'utf8');
    // a different delivery of the same clip (the same blow, at another size), to be accepted over the first with --replace — and sabotaged
    const second = composeSheet(source, { up: 3.2, cols: 4, gap: 90, shadow: true });
    writeFileSync(join(inbox(), 'sheet.png'), encodePng(second.sheet));
    const p = prepareClip(tmp, clip);
    writeFileSync(join(inbox(), 'anchors.json'), JSON.stringify(Object.fromEntries(anchorsFor(names, p.frames, second.frames, source)), null, 2));
    writeReport(tmp, prepareClip(tmp, clip));
    writeFileSync(poses, original.replace(/"sheetSha256": "[0-9a-f]+"/, '"sheetSha256": "0000"'));
    const before = state();
    const logs: string[] = [];
    expect(() => acceptClip(tmp, clip, { replace: true, pack: false, verify: false, log: (l) => logs.push(l) })).toThrow(/not the one the spec was made for/);
    expect(state(), 'every file touched was put back').toEqual(before);
    expect(logs.join('\n')).toMatch(/was NOT applied/);
    writeFileSync(poses, original);
  }, 240_000);

  it('accepts a failure on purpose, and only that one: waivers.json makes the named failure a warning with its reason in the report, the file goes into the archive, and a changed waiver asks to look again', () => {
    const REASON = 'The sword of this frame is a stub in the sheet by design of the test: the failure is known and accepted.';
    // the same delivery with the grip and the tip of the first frame a hand's breadth apart: a stub of a blade is a failure
    const anchors = JSON.parse(readFileSync(join(inbox(), 'anchors.json'), 'utf8')) as Record<string, { grip: [number, number]; tip: [number, number] }>;
    anchors[names[0]!]!.tip = [anchors[names[0]!]!.grip[0] + 6, anchors[names[0]!]!.grip[1]];
    writeFileSync(join(inbox(), 'anchors.json'), JSON.stringify(anchors, null, 2));
    const failing = prepareClip(tmp, clip);
    expect(failing.judgement.level).toBe('fail');
    expect(failing.judgement.frames[0]!.checks.some((c) => c.id === 'sword' && c.level === 'fail')).toBe(true);
    expect(() => acceptClip(tmp, clip, { replace, pack: false, verify: false })).toThrow(/has failures/);
    // with the waiver the delivery is a warning, the report says so and why, and the contact sheet shows the frame as a warning
    writeFileSync(join(inbox(), 'waivers.json'), JSON.stringify({ [`${names[0]}:sword`]: REASON }, null, 2));
    const waived = prepareClip(tmp, clip);
    expect(waived.judgement.level).toBe('warn');
    expect(waived.waived.map((w) => w.key)).toEqual([`${names[0]}:sword`]);
    writeReport(tmp, waived);
    const report = readFileSync(join(tmp, 'art', 'player', 'inbox', '_reports', clip, 'report.md'), 'utf8');
    expect(report).toMatch(/Fallos aceptados a propósito/);
    expect(report).toContain(REASON);
    expect(report).toMatch(/la herramienta decía: de la empuñadura a la punta hay 0\.\d\d m/);
    // the waivers are part of what the report showed: a waiver changed after it must be looked at again
    writeFileSync(join(inbox(), 'waivers.json'), JSON.stringify({ [`${names[0]}:sword`]: `${REASON} (changed)` }, null, 2));
    expect(() => acceptClip(tmp, clip, { replace, pack: false, verify: false })).toThrow(/changed since the report/);
    writeFileSync(join(inbox(), 'waivers.json'), JSON.stringify({ [`${names[0]}:sword`]: REASON }, null, 2));
    expect(() => acceptClip(tmp, clip, { replace, pack: false, verify: false })).not.toThrow();
    // the archive keeps the file with the delivery, and the fingerprint knows it was there
    expect(readdirSync(archiveDir()).sort()).toEqual(['anchors.json', 'delivery.json', 'report.md', 'sheet.png', 'waivers.json']);
    expect(readFileSync(join(archiveDir(), 'waivers.json'), 'utf8')).toBe(readFileSync(join(inbox(), 'waivers.json'), 'utf8'));
    expect(JSON.parse(readFileSync(join(archiveDir(), 'delivery.json'), 'utf8'))).toMatchObject({ clip, level: 'warn', waivers: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(readFileSync(join(archiveDir(), 'report.md'), 'utf8')).toContain(REASON);
  }, 240_000);
});
