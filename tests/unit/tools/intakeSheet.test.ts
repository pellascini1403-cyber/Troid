import { describe, expect, it } from 'vitest';
import { bodyOf, boundsOf, darkBodyMask, headDiameter, isDark } from '../../../tools/assets/figure';
import {
  castManifestAnchors,
  CAST_ORIGIN_MAX,
  chooseScale,
  GROUND_GAP_WARN,
  IntakeError,
  judgeFrames,
  LIMITS,
  placeFrame,
  type Canvas,
  type Cut,
  type SwordPoints,
} from '../../../tools/assets/intake';
import type { ClipRequest } from '../../../tools/assets/kit';
import type { RgbaImage } from '../../../tools/assets/png';

/**
 * WHAT THE RECEPTION LEARNED FOR THE CHARACTER SHEET (tools/assets/intake.ts, figure.ts; docs/PROMPT16-LOG.md): the new design's body is near-black and its cape a big light flame, its sword may dip below its feet, its
 * head turns and its eyes go small, one of its clips lies on the floor, its cast has no sword. Each of those is a rule of the tool that has to hold by itself, so they are tested on figures made for them — a dark body, a
 * pale cape, a blade under the feet, a scarf that cuts the body in two, a speck — and not on the art of the repository (that is `characterArt.test.ts`).
 */
const canvas: Canvas = { width: 280, height: 230, pivot: [120, 192], artPxPerMeter: 65, margin: 4 };

type Rgba = readonly [number, number, number, number];
const BODY: Rgba = [14, 16, 24, 255];
const CAPE: Rgba = [110, 200, 240, 255];
const GLOW: Rgba = [120, 225, 245, 255];

interface Parts {
  /** A big light cape to the left of the body. */
  cape?: boolean;
  /** A thin dark blade from the hand that goes under the sole of the foot. */
  blade?: boolean;
  /** A band of the light colour across the neck: the dark body is in two pieces. */
  scarf?: boolean;
  /** A dark speck far from everything. */
  speck?: boolean;
  /** A narrow heel (6 px wide, 4 tall) under the legs: the opening that drops thin parts takes it off the body — and it is still the sole of the foot. */
  boot?: boolean;
}

/** The row of the sole of the foot in `figure()`. */
const SOLE = 129;

/**
 * A figure: head (a dark disc 56 px across with a cyan eye and its white highlight inside it), torso and legs (dark, 36 px wide, down to the sole at row 129) — symmetrical about column 110 — and, as asked, the cape, the blade, the scarf
 * and the speck.
 */
function figure(parts: Parts = {}): RgbaImage {
  const w = 220;
  const h = 170;
  const data = new Uint8Array(w * h * 4);
  const put = (x: number, y: number, c: Rgba): void => {
    if (x >= 0 && y >= 0 && x < w && y < h) data.set(c, (y * w + x) * 4);
  };
  const disc = (cx: number, cy: number, r: number, c: Rgba): void => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) put(x, y, c);
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: Rgba): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c);
  };
  disc(110, 50, 28, BODY);
  if (parts.boot) {
    rect(92, 78, 127, SOLE - 4, BODY);
    rect(104, SOLE - 3, 109, SOLE, BODY);
  } else rect(92, 78, 127, SOLE, BODY);
  disc(122, 48, 9, GLOW);
  disc(120, 46, 3, [255, 255, 255, 255]);
  if (parts.cape) rect(8, 80, 91, 125, CAPE);
  if (parts.scarf) rect(70, 72, 150, 77, CAPE);
  if (parts.blade) for (let t = 0; t <= 50; t++) rect(Math.round(128 + t * 0.44), 100 + t, Math.round(128 + t * 0.44) + 1, 100 + t, BODY);
  if (parts.speck) rect(20, 20, 22, 22, BODY);
  return { width: w, height: h, data };
}

const cutOf = (poses: readonly RgbaImage[]): Cut => ({
  poses: [...poses],
  boxes: poses.map((p) => ({ x0: 0, y0: 0, x1: p.width - 1, y1: p.height - 1 })),
  final: poses.map(() => false),
  rawRed: poses.map(() => 0),
  notes: [],
});

