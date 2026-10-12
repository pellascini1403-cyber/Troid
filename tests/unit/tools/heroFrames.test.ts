import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLAYER_VISUAL } from '@/content/visuals';
import { parseArtPack } from '@/presentation/artManifest';
import { buildHeroFrames, sha256, type HeroSpec } from '../../../tools/assets/heroFrames';
import { decodePng, type RgbaImage } from '../../../tools/assets/png';

/**
 * THE PROTAGONIST'S FRAMES FROM THE USER'S SHEET (docs/ART-PIPELINE-2D.md part L): the spec says which rectangle of the sheet is which pose, and the frames and the
 * manifest follow from it. First on a sheet made by hand (what the builder promises), then on the real thing (the committed frames are what the user's sheet and the
 * spec produce — nobody drew them, nobody touched them).
 */
const W = 160;
const H = 120;
function sheet(): RgbaImage {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([254, 254, 254, 255], i * 4);
  const disc = (cx: number, cy: number, r: number): void => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) data.set([16, 22, 36, 255], (y * W + x) * 4);
  };
  disc(40, 60, 22); // pose "a"
  disc(110, 60, 18); // pose "b"
  return { width: W, height: H, data };
}

const SPEC: HeroSpec = {
  sheet: 'x.png',
  sheetSha256: 'x',
  out: '../hero',
  canvas: [120, 100],
  pivotPx: [60, 90],
  artPxPerMeter: 100,
  poses: {
    a: { box: [0, 0, 79, 119], feet: [40, 82] },
    b: { box: [80, 0, 159, 119], feet: [49, 78], flip: true }, // disc at (30, 60) of the box, mirrored → (49, 60)
  },
  frames: [
    { name: 'idle_00', pose: 'a' },
    { name: 'attack1_00', pose: 'b', scale: 1.5 },
    { name: 'crouch_00', pose: 'a', standIn: 'the idle' },
  ],
  anchors: { b: { hand_r: [59, 60], weapon_grip: [59, 60], weapon_tip: [67, 40] } },
};

describe('buildHeroFrames', () => {
  const r = buildHeroFrames(SPEC, sheet());

  it('puts every frame on the one canvas of the set, the feet of each pose on the pivot', () => {
    expect([...r.frames.keys()]).toEqual(['idle_00', 'attack1_00', 'crouch_00']);
    for (const f of r.frames.values()) expect({ w: f.width, h: f.height }).toEqual({ w: 120, h: 100 });
    // pose a's feet (40, 82) are at the pivot (60, 90): its disc centre (40, 60) lands 20 px right of where it was and 8 px lower
    const idle = r.frames.get('idle_00')!;
    expect(idle.data[(68 * 120 + 60) * 4 + 3]).toBe(255); // (40,60) → (60,68)
    expect(idle.data[(68 * 120 + 5) * 4 + 3]).toBe(0);
  });

  it('a stand-in shows the very pixels of the pose it reuses', () => {
    expect(Buffer.compare(Buffer.from(r.frames.get('crouch_00')!.data), Buffer.from(r.frames.get('idle_00')!.data))).toBe(0);
  });

  it('writes the manifest the engine reads: the scale, the pivot in pixels, one frame per clip, the stand-ins tagged and told why', () => {
    const m = r.manifest as { status: string; sprites: Array<Record<string, unknown>> };
    expect(m.status).toBe('provisional');
    const hero = m.sprites[0]!;
    expect(hero).toMatchObject({ id: 'hero', artPxPerMeter: 100, height: 1.7, facing: 'right', frameSize: [120, 100], pivotPx: [60, 90], missingClips: 'placeholder' });
    const clips = hero['clips'] as Record<string, { frames: string; count: number; tags: string[]; comment?: string }>;
    expect(clips['idle']).toEqual({ frames: 'idle_', count: 1, tags: ['first'] });
    expect(clips['attack1']).toEqual({ frames: 'attack1_', count: 1, tags: ['first', 'sword'] });
    expect(clips['crouch']).toEqual({ frames: 'crouch_', count: 1, tags: ['stand-in'], comment: 'reuses the idle' });
  });

  it('puts the anchors in METRES from the feet, after the frame\'s own scale (+x forward, +y up), mirrored poses measured as they are placed', () => {
    const hero = (r.manifest as { sprites: Array<Record<string, unknown>> }).sprites[0]!;
    const frames = hero['frames'] as Record<string, { scale?: number; anchors?: Record<string, [number, number]> }>;
    // pose b: feet (49, 78) once mirrored, 100 px per metre, scale 1.5: the grip at (59, 60) is 10 px forward and 18 px up → 0.15 m, 0.27 m
    expect(frames['attack1_00']).toEqual({ scale: 1.5, anchors: { hand_r: [0.15, 0.27], weapon_grip: [0.15, 0.27], weapon_tip: [0.27, 0.57] } });
    expect(frames['idle_00']).toBeUndefined(); // nothing to say: no scale, no anchors
  });

  it('the manifest it writes is one the engine accepts', () => {
    // read the way the packer reads a source manifest: the atlases are what the packer writes
    const sprites = (r.manifest['sprites'] as Array<Record<string, unknown>>).map((sp) => ({ ...sp, atlases: [] }));
    const { value, issues } = parseArtPack({ ...r.manifest, status: 'awaiting-art', atlases: [], sprites });
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(value!.sprites[0]!.frames?.['attack1_00']?.scale).toBe(1.5);
  });

  it('mirrors a pose drawn facing left, and nothing else', () => {
    const plain = buildHeroFrames({ ...SPEC, poses: { ...SPEC.poses, b: { ...SPEC.poses.b!, flip: false } } }, sheet()).frames.get('attack1_00')!;
    const mirrored = r.frames.get('attack1_00')!;
    expect(Buffer.compare(Buffer.from(plain.data), Buffer.from(mirrored.data))).not.toBe(0);
    expect(mirrored.data.reduce((n, _, i) => n + (i % 4 === 3 && mirrored.data[i]! > 0 ? 1 : 0), 0)).toBe(plain.data.reduce((n, _, i) => n + (i % 4 === 3 && plain.data[i]! > 0 ? 1 : 0), 0));
  });

  it('refuses what would be wrong rather than cutting it: an unknown pose, a pose that does not fit the canvas, a figure at the edge', () => {
    expect(() => buildHeroFrames({ ...SPEC, frames: [{ name: 'idle_00', pose: 'nope' }] }, sheet())).toThrow(/no pose "nope"/);
    expect(() => buildHeroFrames({ ...SPEC, canvas: [120, 60] }, sheet())).toThrow(/does not fit the 120×60 canvas/);
    expect(() => buildHeroFrames({ ...SPEC, pivotPx: [20, 90] }, sheet())).toThrow(/comes within \d+ px of the canvas edge|does not fit/);
    expect(() => buildHeroFrames({ ...SPEC, frames: [{ name: 'idle', pose: 'a' }] }, sheet())).toThrow(/is not <clip>_NN/);
    expect(() => buildHeroFrames({ ...SPEC, poses: { a: { box: [0, 0, 20, 20], feet: [5, 5] } }, frames: [{ name: 'idle_00', pose: 'a' }] }, sheet())).toThrow(/nothing of a figure/);
  });
});

