import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildArt } from '../../../tools/assets/build';
import { verifyArtFolder } from '../../../tools/assets/verify';
import { bodyOf, boundsOf, cleanliness, headDiameter } from '../../../tools/assets/figure';
import { clipFrameNames, heroPaths, readClips, readDelivered } from '../../../tools/assets/heroRepo';
import { cutByBoxes, distanceToFigure, LIMITS, parsePoseBoxes } from '../../../tools/assets/intake';
import { decodePng, type RgbaImage } from '../../../tools/assets/png';

/**
 * THE PROTAGONIST'S FRAMES AS THE GAME HAS THEM (docs/PROMPT16-LOG.md): what is asserted is the state of the art of the repository today — the 44 frames of `art/player/hero/`, made from the user's character sheet — and
 * the rules a frame of it has to keep, measured on the frames themselves and not on the tool that made them: nothing of the design before is in the game; the clip that is at the sheet's own size is the sheet's pixels,
 * bit for bit; the clips that are scaled are scaled uniformly (a figure is not stretched); the head — what stays when the face turns — is one size in every clip; the feet stand on the ground line and the body on the
 * pivot in EVERY frame of EVERY clip (the canvas is as wide as the longest trail of fire needs, so no drawing is nudged off the body to fit it); nothing is cut by the edge of the picture; the blow's and the cast's anchors
 * lie on the figure. What the measurements say of the frames the design had BEFORE is in `figure.test.ts`.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const paths = heroPaths(root);
const clips = readClips(root);
const frame = (name: string): RgbaImage => decodePng(readFileSync(join(paths.hero, `${name}.png`)));
const allFrames = Object.entries(clips).flatMap(([clip, c]) => clipFrameNames(c).map((name) => ({ clip, name, img: frame(name) })));
const manifest = (JSON.parse(readFileSync(paths.manifest, 'utf8')) as { sprites: Array<{ pivotPx: [number, number]; artPxPerMeter: number; frameSize: [number, number]; frames: Record<string, { anchors?: Record<string, [number, number]> }> }> }).sprites[0]!;
const [PIVOT_X, PIVOT_Y] = manifest.pivotPx;
const PX_PER_M = manifest.artPxPerMeter;
/** The canvas the reception places frames on (`requests.json`): the same as the sprite set's. */
const requests = JSON.parse(readFileSync(paths.requests, 'utf8')) as { canvas: { width: number; height: number; pivot: [number, number]; artPxPerMeter: number; margin: number } };
const hashOf = (img: RgbaImage): string => createHash('sha256').update(img.data).digest('hex');

const alphaBounds = (img: RgbaImage): { x0: number; y0: number; x1: number; y1: number; w: number; h: number } => {
  const b = boundsOf(img, 1)!;
  return { ...b, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 };
};
const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** The clips whose body stands on the ground line (the others are in the air, or on it only part of the time). */
const GROUNDED = ['idle', 'walk', 'run', 'land', 'attack1', 'cast', 'dash', 'interact', 'hurt', 'death'];