const countAt = (mask: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number): number => {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * w + x]) n++;
  return n;
};

describe('the body of a dark figure with a light cape', () => {
  it('knows what is dark: the near-black of the body, not the glowing cyan, the pale fire, nor a deep blue', () => {
    expect(isDark(14, 16, 24)).toBe(true);
    expect(isDark(70, 70, 70)).toBe(true);
    expect(isDark(120, 225, 245)).toBe(false);
    expect(isDark(110, 200, 240)).toBe(false);
    expect(isDark(20, 30, 160)).toBe(false);
    expect(isDark(200, 200, 200)).toBe(false);
  });

  it('the dark body is the dark pixels and what they enclose — the eye with its highlight is in it — and nothing of the cape, whatever its size', () => {
    const img = figure({ cape: true });
    const mask = darkBodyMask(img);
    const w = img.width;
    expect(mask[50 * w + 110], 'the dark of the head').toBe(1);
    expect(mask[48 * w + 122], 'the eye that the dark encloses').toBe(1);
    expect(mask[46 * w + 120], 'its white highlight').toBe(1);
    expect(countAt(mask, w, 8, 80, 91, 125), 'the cape').toBe(0);
    expect(mask[(SOLE + 1) * w + 110], 'below the sole').toBe(0);
  });

  it('its centre of mass stays on the body, where a cape drags the one of the whole figure: the body is what the player\'s box is centred on', () => {
    const img = figure({ cape: true });
    const whole = bodyOf(img, 3, false)!;
    const dark = bodyOf(img, 3, true)!;
    expect(Math.abs(dark.cx - 110), 'the dark body is symmetrical about column 110').toBeLessThan(1);
    expect(whole.cx, 'the cape drags the whole figure to the left').toBeLessThan(dark.cx - 6);
    expect(dark.bottom).toBeGreaterThanOrEqual(SOLE - 3);
    expect(dark.bottom).toBeLessThanOrEqual(SOLE);
  });

  it('a scarf that cuts the body in two leaves both pieces its body — the head above and the torso below — and a speck is not body, and neither is a thin blade', () => {
    const img = figure({ scarf: true, speck: true, blade: true });
    const w = img.width;
    const body = bodyOf(img, 3, true)!;
    expect(countAt(body.mask, w, 80, 22, 140, 71), 'the head, above the scarf').toBeGreaterThan(1500);
    expect(countAt(body.mask, w, 92, 78, 127, SOLE), 'the torso and legs, below it').toBeGreaterThan(1500);
    expect(countAt(body.mask, w, 18, 18, 24, 24), 'the speck').toBe(0);
    expect(countAt(body.mask, w, 130, 120, 160, 160), 'the blade').toBe(0);
    // the centre of mass is where the two pieces balance — between the head's (about row 48) and the torso's (about row 104) — not on either one alone
    expect(body.cy).toBeGreaterThan(65);
    expect(body.cy).toBeLessThan(80);
  });
});

