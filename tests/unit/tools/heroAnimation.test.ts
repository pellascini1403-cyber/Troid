import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { BOTTLES } from '@/content/resources';
import { SLASH_1, SLASH_2, AIR_SLASH, CROUCH_SLASH } from '@/content/attacks';
import { MAX_INTERACT_LOCK } from '@/interaction/Interactable';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import { SWORD_GRIP_TOLERANCE } from '@/presentation/validateSpriteSet';
import { buildHeroAnimation, cutDrawings, keptFrom, type HeroAnimation, type RigFile, type SheetSpec } from '../../../tools/assets/heroAnimation';
import { CLIP_ORDER } from '../../../tools/assets/heroClips';
import { decodePng, type RgbaImage } from '../../../tools/assets/png';

/**
 * THE PROTAGONIST'S ANIMATION, made from the user's sheet (docs/ART-PIPELINE-2D.md part N), checked as a whole: what the user handed over is untouched, every pixel of every frame is
 * one of the user's, every clip is really in motion (not a pose that is moved a hair and called an animation), the feet stand on the pivot, the sword is in the hand, and each clip
 * lasts what the action it draws lasts in the game. The frames that are committed are the ones the rig produces — nobody's hand is in them.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
/** The generator belongs to the design the protagonist had before the character sheet of the Prompt 16: its sources, frames and manifest are kept, in the layout of `art/player/`, in `art/player/archive/design-v1/` (docs/PROMPT16-LOG.md). */
const ARCHIVE = ['art', 'player', 'archive', 'design-v1'] as const;
const read = (...p: string[]): Buffer => readFileSync(join(root, ...p));
const spec = JSON.parse(read(...ARCHIVE, 'source', 'hero.poses.json').toString('utf8')) as SheetSpec;
const rig = JSON.parse(read(...ARCHIVE, 'source', 'hero.rig.json').toString('utf8')) as RigFile;
const sheetBytes = read(...ARCHIVE, 'source', 'hero-sheet.png');
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The user's two pictures, by the hash they had when they were handed over: if one of these changes, somebody has touched the originals. */
const ORIGINALS = {
  'hero-sheet.png': '9146b74eb8b6b2edc38df37c97f46160b61d482d815396d63d371275a805d472',
  'hero-portrait.jpg': '3930665be078a48448980083df14b637e1ecc0eb347ae800db44eeb1f90ea1a5',
} as const;

/** The clips and what the manifest says of them, in the order the generator writes them. */
const CLIPS = {
  idle: { frames: 8, loop: true, standIn: false },
  walk: { frames: 8, loop: true, standIn: false },
  run: { frames: 8, loop: true, standIn: false },
  jump: { frames: 6, loop: false, standIn: false },
  fall: { frames: 4, loop: true, standIn: false },
  land: { frames: 4, loop: false, standIn: false },
  crouch: { frames: 6, loop: true, standIn: true },
  crouchWalk: { frames: 6, loop: true, standIn: true },
  dash: { frames: 4, loop: false, standIn: true },
  attack1: { frames: 7, loop: false, standIn: false },
  attack2: { frames: 8, loop: false, standIn: true },
  aerialAttack: { frames: 7, loop: false, standIn: true },
  crouchAttack: { frames: 7, loop: false, standIn: true },
  hurt: { frames: 5, loop: false, standIn: false },
  death: { frames: 9, loop: false, standIn: true },
  cast: { frames: 7, loop: false, standIn: false },
  drink: { frames: 6, loop: false, standIn: true },
  interact: { frames: 4, loop: false, standIn: true },
} as const;
type ClipId = keyof typeof CLIPS;

/**
 * The clips an artist drew anew and handed over (`delivered` in the rig; none until a delivery is accepted with `npm run assets:intake -- <clip> --accept`): the generator makes none of their
 * frames, so what it guarantees of its own clips (the feet on the pivot to the pixel, an eye that never changes size) is not asked of them — the reception judges them (tools/assets/intake.ts),
 * and the clip's entry, its frames and its anchors are checked below and by `assets:check`.
 */
const HANDED = new Set(rig.delivered ?? []);
const GENERATED = (Object.entries(CLIPS) as Array<[ClipId, (typeof CLIPS)[ClipId]]>).filter(([id]) => !HANDED.has(id));
const generated = (ids: readonly ClipId[]): ClipId[] => ids.filter((id) => !HANDED.has(id));