describe('the protagonist\'s frames are the character sheet\'s, and nothing of the design before', () => {
  it('has the 44 frames the manifest declares, all of the size of the sprite set, all different from one another — no frame is another one moved or copied', () => {
    expect(allFrames).toHaveLength(44);
    for (const { name, img } of allFrames) expect([img.width, img.height], name).toEqual(manifest.frameSize);
    expect(new Set(allFrames.map((f) => hashOf(f.img))).size).toBe(44);
  });

  it('has not one frame of the design before: none of the 44 is a pixel-for-pixel copy of any of the 90 that are kept in the archive', () => {
    const old = join(paths.archive, 'design-v1', 'hero');
    const oldFiles = readdirSync(old).filter((f) => f.endsWith('.png'));
    expect(oldFiles, 'the design before is kept whole in the archive: the 90 frames it had').toHaveLength(90);
    const oldHashes = new Set(oldFiles.map((f) => hashOf(decodePng(readFileSync(join(old, f))))));
    for (const { name, img } of allFrames) expect(oldHashes.has(hashOf(img)), `${name} is a frame of the old design`).toBe(false);
    // (and its manifest is kept with them: the design before can be put back as it was)
    expect(existsSync(join(paths.archive, 'design-v1', 'player.pack.json'))).toBe(true);
  });

  it('every clip has a delivery that says where it came from: the part of the sheet it was cut from, and the hash of each of its frames', () => {
    expect(readDelivered(root)).toEqual(Object.keys(clips));
    for (const [clip, c] of Object.entries(clips)) {
      const d = JSON.parse(readFileSync(join(paths.delivered, clip, 'delivery.json'), 'utf8')) as { frames: Array<{ name: string; sha256: string }>; inputs: Array<{ file: string }> };
      expect(d.frames.map((f) => f.name), clip).toEqual(clipFrameNames(c));
      expect(d.inputs.map((i) => i.file), clip).toEqual(['sheet.png']);
      for (const f of d.frames) expect(createHash('sha256').update(readFileSync(join(paths.hero, `${f.name}.png`))).digest('hex'), `${f.name}: the frame in the game is the one that was delivered`).toBe(f.sha256);
    }
  });

  it('the idle is the user\'s drawing bit for bit: at the sheet\'s own size (factor 1) every pixel of the figure is the pixel of the sheet, the figure moved by a whole number of pixels and nothing else', () => {
    const dir = join(paths.delivered, 'idle');
    const part = decodePng(readFileSync(join(dir, 'sheet.png')));
    const boxes = parsePoseBoxes(readFileSync(join(dir, 'poses.json'), 'utf8'), clips['idle']!.count, part);
    const cut = cutByBoxes(part, boxes.boxes, boxes.matte);
    clipFrameNames(clips['idle']!).forEach((name, k) => {
      const pose = cut.poses[k]!;
      const img = frame(name);
      const b = alphaBounds(img);
      expect([b.w, b.h], `${name}: the figure is the size of the pose of the sheet`).toEqual([pose.width, pose.height]);
      let differing = 0;
      for (let y = 0; y < pose.height; y++) {
        for (let x = 0; x < pose.width; x++) {
          const s = (y * pose.width + x) * 4;
          const o = ((b.y0 + y) * img.width + (b.x0 + x)) * 4;
          if (img.data[o] !== pose.data[s] || img.data[o + 1] !== pose.data[s + 1] || img.data[o + 2] !== pose.data[s + 2] || img.data[o + 3] !== pose.data[s + 3]) differing++;
        }
      }
      expect(differing, `${name}: pixels that are not the sheet's`).toBe(0);
      // and there is nothing else in the picture: not one pixel outside the figure's rectangle
      let inside = 0;
      let all = 0;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! > 0) all++;
      for (let i = 3; i < pose.data.length; i += 4) if (pose.data[i]! > 0) inside++;
      expect(all, `${name}: nothing outside the figure`).toBe(inside);
    });
  });

  it('a scaled clip is scaled uniformly: its figure is the pose of the sheet times ONE factor in both directions — nothing is stretched (the clips whose drawing was not touched by hand, so their outline is the whole pose)', () => {
    for (const clip of ['walk', 'run', 'jump', 'fall', 'land']) {
      const dir = join(paths.delivered, clip);
      const d = JSON.parse(readFileSync(join(dir, 'delivery.json'), 'utf8')) as { scale: { factor: number }; erase: unknown };
      expect(d.erase, `${clip}: nothing was taken out of its drawings`).toBeNull();
      const part = decodePng(readFileSync(join(dir, 'sheet.png')));
      const boxes = parsePoseBoxes(readFileSync(join(dir, 'poses.json'), 'utf8'), clips[clip]!.count, part);
      const cut = cutByBoxes(part, boxes.boxes, boxes.matte);
      expect(d.scale.factor, `${clip}: the sheet's drawing is at a smaller size than the sprite set, never larger`).toBeGreaterThanOrEqual(1);
      expect(d.scale.factor, clip).toBeLessThan(1.15);
      clipFrameNames(clips[clip]!).forEach((name, k) => {
        const pose = cut.poses[k]!;
        const b = boundsOf(frame(name), 8)!;
        const w = b.x1 - b.x0 + 1;
        const h = b.y1 - b.y0 + 1;
        expect(Math.abs(w - pose.width * d.scale.factor), `${name}: width ${w} for ${pose.width} × ${d.scale.factor}`).toBeLessThanOrEqual(2.5);
        expect(Math.abs(h - pose.height * d.scale.factor), `${name}: height ${h} for ${pose.height} × ${d.scale.factor}`).toBeLessThanOrEqual(2.5);
        expect(Math.abs(w / pose.width - h / pose.height), `${name}: both directions by the same factor`).toBeLessThan(0.03);
      });
    }
  });
});