describe('placing a figure on the canvas by its dark body', () => {
  const ground = { anchorX: 'mass', anchorY: 'ground', body: 'dark' } as const;

  it('puts the centre of mass of the dark body on the pivot column and the sole of its foot on the pivot row — a blade that goes under the foot does not lift the feet, and nothing is flagged', () => {
    const pose = figure({ cape: true, blade: true, boot: true });
    // the lowest dark pixel of the legs' columns: the sole of the foot (the blade is farther to the right)
    const soleOf = (img: RgbaImage): number => {
      const dark = darkBodyMask(img);
      for (let y = img.height - 1; y >= 0; y--) for (let x = 0; x < 140; x++) if (dark[y * img.width + x] && img.data[(y * img.width + x) * 4 + 3]! >= 128 && x >= 90 && x < 130) return y;
      return -1;
    };
    // the premise: the narrow heel is not in the body proper, so the body's bottom is above the sole
    expect(bodyOf(pose, 3, true)!.bottom, 'the opening takes the heel off the body').toBeLessThan(soleOf(pose) - 1);
    const placed = placeFrame(pose, 1, ground, canvas);
    expect(Math.abs(bodyOf(placed.image, 3, true)!.cx - canvas.pivot[0]), 'mass x').toBeLessThan(1);
    // the sole — the heel included, though the body proper ends above it — is the pivot row; the blade goes on below it
    expect(soleOf(placed.image)).toBe(canvas.pivot[1]);
    expect(boundsOf(placed.image, 128)!.y1, 'the blade reaches below the sole').toBeGreaterThan(canvas.pivot[1] + 10);
    expect(placed.groundGap).toBe(0);
    // by the whole figure (the default) the lowest thing is the blade: it would stand on the ground and the feet would float — and the tool says so
    const bySolid = placeFrame(pose, 1, { anchorX: 'mass', anchorY: 'ground' }, canvas);
    expect(boundsOf(bySolid.image, 128)!.y1).toBe(canvas.pivot[1]);
    expect(bySolid.groundGap).toBeGreaterThan(GROUND_GAP_WARN);
  });

  it('a nudge moves the whole frame, and a figure that does not fit is told, never cut quietly', () => {
    const pose = figure({ cape: true });
    const base = placeFrame(pose, 1, ground, canvas);
    const moved = placeFrame(pose, 1, ground, canvas, { dx: 7, dy: -3 });
    const a = boundsOf(base.image, 1)!;
    const b = boundsOf(moved.image, 1)!;
    expect([b.x0 - a.x0, a.y1 - b.y1, b.x1 - a.x1, a.y0 - b.y0]).toEqual([7, 3, 7, 3]);
    const far = placeFrame(pose, 1, ground, canvas, { dx: 150, dy: 0 });
    expect(far.clipped.right, 'what goes beyond the right edge, in px').toBeGreaterThan(0);
    expect(far.clipped.left).toBe(0);
  });

  it('at the size of the sheet (factor 1) the figure is COPIED, moved by whole pixels — not one pixel is resampled — and at any other factor it is resampled', () => {
    const pose = figure({ cape: true, blade: true });
    const placed = placeFrame(pose, 1, ground, canvas);
    const pb = boundsOf(pose, 1)!;
    const b = boundsOf(placed.image, 1)!;
    expect([b.x1 - b.x0, b.y1 - b.y0]).toEqual([pb.x1 - pb.x0, pb.y1 - pb.y0]);
    let differing = 0;
    for (let y = pb.y0; y <= pb.y1; y++) {
      for (let x = pb.x0; x <= pb.x1; x++) {
        const s = (y * pose.width + x) * 4;
        const o = ((b.y0 + y - pb.y0) * placed.image.width + (b.x0 + x - pb.x0)) * 4;
        for (let c = 0; c < 4; c++) if (placed.image.data[o + c] !== pose.data[s + c]) differing++;
      }
    }
    expect(differing, 'channels that are not the sheet\'s').toBe(0);
    // another factor goes through the resampler: the figure changes size, and the edge pixels are no longer the sheet's
    const scaled = placeFrame(pose, 1.25, ground, canvas);
    expect(Math.abs(headDiameter(scaled.image)! / headDiameter(pose)! - 1.25)).toBeLessThan(0.03);
    expect(Buffer.from(scaled.image.data).equals(Buffer.from(placed.image.data))).toBe(false);
  });
});

/** A pose made of what the measurements look at: a dark dome `head` px across, a round glowing eye `eye` px across with white highlights (none when `eye` is `null`) and a body slimmer than the head. */
function pose(head: number, eye: number | null): RgbaImage {
  const w = Math.ceil(head * 1.4);
  const h = Math.ceil(head * 1.7);
  const data = new Uint8Array(w * h * 4);
  const paint = (x: number, y: number, rgba: Rgba): void => {
    if (x >= 0 && y >= 0 && x < w && y < h) data.set(rgba, (y * w + x) * 4);
  };
  const disc = (cx: number, cy: number, r: number, rgba: Rgba): void => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) paint(x, y, rgba);
  };
  const cx = w / 2;
  const cy = head / 2 + 2;
  disc(cx, cy, head / 2, BODY);
  for (let y = Math.round(cy + head * 0.4); y < h - 1; y++) for (let x = Math.round(cx - head * 0.18); x <= Math.round(cx + head * 0.18); x++) paint(x, y, BODY);
  if (eye !== null) {
    const ex = cx + head * 0.1;
    disc(ex, cy, eye / 2, [150, 225, 245, 255]);
    for (const [dx, dy, k] of [[-0.18, -0.2, 0.14], [0.12, 0.12, 0.08], [0.2, -0.1, 0.07]] as const) disc(ex + dx * eye, cy + dy * eye, Math.max(1.5, k * eye), [255, 255, 255, 255]);
  }
  return { width: w, height: h, data };
}