/** Frames of the clips that stand on the ground: their lowest pixel is ON the pivot's row, in every frame (a clip that floats or sinks is a position jump at the cut). */
const GROUNDED: readonly ClipId[] = ['idle', 'walk', 'run', 'land', 'crouch', 'crouchWalk', 'dash', 'attack1', 'attack2', 'crouchAttack', 'hurt', 'death', 'cast', 'drink', 'interact'];
const SWORD_CLIPS: readonly ClipId[] = ['attack1', 'attack2', 'aerialAttack', 'crouchAttack'];

let built: HeroAnimation;
beforeAll(() => {
  // the clips an artist drew by hand and handed over (`delivered` in the rig; none today) are carried over from the committed manifest, as `assets:animate` does
  built = buildHeroAnimation(spec, rig, decodePng(sheetBytes), keptFrom(JSON.parse(read(...ARCHIVE, 'player.pack.json').toString('utf8'))));
}, 180_000);

const frameOf = (clip: string, k: number): RgbaImage => built.frames.get(`${clip}_${pad2(k)}`)!;
const manifestSprite = (): { clips: Record<string, { frames: string; count: number; fps: number; loop: boolean; phases?: Record<string, [number, number]>; tags: string[]; comment: string }>; frames: Record<string, { anchors: Record<string, [number, number]> }>; pivotPx: [number, number]; artPxPerMeter: number; frameSize: [number, number] } =>
  (built.manifest['sprites'] as Array<Record<string, never>>)[0] as never;

/** The fraction of the pixels of either figure at which two frames differ by more than a quarter of a channel: how much of the picture moved. */
function moved(a: RgbaImage, b: RgbaImage): number {
  let on = 0;
  let differ = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const aa = a.data[i + 3]!;
    const ba = b.data[i + 3]!;
    if (aa < 32 && ba < 32) continue;
    on++;
    let m = Math.abs(aa - ba);
    for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs((a.data[i + c]! * aa) / 255 - (b.data[i + c]! * ba) / 255));
    if (m > 24) differ++;
  }
  return on === 0 ? 0 : differ / on;
}


/**
 * The big eye of a frame — the most recognisable thing of the design: the biggest connected patch of bright cyan (the white of its pupils sits inside it and is not counted), as the diameter of
 * the circle of that area and its mean colour; `null` when there is none (the eye is out).
 */
function eyeOf(img: RgbaImage): { d: number; rgb: [number, number, number] } | null {
  const { width: W, height: H, data } = img;
  const lit = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    if (data[o + 3]! >= 200 && data[o + 2]! > 150 && data[o + 1]! > 130 && data[o + 2]! - data[o]! > 30) lit[i] = 1;
  }
  const seen = new Uint8Array(W * H);
  let best: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!lit[i] || seen[i]) continue;
    const patch: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length > 0) {
      const p = stack.pop()!;
      patch.push(p);
      const x = p % W;
      const y = (p / W) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
        if (q >= 0 && lit[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (patch.length > best.length) best = patch;
  }
  if (best.length < 40) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of best) {
    r += data[p * 4]!;
    g += data[p * 4 + 1]!;
    b += data[p * 4 + 2]!;
  }
  return { d: 2 * Math.sqrt(best.length / Math.PI), rgb: [r / best.length, g / best.length, b / best.length] };
}