describe('one character in every clip: the same head, the feet on the same ground, the body on the same pivot', () => {
  const headOf = (img: RgbaImage): number => headDiameter(img)!;
  const idleHead = median(clipFrameNames(clips['idle']!).map((n) => headOf(frame(n))));

  it('the head is one size in every clip: the median of every clip is within 4 % of the idle\'s (the death lying down is read by its first pose, and the poses where the head is hidden by the body are not read), and no frame of a clip strays more than 12 % from its clip (the most, today: dash_01\'s 10.7 %)', () => {
    for (const [clip, c] of Object.entries(clips)) {
      const heads = clipFrameNames(c).map((n) => headOf(frame(n)));
      if (clip === 'death') {
        expect(Math.abs(heads[0]! - idleHead) / idleHead, 'death_00, the fall begins standing: its head is the idle\'s').toBeLessThan(0.04);
        continue;
      }
      expect(Math.abs(median(heads) - idleHead) / idleHead, `${clip}: head ${median(heads).toFixed(1)} px, the idle's ${idleHead.toFixed(1)}`).toBeLessThan(0.04);
      const mid = median(heads);
      for (const [k, h] of heads.entries()) expect(Math.abs(h - mid) / mid, `${clip}_${String(k).padStart(2, '0')}: head ${h.toFixed(1)} px`).toBeLessThan(0.12);
    }
    // that head is the head of the design: a disc of about 56 px, at the 65 px a metre of the sprite set
    expect(idleHead / PX_PER_M).toBeGreaterThan(0.84);
    expect(idleHead / PX_PER_M).toBeLessThan(0.89);
  });

  it('the feet stand on the ground line of the sprite set: in every clip that is on the ground, the lowest of the dark body is within 3 px of the pivot\'s row, in every frame', () => {
    for (const { clip, name, img } of allFrames) {
      if (!GROUNDED.includes(clip)) continue;
      const body = bodyOf(img, 3, true)!;
      expect(Math.abs(body.bottom - PIVOT_Y), `${name}: feet at row ${body.bottom}, the ground line at ${PIVOT_Y}`).toBeLessThanOrEqual(3);
    }
  });

  it('the body is on the pivot: its centre of mass is within 1.5 px of the pivot\'s column in every frame of every clip — the dash and the death included: nothing is nudged off the body to fit the picture', () => {
    for (const { name, img } of allFrames) {
      const body = bodyOf(img, 3, true)!;
      expect(Math.abs(body.cx - PIVOT_X), `${name}: body at ${body.cx.toFixed(1)}, pivot at ${PIVOT_X}`).toBeLessThanOrEqual(1.5);
    }
  });

  it('the body never jumps between two frames of a clip by more than the limit of the reception (0.55 m): the clip reads as one movement', () => {
    for (const [clip, c] of Object.entries(clips)) {
      const names = clipFrameNames(c);
      for (let k = 1; k < names.length; k++) {
        const a = bodyOf(frame(names[k - 1]!), 3, true)!;
        const b = bodyOf(frame(names[k]!), 3, true)!;
        expect(Math.hypot(b.cx - a.cx, b.cy - a.cy) / PX_PER_M, `${clip}: ${names[k - 1]} → ${names[k]}`).toBeLessThan(LIMITS.massStep.warn);
      }
    }
  });

  it('the canvas is the sprite set\'s, and nothing of the drawing is cut by its edge: the frames keep the margin the contract asks (4 px) all round the figure, in every frame', () => {
    expect(requests.canvas).toMatchObject({ width: manifest.frameSize[0], height: manifest.frameSize[1], pivot: manifest.pivotPx, artPxPerMeter: PX_PER_M });
    for (const { name, img } of allFrames) {
      const b = boundsOf(img, 1)!;
      expect(Math.min(b.x0, b.y0, img.width - 1 - b.x1, img.height - 1 - b.y1), `${name}: ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(requests.canvas.margin);
    }
  });

  it('is as clean as the reception asks, with the one exception it was accepted with: no frame is near the limit of loose pieces, effect red or a foreign colour, and no frame has a pale fringe — bar death_01, whose pale glint is the drawing\'s own light', () => {
    for (const { name, img } of allFrames) {
      const c = cleanliness(img);
      expect(c.red, `${name}: red`).toBe(0);
      expect(c.foreign, `${name}: foreign colour`).toBe(0);
      expect(c.loose, `${name}: loose pieces`).toBeLessThan(LIMITS.loose.warn);
      if (name !== 'death_01') expect(c.paleEdge, `${name}: pale fringe`).toBeLessThan(LIMITS.paleEdge.warn);
      else expect(c.paleEdge, 'the exception is an exception: it fails nothing').toBeLessThan(LIMITS.paleEdge.fail);
    }
  });
});

describe('the anchors of the sword and the cast', () => {
  /** An anchor of the manifest (metres from the pivot, +x forward, +y up) in the pixels of its frame. */
  const px = (a: [number, number]): [number, number] => [PIVOT_X + a[0] * PX_PER_M, PIVOT_Y - a[1] * PX_PER_M];

  it('only the clips that need them have them — the blow\'s four frames and the cast\'s four — and every anchor lies on the figure it is for (the grip on the hand, the tip on the blade, the origin of the projectile within a hand\'s reach of the hand)', () => {
    const withAnchors = Object.keys(manifest.frames).filter((f) => manifest.frames[f]!.anchors).sort();
    expect(withAnchors).toEqual(['attack1_00', 'attack1_01', 'attack1_02', 'attack1_03', 'cast_00', 'cast_01', 'cast_02', 'cast_03']);
    for (const name of withAnchors) {
      const img = frame(name);
      const a = manifest.frames[name]!.anchors!;
      if (name.startsWith('attack1')) {
        expect(Object.keys(a).sort(), name).toEqual(['hand_r', 'hit_origin', 'vfx_origin', 'weapon_grip', 'weapon_tip']);
        expect(a['hand_r'], `${name}: the hand holds the grip`).toEqual(a['weapon_grip']);
        for (const key of ['weapon_grip', 'weapon_tip'] as const) expect(distanceToFigure(img, px(a[key]!), LIMITS.anchorOnFigure + 1), `${name} ${key}`).toBeLessThanOrEqual(LIMITS.anchorOnFigure);
        // the tip is the far end of the blade: forward of the grip and farther from the hand than anything else the sword has
        expect(a['weapon_tip']![0], `${name}: the tip is ahead of the grip`).toBeGreaterThan(a['weapon_grip']![0]);
        const blade = Math.hypot(a['weapon_tip']![0] - a['weapon_grip']![0], a['weapon_tip']![1] - a['weapon_grip']![1]);
        expect(blade, `${name}: blade, in metres`).toBeGreaterThan(0.3);
        expect(blade, `${name}: blade, in metres`).toBeLessThan(LIMITS.blade.max);
        // where the blow lands and where its light starts are on the blade
        for (const key of ['hit_origin', 'vfx_origin'] as const) {
          const t = ((a[key]![0] - a['weapon_grip']![0]) * (a['weapon_tip']![0] - a['weapon_grip']![0]) + (a[key]![1] - a['weapon_grip']![1]) * (a['weapon_tip']![1] - a['weapon_grip']![1])) / (blade * blade);
          expect(t, `${name} ${key}: along the blade`).toBeGreaterThan(0);
          expect(t, `${name} ${key}: along the blade`).toBeLessThan(1);
        }
      } else {
        expect(Object.keys(a).sort(), name).toEqual(['hand_r', 'projectile_origin']);
        expect(distanceToFigure(img, px(a['hand_r']!), LIMITS.anchorOnFigure + 1), `${name}: the hand is on the figure`).toBeLessThanOrEqual(LIMITS.anchorOnFigure);
        expect(a['projectile_origin']![0], `${name}: the projectile leaves forward of the hand`).toBeGreaterThan(a['hand_r']![0]);
        expect(Math.hypot(a['projectile_origin']![0] - a['hand_r']![0], a['projectile_origin']![1] - a['hand_r']![1]), `${name}: within a hand's reach (metres)`).toBeLessThan(0.5);
      }
    }
  });

  it('the sword arc reaches farthest in the frame of the blow that strikes, and the blow is drawn facing right: the sprite set faces right and the tip of the blade goes forward', () => {
    const tip = (k: number): number => manifest.frames[`attack1_0${k}`]!.anchors!['weapon_tip']![0];
    expect(Math.max(...[0, 1, 2, 3].map(tip))).toBe(tip(2));
    expect(tip(2)).toBeGreaterThan(1);
  });
});