describe('scaling a sheet by its head, or by the poses that can be measured', () => {
  it('the head is what the sheet is measured by when the request says so — even when its eyes agree, which the tool would otherwise read by the eye — one factor, headTarget over the head the poses have', () => {
    const agree = cutOf([pose(60, 24), pose(60, 24), pose(60, 24)]);
    expect(chooseScale(agree, 22, undefined, { headTarget: 56 }).proxy, 'left to itself the tool reads the eye when the eyes agree').toBe('eye');
    const forced = chooseScale(agree, 22, undefined, { headTarget: 56, proxy: 'head' });
    expect(forced.proxy).toBe('head');
    expect(forced.how).toBe('head');
    expect(forced.factor).toBeCloseTo(56 / headDiameter(agree.poses[0]!)!, 6);
    expect(forced.headTarget).toBe(56);
    // and without a head to bring it to there is nothing to scale by: the error says what to pass
    expect(() => chooseScale(agree, 22, undefined, { proxy: 'head' })).toThrow(/no head to measure in the poses or in the frames of the neighbouring clip/);
    expect(() => chooseScale(agree, 22, undefined, { proxy: 'head' })).toThrow(IntakeError);
    // a factor given by hand still wins, with the measurement kept
    expect(chooseScale(agree, 22, 1.5, { headTarget: 56, proxy: 'head' })).toMatchObject({ factor: 1.5, how: 'given', proxy: 'head' });
  });

  it('only the poses named are measured: the one lying on the floor, whose head cannot be a circle, does not drag the median — the factor is the one of the poses that can be read', () => {
    const cut = cutOf([pose(60, 24), pose(30, null), pose(30, null), pose(60, 24)]);
    const all = chooseScale(cut, 22, undefined, { headTarget: 56, proxy: 'head' });
    const some = chooseScale(cut, 22, undefined, { headTarget: 56, proxy: 'head', only: [0, 3] });
    expect(some.only).toEqual([0, 3]);
    expect(some.factor).toBeCloseTo(56 / headDiameter(cut.poses[0]!)!, 6);
    expect(all.only).toBeNull();
    expect(all.factor, 'measured by all four the median is the middle of 60 and 30').toBeGreaterThan(some.factor * 1.25);
    // every pose of the clip is still measured and kept in the reading
    expect(some.heads).toHaveLength(4);
    expect(some.heads[1]).toBeCloseTo(headDiameter(cut.poses[1]!)!, 6);
    // the eyes of the poses that are not read are not counted either
    expect(chooseScale(cutOf([pose(60, 24), pose(30, 6), pose(30, 6)]), 22, undefined, { only: [0] }).factor).toBeCloseTo(22 / chooseScale(cutOf([pose(60, 24)]), 22).median!, 6);
  });

  it('the judgement follows: a pose that is not measured for the scale is no failure of the scale (and says why), the same pose in a clip where it is measured IS one', () => {
    const cut = cutOf([pose(60, 24), pose(60, 24), pose(30, null)]);
    const names = ['attack2_00', 'attack2_01', 'attack2_02'];
    const request: ClipRequest = { ...REQUEST, sword: false };
    const judge = (scaling: ReturnType<typeof chooseScale>) => {
      const placed = cut.poses.map((p) => placeFrame(p, scaling.factor, { anchorX: 'mass', anchorY: 'ground' }, canvas));
      return judgeFrames({
        names,
        frames: placed.map((p) => p.image),
        clipped: placed.map((p) => p.clipped),
        groundGap: placed.map((p) => p.groundGap),
        request,
        canvas,
        scaling,
        tolerance: 0.14,
        rawRed: [0, 0, 0],
        anchors: new Map(),
        anchorProblems: [],
      });
    };
    const only = judge(chooseScale(cut, 22, undefined, { headTarget: 56, proxy: 'head', only: [0, 1] }));
    const lying = only.frames[2]!;
    expect(lying.checks.filter((c) => c.level !== 'ok').map((c) => c.id), 'nothing of the scale is wrong with the pose that is not measured').not.toContain('head');
    expect(lying.checks.find((c) => c.id === 'scale')?.text).toMatch(/esta pose no se mide para la escala/);
    expect(Math.abs(only.head! - 56), 'the median head of the clip is the one of the poses that are read').toBeLessThan(1.5);
    // measured by all three, the small pose is a pose drawn at another scale
    const all = judge(chooseScale(cut, 22, undefined, { headTarget: 56, proxy: 'head' }));
    expect(all.frames[2]!.checks.map((c) => `${c.level}:${c.id}`)).toContain('fail:head');
  });
});