describe('the protagonist\'s animation, made from the user\'s sheet', () => {
  it('the user\'s originals are untouched: the sheet and the portrait are what they were when they were handed over', () => {
    expect(sha(sheetBytes)).toBe(spec.sheetSha256);
    expect(sha(sheetBytes)).toBe(ORIGINALS['hero-sheet.png']);
    expect(sha(read(...ARCHIVE, 'source', 'hero-portrait.jpg'))).toBe(ORIGINALS['hero-portrait.jpg']);
  });

  it('the drawings are the sheet\'s pixels: wherever a drawing is solid it is the sheet\'s colour, to the bit — nothing is painted, recoloured or smoothed', () => {
    const sheet = decodePng(sheetBytes);
    const { drawings } = cutDrawings(spec, sheet);
    expect([...drawings.keys()]).toEqual(['idle', 'idle2', 'run', 'jump', 'fall', 'land', 'slash', 'hurt', 'guard']);
    for (const [id, img] of drawings) {
      const p = spec.poses[id]!;
      const [x0, y0, x1] = p.box;
      const bw = x1 - x0 + 1;
      let solid = 0;
      let same = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const o = (y * img.width + x) * 4;
          if (img.data[o + 3] !== 255) continue;
          solid++;
          const sx = p.flip ? x0 + (bw - 1 - x) : x0 + x;
          const s = ((y0 + y) * sheet.width + sx) * 4;
          if (img.data[o] === sheet.data[s] && img.data[o + 1] === sheet.data[s + 1] && img.data[o + 2] === sheet.data[s + 2]) same++;
        }
      }
      expect(solid, `drawing "${id}" has a figure`).toBeGreaterThan(5000);
      expect(same, `drawing "${id}": every solid pixel is the sheet's`).toBe(solid);
    }
  });

  it('makes the eighteen clips: the fifteen the game asks of it, the landing, the run and the crawl — with the frames the table says', () => {
    expect([...CLIP_ORDER]).toEqual(Object.keys(CLIPS));
    expect(built.frames.size).toBe(GENERATED.reduce((n, [, c]) => n + c.frames, 0));
    if (HANDED.size === 0) expect(built.frames.size).toBe(114);
    const sprite = manifestSprite();
    for (const [id, c] of GENERATED) {
      const m = sprite.clips[id]!;
      expect(m, id).toBeDefined();
      expect({ id, count: m.count, loop: m.loop, prefix: m.frames }).toEqual({ id, count: c.frames, loop: c.loop, prefix: `${id}_` });
      for (let k = 0; k < c.frames; k++) expect(built.frames.has(`${id}_${pad2(k)}`), `${id}_${pad2(k)}`).toBe(true);
    }
    expect(Object.keys(sprite.clips)).toHaveLength(18);
    // the clips handed over: an entry that says how many frames, and every one of them committed; no leftover of the clip it replaced
    for (const id of HANDED) {
      const m = sprite.clips[id]!;
      expect(m, `${id} was handed over: the manifest has its entry`).toBeDefined();
      expect(m.tags.includes('stand-in'), `${id}: a clip drawn anew is no stand-in`).toBe(false);
      const files = readdirSync(join(root, ...ARCHIVE, 'hero')).filter((f) => f.startsWith(m.frames) && /^\d+\.png$/.test(f.slice(m.frames.length)));
      expect(files.sort(), `${id}: its frames are the ones its entry counts`).toEqual(Array.from({ length: m.count }, (_, k) => `${m.frames}${pad2(k)}.png`));
    }
  });

  it('the design is kept: the big eye keeps its size and its colour in every frame of every clip — the death alone puts it out, on purpose', () => {
    // the blows that lunge squash and stretch the body and, with it, the eye a little more than the rest
    const LUNGE: readonly ClipId[] = ['attack1', 'crouchAttack'];
    for (const [id, c] of GENERATED) {
      const eyes = Array.from({ length: c.frames }, (_, k) => eyeOf(frameOf(id, k)));
      const first = eyes[0];
      expect(first, `${id}: its first frame has the eye`).not.toBeNull();
      if (id === 'death') {
        expect(eyes[c.frames - 1], 'the death ends with the eye out').toBeNull();
        continue;
      }
      expect(eyes.every((e) => e !== null), `${id}: the eye is in every frame`).toBe(true);
      const sizes = eyes.map((e) => e!.d);
      const spread = (Math.max(...sizes) - Math.min(...sizes)) / first!.d;
      expect(spread, `${id}: the eye's size varies ${(100 * spread).toFixed(1)} % within the clip`).toBeLessThanOrEqual(LUNGE.includes(id) ? 0.12 : 0.06);
      const drift = Math.max(...eyes.map((e) => Math.hypot(e!.rgb[0] - first!.rgb[0], e!.rgb[1] - first!.rgb[1], e!.rgb[2] - first!.rgb[2])));
      expect(drift, `${id}: the eye's colour drifts ${drift.toFixed(1)} of 255`).toBeLessThanOrEqual(8);
    }
  });

  it('every clip is really in motion — the most different pair of frames is a good part of the picture — and a loop closes without a jump', () => {
    for (const [id, c] of GENERATED) {
      const frames = Array.from({ length: c.frames }, (_, k) => frameOf(id, k));
      let widest = 0;
      for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) widest = Math.max(widest, moved(frames[i]!, frames[j]!));
      expect(widest, `${id}: a clip whose frames hardly differ is a pose, not an animation`).toBeGreaterThan(0.1);
      // no frame is a copy of its neighbour (a hold would be written as the same frame twice; there is none)
      const steps = frames.slice(1).map((f, k) => moved(frames[k]!, f));
      for (const s of steps) expect(s, `${id}: two neighbouring frames are the same`).toBeGreaterThan(0.01);
      if (c.loop) {
        const seam = moved(frames[frames.length - 1]!, frames[0]!);
        expect(seam, `${id}: the loop's last frame to its first is a bigger step than any inside it`).toBeLessThanOrEqual(Math.max(...steps) * 1.4);
      }
    }
  });

  it('the feet are on the pivot in every frame of every clip that stands on the ground, and no frame touches the edge of its canvas', () => {
    const sprite = manifestSprite();
    const [, pivotY] = sprite.pivotPx;
    for (const id of generated(GROUNDED)) {
      for (let k = 0; k < CLIPS[id].frames; k++) {
        const f = frameOf(id, k);
        let low = -1;
        for (let y = f.height - 1; y >= 0 && low < 0; y--) for (let x = 0; x < f.width; x++) if (f.data[(y * f.width + x) * 4 + 3]! >= 96) { low = y; break; }
        expect(low, `${id}_${pad2(k)}: the lowest pixel of the figure`).toBe(pivotY);
      }
    }
    for (const [name, f] of built.frames) {
      let x0 = f.width, y0 = f.height, x1 = -1, y1 = -1;
      for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) if (f.data[(y * f.width + x) * 4 + 3]! >= 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      expect(Math.min(x0, y0, f.width - 1 - x1, f.height - 1 - y1), `${name}: the margin to the edge`).toBeGreaterThanOrEqual(4);
    }
  });

  it('the sword is in the hand in every frame of the four blows: the grip is the hand, the tip is on the blade, and the blade is the length the drawing has', () => {
    const sprite = manifestSprite();
    const ppm = sprite.artPxPerMeter;
    const [pivotX, pivotY] = sprite.pivotPx;
    // the sword of the drawing: from the grip to the tip, in metres
    const rest = sprite.frames['attack1_06']!.anchors;
    const restLength = Math.hypot(rest['weapon_tip']![0] - rest['weapon_grip']![0], rest['weapon_tip']![1] - rest['weapon_grip']![1]);
    expect(restLength).toBeGreaterThan(0.9);
    expect(restLength).toBeLessThan(1.0);
    for (const id of generated(SWORD_CLIPS)) {
      for (let k = 0; k < CLIPS[id].frames; k++) {
        const name = `${id}_${pad2(k)}`;
        const a = sprite.frames[name]!.anchors;
        for (const need of ['hand_r', 'weapon_grip', 'weapon_tip', 'hit_origin', 'vfx_origin']) expect(a[need], `${name}: ${need}`).toBeDefined();
        const grip = a['weapon_grip']!;
        const hand = a['hand_r']!;
        expect(Math.hypot(grip[0] - hand[0], grip[1] - hand[1]), `${name}: the grip is in the hand`).toBeLessThanOrEqual(SWORD_GRIP_TOLERANCE);
        const length = Math.hypot(a['weapon_tip']![0] - grip[0], a['weapon_tip']![1] - grip[1]);
        // the blade turns about its hinge, a hand's breadth from the grip: the tip is never farther from the grip than the drawing's, nor much nearer
        expect(length, `${name}: the sword's reach`).toBeLessThan(restLength * 1.03);
        expect(length, `${name}: the sword's reach`).toBeGreaterThan(restLength * 0.85);
        // and the anchors are on the picture: the tip on an opaque pixel, the grip on an opaque pixel
        const f = frameOf(id, k);
        const onPicture = (m: [number, number], radius: number): boolean => {
          const px = Math.round(pivotX + m[0] * ppm);
          const py = Math.round(pivotY - m[1] * ppm);
          for (let y = py - radius; y <= py + radius; y++) for (let x = px - radius; x <= px + radius; x++) if (x >= 0 && y >= 0 && x < f.width && y < f.height && f.data[(y * f.width + x) * 4 + 3]! >= 128) return true;
          return false;
        };
        expect(onPicture(a['weapon_tip']!, 3), `${name}: the tip is on the blade`).toBe(true);
        expect(onPicture(grip, 2), `${name}: the grip is on the figure`).toBe(true);
      }
    }
    // the cast carries its own two: where the hand is and where the bolt leaves
    for (let k = 0; k < CLIPS.cast.frames; k++) {
      const a = sprite.frames[`cast_${pad2(k)}`]!.anchors;
      expect(a['hand_r'], `cast_${pad2(k)}`).toBeDefined();
      expect(a['projectile_origin'], `cast_${pad2(k)}`).toBeDefined();
    }
  });

  it('every frame of a blow is on the screen for at least one tick: a phase never has more frames than ticks (no frame is skipped at 60 Hz)', () => {
    const sprite = manifestSprite();
    const ticks: Record<string, { startup: number; active: number; recovery: number }> = {
      attack1: SLASH_1, attack2: SLASH_2, aerialAttack: AIR_SLASH, crouchAttack: CROUCH_SLASH,
      // the Spirit Bolt: 6 ticks to gather, the release, 8 to recover (PlayerCombat)
      cast: { startup: 6, active: 1, recovery: 8 },
    };
    for (const [id, t] of Object.entries(ticks)) {
      const phases = sprite.clips[id]!.phases!;
      expect(phases, id).toBeDefined();
      const count = sprite.clips[id]!.count;
      let next = 0;
      for (const phase of ['startup', 'active', 'recovery'] as const) {
        const [lo, hi] = phases[phase]!;
        expect(lo, `${id}.${phase} begins where the last one ended`).toBe(next);
        expect(hi - lo + 1, `${id}.${phase}: frames ≤ ticks (${t[phase]})`).toBeLessThanOrEqual(t[phase]);
        next = hi + 1;
      }
      expect(next, `${id}: the three phases cover every frame`).toBe(count);
    }
  });

  it('each clip lasts what the action it draws lasts in the game', () => {
    const sprite = manifestSprite();
    const seconds = (id: string): number => sprite.clips[id]!.count / sprite.clips[id]!.fps;
    expect(seconds('dash'), 'the dash').toBeCloseTo(DEFAULT_MOVEMENT.dash.duration, 1);
    expect(Math.abs(seconds('dash') - DEFAULT_MOVEMENT.dash.duration)).toBeLessThan(0.02);
    expect(Math.abs(seconds('land') - 10 / 60), 'a hard landing holds 10 ticks').toBeLessThan(0.02);
    expect(Math.abs(seconds('drink') - BOTTLES.rules.channelSeconds), 'drinking is a 0.4 s channel').toBeLessThan(0.02);
    expect(Math.abs(seconds('interact') - MAX_INTERACT_LOCK / 60), 'an interaction holds the hero up to 12 ticks').toBeLessThan(0.02);
    // being hurt: the standard stun is 14 ticks, a boss's 18 — the clip ends inside that and then holds its last frame
    expect(seconds('hurt')).toBeGreaterThan(12 / 60);
    expect(seconds('hurt')).toBeLessThan(18 / 60 + 0.02);
    // the cycles of the gaits are quick (the legs are short): a step in a quarter of a second or less
    expect(seconds('walk') / 2).toBeLessThanOrEqual(0.3);
    expect(seconds('run') / 2).toBeLessThanOrEqual(0.25);
  });

  it('the stand-ins say so and say why: the sheet has no drawing of their action, and the drawing that moves instead is named', () => {
    const sprite = manifestSprite();
    for (const [id, c] of GENERATED) {
      const m = sprite.clips[id]!;
      expect(m.tags.includes('stand-in'), `${id} stand-in tag`).toBe(c.standIn);
      if (c.standIn) expect(m.comment.length, `${id}: why it is a stand-in`).toBeGreaterThan(30);
    }
    expect(built.clips.filter((r) => r.standIn).map((r) => r.clip)).toEqual(['crouch', 'crouchWalk', 'dash', 'attack2', 'aerialAttack', 'crouchAttack', 'death', 'drink', 'interact'].filter((id) => !HANDED.has(id)));
    // the six to validate first, and the four blows carrying the sword
    expect(Object.entries(sprite.clips).filter(([, c]) => c.tags.includes('first')).map(([id]) => id).sort()).toEqual(['attack1', 'dash', 'hurt', 'idle', 'jump', 'walk']);
    expect(Object.entries(sprite.clips).filter(([, c]) => c.tags.includes('sword')).map(([id]) => id).sort()).toEqual([...SWORD_CLIPS].sort());
  });

  it('the committed frames and manifest are what the sheet, the rig and the clips produce: nobody\'s hand is in them', () => {
    const outDir = join(root, ...ARCHIVE, 'hero');
    for (const [name, image] of built.frames) {
      const file = join(outDir, `${name}.png`);
      expect(existsSync(file), `${name}.png is committed`).toBe(true);
      const have = decodePng(readFileSync(file));
      expect({ w: have.width, h: have.height }, name).toEqual({ w: image.width, h: image.height });
      let worst = 0;
      for (let i = 0; i < image.data.length; i++) worst = Math.max(worst, Math.abs(have.data[i]! - image.data[i]!));
      // floating point, run by a different engine, may round a pixel the other way: a step or two, never more
      expect(worst, `${name}.png differs from what the rig produces`).toBeLessThanOrEqual(3);
    }
    expect(read(...ARCHIVE, 'player.pack.json').toString('utf8')).toBe(`${JSON.stringify(built.manifest, null, 2)}\n`);
  });
});