describe('the protagonist of the repository', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const dir = join(root, 'art', 'player', 'source');
  const spec = JSON.parse(readFileSync(join(dir, 'hero.poses.json'), 'utf8')) as HeroSpec;
  const bytes = readFileSync(join(dir, spec.sheet));
  const built = buildHeroFrames(spec, decodePng(bytes));

  it('starts from the user\'s sheet, unchanged: its hash is the one the spec was made for', () => {
    expect(sha256(bytes)).toBe(spec.sheetSha256);
  });

  it('has the frames and the manifest the sheet and the spec produce, pixel for pixel — nobody drew them or touched them', () => {
    for (const [name, image] of built.frames) {
      const have = decodePng(readFileSync(join(root, 'art', 'player', 'hero', `${name}.png`)));
      expect({ name, w: have.width, h: have.height }).toEqual({ name, w: image.width, h: image.height });
      expect(Buffer.compare(Buffer.from(have.data), Buffer.from(image.data)), `${name} differs from what the sheet produces`).toBe(0);
    }
    expect(readFileSync(join(root, 'art', 'player', 'player.pack.json'), 'utf8')).toBe(`${JSON.stringify(built.manifest, null, 2)}\n`);
  });

  it('draws every one of the fifteen clips the game asks of it, and is honest about which of them have art of their own', () => {
    const hero = (built.manifest as { sprites: Array<{ clips: Record<string, { tags: string[] }> }> }).sprites[0]!;
    for (const s of PLAYER_VISUAL.required) expect(Object.keys(hero.clips).includes(s === 'attackAir' ? 'aerialAttack' : s === 'attackCrouch' ? 'crouchAttack' : s), s).toBe(true);
    const own = Object.entries(hero.clips).filter(([, c]) => !c.tags.includes('stand-in')).map(([s]) => s).sort();
    expect(own).toEqual(['attack1', 'cast', 'fall', 'hurt', 'idle', 'jump', 'land', 'walk']); // `land` is one more than the fifteen
  });

  it('keeps every figure clear of the edges of the canvas, and the sword in the hand in every blow', () => {
    const hero = (built.manifest as { sprites: Array<{ frames: Record<string, { anchors?: Record<string, [number, number]> }> }> }).sprites[0]!;
    for (const blow of ['attack1_00', 'attack2_00', 'aerialAttack_00', 'crouchAttack_00']) {
      const a = hero.frames[blow]!.anchors!;
      expect(Math.hypot(a['weapon_grip']![0] - a['hand_r']![0], a['weapon_grip']![1] - a['hand_r']![1])).toBeLessThanOrEqual(0.04);
      expect(a['weapon_tip']![0]).toBeGreaterThan(a['weapon_grip']![0]); // the blade points forward
    }
  });
});