/** The request the tests judge by: the blow of the tool's own tests, with the data of the clip the test is about. */
const REQUEST: ClipRequest = {
  group: 'B',
  priority: 1,
  status: 'requested',
  title: 'A clip (the tests\' fixture)',
  titleEs: 'Un clip (el de las pruebas)',
  why: 'a clip',
  gameplay: { seconds: null, ticks: 10, note: 'ten ticks' },
  manifest: { fps: 10, loop: false, tags: [], phases: { startup: [0, 0], active: [1, 1], recovery: [2, 2] } },
  placement: { anchorX: 'mass', anchorY: 'ground', body: 'dark' },
  scaleLike: 'idle',
  scaleWhy: 'the fixture',
  sword: false,
  limits: { heightM: [0.5, 4], widthM: [0.5, 4] },
  references: { sheet: ['idle'], frames: ['idle_00'], note: 'the fixture' },
  frames: [0, 1, 2].map((k) => ({ role: `pose ${k}`, phase: k === 0 ? ('startup' as const) : k === 1 ? ('active' as const) : ('recovery' as const), en: `pose ${k}`, es: `pose ${k}` })),
};

describe('a clip with no sword that fires: the hand and where the bolt leaves', () => {
  const placed = placeFrame(figure({ cape: true }), 1, { anchorX: 'mass', anchorY: 'ground', body: 'dark' }, canvas);
  const frames = [placed.image, placed.image, placed.image];
  const names = ['cast_00', 'cast_01', 'cast_02'];
  const request: ClipRequest = { ...REQUEST, anchors: 'cast', sword: false };
  const judge = (anchors: Map<string, SwordPoints>, problems: string[] = []) =>
    judgeFrames({
      names,
      frames,
      clipped: frames.map(() => ({ left: 0, right: 0, top: 0, bottom: 0 })),
      groundGap: [0, 0, 0],
      request,
      canvas,
      scaling: chooseScale(cutOf([figure(), figure(), figure()]), null, 1),
      tolerance: 0.14,
      rawRed: [0, 0, 0],
      anchors,
      anchorProblems: problems,
    });
  const casts = (j: ReturnType<typeof judge>, k: number): string[] => j.frames[k]!.checks.filter((c) => c.id === 'cast').map((c) => `${c.level}: ${c.text}`);
  /** A point on the body of the placed figure (the hand), and where the bolt leaves: a few px ahead of it. */
  const hand: [number, number] = (() => {
    const b = bodyOf(placed.image, 3, true)!;
    return [Math.round(b.cx), Math.round(b.cy)];
  })();
  const good = (): Map<string, SwordPoints> => new Map(names.map((n) => [n, { grip: hand, tip: [hand[0] + 20, hand[1] - 3] as [number, number] }]));

  it('needs the hand and the origin of the bolt in every frame: none is a failure, and a clip that fires needs no blade (nothing is asked of a sword it does not have)', () => {
    expect(casts(judge(new Map()), 0)).toEqual([expect.stringMatching(/^fail: sin anclas para este fotograma: el disparo necesita la mano/)]);
    expect(judge(new Map(), ['cast_00: falta la mano']).frames[0]!.checks.find((c) => c.id === 'cast')?.text).toBe('cast_00: falta la mano');
    const ok = judge(good());
    for (let k = 0; k < 3; k++) expect(casts(ok, k), `cast_0${k}`).toEqual([]);
    expect(ok.frames.flatMap((f) => f.checks).filter((c) => c.id === 'sword')).toEqual([]);
    expect(ok.frames[0]!.blade, 'no blade is measured').toBeNull();
  });

  it('refuses a bolt that leaves farther from the hand than a hand reaches, and a hand that is not on the figure', () => {
    expect(CAST_ORIGIN_MAX).toBeCloseTo(0.8, 6);
    const far = good();
    far.set('cast_01', { grip: hand, tip: [hand[0] + Math.round((CAST_ORIGIN_MAX + 0.1) * canvas.artPxPerMeter), hand[1]] });
    expect(casts(judge(far), 1)[0]).toMatch(/^fail: el proyectil sale a 0\.9\d m de la mano \(se admite hasta 0\.8 m\)/);
    const void_ = good();
    void_.set('cast_02', { grip: [5, 5], tip: [25, 5] });
    expect(casts(judge(void_), 2)[0]).toMatch(/^fail: el ancla de la mano \(5, 5\) no está sobre la figura/);
  });

  it('writes the anchors of the manifest in metres from the pivot (forward and up): the hand and the origin of the projectile — and nothing of a sword', () => {
    expect(castManifestAnchors({ grip: [185, 100], tip: [205, 97] }, canvas)).toEqual({ hand_r: [1, 1.415], projectile_origin: [1.308, 1.462] });
  });
});

