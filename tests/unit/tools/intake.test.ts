import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { animate } from '../../../tools/assets/animate';
import { bodyOf, boundsOf, eyeDiameter, SOLID } from '../../../tools/assets/figure';
import { CLIP_ORDER } from '../../../tools/assets/heroClips';
import { clipEye, clipFrameNames, readClips, readDelivered } from '../../../tools/assets/heroRepo';
import {
  chooseScale,
  cutLoose,
  cutSheet,
  IntakeError,
  judgeFrames,
  LIMITS,
  manifestAnchors,
  parseAnchors,
  placeFrame,
  type Canvas,
  type Cut,
  type Scaling,
  type SwordPoints,
} from '../../../tools/assets/intake';
import { acceptClip, addDelivered, prepareClip, readInbox, statusOf, writeReport } from '../../../tools/assets/intakeRun';
import { buildKit, readKitSources } from '../../../tools/assets/kit';
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
    const eyeless = cutSheet(composeSheet(['death_05', 'death_06', 'death_07', 'death_08'], { up: 3, cols: 2, gap: 80, shadow: true }).sheet, 4);
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

describe('judging a delivery', () => {
  const names = SWORD_FRAMES.map((_, k) => `attack2_0${k}`);
  const request = JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')).clips.attack2;
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
  const requests = JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')).clips as Record<string, { sword: boolean; intent?: { tipRises?: number; tipDrops?: number }; frames: unknown[] }>;
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

  it('the second blow is asked to come UP and the blow in the air to come DOWN, as the brief and the end-to-end scenario have them', () => {
    expect(requests['attack2']!.intent).toMatchObject({ tipRises: 0.4 });
    expect(requests['aerialAttack']!.intent).toMatchObject({ tipDrops: 0.4 });
    expect(requests['crouchAttack']!.intent).toBeUndefined();
  });

  it('a blow that goes the wrong way is caught before it is accepted: the first blow\'s drawings (the tip comes DOWN) are no second blow (a failure) and they are what the blow in the air does (no remark)', () => {
    // `attack1` is phased 0–1 / 2–3 / 4–6 like the second blow and the one in the air: its tip is raised in the wind-up and low in the cut
    const phases = { startup: [0, 1], active: [2, 3], recovery: [4, 6] } as never;
    const base = JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')).clips.attack2;
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
    for (const n of ['dash_10.png', 'dash_2.png', 'dash_1.png', 'anchors.json', 'placement.json', '.DS_Store']) writeFileSync(join(a, n), n.endsWith('.png') ? png : '{}');
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
    // every clip asked for is one that is not made of a drawing of its own — or is the walk, whose legs the sheet's one drawing only bends
    for (const r of rows.filter((x) => x.requested && x.clip !== 'walk')) expect(r.kind, `${r.clip} is asked for, so it is a stand-in`).toBe('stand-in');
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
  // a blow with a sword that is still asked for (so the delivery replaces a stand-in); the day every blow has been handed over, the first one is replaced on purpose (`replace`)
  const asked = JSON.parse(readFileSync(join(root, 'art', 'player', 'requests', 'requests.json'), 'utf8')).clips as Record<string, { sword: boolean; status: string; priority: number; group: string; frames: unknown[]; manifest: { fps: number; tags: string[]; phases: unknown } }>;
  const swordClips = Object.entries(asked).filter(([, c]) => c.sword).sort((a, b) => a[1].priority - b[1].priority || a[1].group.localeCompare(b[1].group));
  const pending = swordClips.find(([, c]) => c.status === 'requested');
  const [clip, spec] = pending ?? swordClips[0]!;
  const replace = pending === undefined;
  const N = spec.frames.length;
  // the sheet is made of the clip's OWN frames in the game today (a stand-in's, or the delivered ones): they rise or drop as that blow must, so the check of what the blow does passes as it would for a good delivery
  const source = clipFrameNames(readClips(root)[clip]!).slice(0, N);
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
});