describe('the way back to the design before', () => {
  it('is open: put back where the game reads it, the archived design builds with no error and verifies — 90 frames in 18 clips — and nothing of the design of today is needed for that', () => {
    const base = mkdtempSync(join(tmpdir(), 'troid-revert-'));
    try {
      // what README.md of the archive says to do: its `hero/` and its manifest where `art/player/` has them
      const from = join(paths.archive, 'design-v1');
      mkdirSync(join(base, 'art', 'player'), { recursive: true });
      cpSync(join(from, 'hero'), join(base, 'art', 'player', 'hero'), { recursive: true });
      cpSync(join(from, 'player.pack.json'), join(base, 'art', 'player', 'player.pack.json'));
      // the index of the repository, with the entry of the protagonist (the other packs are not what is being put back)
      const index = JSON.parse(readFileSync(join(root, 'art', 'index.json'), 'utf8')) as { packs: Array<{ id: string }> };
      writeFileSync(join(base, 'art', 'index.json'), JSON.stringify({ ...index, packs: index.packs.filter((p) => p.id === 'player') }));
      const built = buildArt({ srcDir: join(base, 'art'), outDir: join(base, 'public', 'art'), write: true });
      expect(built.packs.map((p) => [p.id, p.shipped])).toEqual([['player', true]]);
      expect(built.issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`)).toEqual([]);
      expect(built.ok).toBe(true);
      const manifest = JSON.parse(readFileSync(join(base, 'public', 'art', 'player', 'player.pack.json'), 'utf8')) as { sprites: Array<{ clips: Record<string, { count: number }>; frames: Record<string, unknown> }> };
      const hero = manifest.sprites[0]!;
      expect(Object.keys(hero.clips)).toHaveLength(18);
      expect(Object.values(hero.clips).reduce((n, c) => n + c.count, 0)).toBe(90);
      expect(verifyArtFolder(join(base, 'public', 'art')).ok).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 120_000);

  it('keeps every frame its manifest names: the 90 frames of the design before are in the archive, by name', () => {
    const old = JSON.parse(readFileSync(join(paths.archive, 'design-v1', 'player.pack.json'), 'utf8')) as { sprites: Array<{ clips: Record<string, { frames: string; count: number }> }> };
    const names = Object.values(old.sprites[0]!.clips).flatMap((c) => Array.from({ length: c.count }, (_, k) => `${c.frames}${String(k).padStart(2, '0')}.png`));
    for (const f of names) expect(existsSync(join(paths.archive, 'design-v1', 'hero', f)), `${f} is in the archive`).toBe(true);
    expect(new Set(names).size).toBe(90);
  });
});