describe('the blade of a character whose sword is not the game\'s', () => {
  const placed = placeFrame(figure({ cape: true, blade: true }), 1, { anchorX: 'mass', anchorY: 'ground', body: 'dark' }, canvas);
  const names = ['attack1_00'];
  const frames = [placed.image];
  const b = bodyOf(placed.image, 3, true)!;
  const grip: [number, number] = [Math.round(b.cx + 18), Math.round(b.cy + 10)];
  const sword = (request: ClipRequest, lengthM: number) =>
    judgeFrames({
      names,
      frames,
      clipped: [{ left: 0, right: 0, top: 0, bottom: 0 }],
      groundGap: [0],
      request,
      canvas,
      scaling: chooseScale(cutOf([figure()]), null, 1),
      tolerance: 0.14,
      rawRed: [0],
      // the tip is `lengthM` away from the grip along the drawn blade (down and to the right)
      anchors: new Map([[names[0]!, { grip, tip: [Math.round(grip[0] + lengthM * canvas.artPxPerMeter * 0.4), Math.round(grip[1] + lengthM * canvas.artPxPerMeter * 0.9)] as [number, number] }]]),
      anchorProblems: [],
    });
  const swords = (j: ReturnType<typeof sword>): string[] => j.frames[0]!.checks.filter((c) => c.id === 'sword').map((c) => c.text);

  it('is judged by the length the request gives it (`limits.bladeM`) and by the game\'s 0.6–1.3 m when it gives none: a blade of 0.45 m is a stub to the one and the sword of the other', () => {
    const plain: ClipRequest = { ...REQUEST, sword: true };
    const ownBlade: ClipRequest = { ...REQUEST, sword: true, limits: { ...REQUEST.limits, bladeM: [0.3, 0.6] } };
    expect(LIMITS.blade).toEqual({ min: 0.6, max: 1.3 });
    expect(swords(sword(plain, 0.45))[0]).toMatch(/^de la empuñadura a la punta hay 0\.4\d m; la hoja del juego mide 0\.93 m \(se admite 0\.6–1\.3 m\)/);
    expect(swords(sword(ownBlade, 0.45)).filter((t) => /de la empuñadura a la punta hay/.test(t))).toEqual([]);
    expect(swords(sword(ownBlade, 0.75))[0]).toMatch(/^de la empuñadura a la punta hay 0\.7\d m; la hoja de este personaje \(se admite 0\.3–0\.6 m\)/);
  });
});
