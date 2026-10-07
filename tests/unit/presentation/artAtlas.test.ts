import { describe, expect, it } from 'vitest';
import { checkSpriteFrames, mergeFrameMeta, parseAtlasData, untrimmedSize, usedFrameNames, type AtlasData, type AtlasPage } from '@/presentation/artAtlas';
import { parseArtPack, type ArtAtlas, type ArtSprite } from '@/presentation/artManifest';
import { Rng } from '@/core/rng';

/**
 * THE ATLAS JSON (docs/ART-PIPELINE-2D.md, part C): what a packer exports next to its image, and how a sprite set is checked against the pages that hold
 * its frames. The fixtures are TECHNICAL — rectangles and names, never art.
 */
const frame = (x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ frame: { x, y, w, h }, ...extra });
const trimmed = (x: number, y: number, w: number, h: number, ox: number, oy: number, sw = 100, sh = 150): Record<string, unknown> =>
  frame(x, y, w, h, { trimmed: true, spriteSourceSize: { x: ox, y: oy, w, h }, sourceSize: { w: sw, h: sh } });

const hash = (): Record<string, unknown> => ({
  frames: {
    idle_00: trimmed(0, 0, 60, 120, 20, 10),
    idle_01: trimmed(62, 0, 62, 118, 19, 12),
    idle_02: frame(126, 0, 100, 150),
  },
  meta: { image: 'hero.png', size: { w: 256, h: 160 }, scale: '1' },
});
const errors = (raw: unknown): string[] => parseAtlasData(raw).issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`);

describe('parseAtlasData: what a packer exports', () => {
  it('reads the "hash" layout, keeping the trim: where the pixels sit in the original frame', () => {
    const { value, issues } = parseAtlasData(hash());
    expect(issues).toEqual([]);
    expect(Object.keys(value!.frames)).toEqual(['idle_00', 'idle_01', 'idle_02']);
    expect(value!.frames['idle_00']).toEqual({ frame: { x: 0, y: 0, w: 60, h: 120 }, spriteSourceSize: { x: 20, y: 10, w: 60, h: 120 }, sourceSize: { w: 100, h: 150 }, trimmed: true });
    expect(value!.frames['idle_02'], 'an untrimmed frame carries no trim').toEqual({ frame: { x: 126, y: 0, w: 100, h: 150 } });
    expect(value!.image).toBe('hero.png');
    expect(value!.size).toEqual({ w: 256, h: 160 });
    expect(untrimmedSize(value!.frames['idle_00']!)).toEqual({ w: 100, h: 150 });
    expect(untrimmedSize(value!.frames['idle_02']!)).toEqual({ w: 100, h: 150 });
  });

  it('reads the "array" layout too (what Aseprite writes by default), taking the extension off the file names', () => {
    const { value, issues } = parseAtlasData({
      frames: [
        { filename: 'idle_00.png', ...frame(0, 0, 10, 10) },
        { filename: 'idle_01', ...frame(10, 0, 10, 10) },
      ],
      meta: { image: 'hero.png' },
    });
    expect(issues).toEqual([]);
    expect(Object.keys(value!.frames)).toEqual(['idle_00', 'idle_01']);
  });

  it('reads the engine\'s own per-frame data from meta.troid: anchors and the height in pixels', () => {
    const raw = hash() as { meta: Record<string, unknown> };
    raw.meta['troid'] = { frames: { idle_00: { heightPx: 140, anchors: { hand_r: [0.4, 0.9], weapon_grip: [0.42, 0.9] } } } };
    const { value, issues } = parseAtlasData(raw);
    expect(issues).toEqual([]);
    expect(value!.meta).toEqual({ idle_00: { heightPx: 140, anchors: { hand_r: [0.4, 0.9], weapon_grip: [0.42, 0.9] } } });
    raw.meta['troid'] = { frames: { idle_00: { anchors: { elbow: [0, 0] } } } };
    expect(errors(raw).join('\n')).toMatch(/unknown anchor "elbow"/);
  });

  it('refuses what would draw wrong: rotation, a stretched texture, a trim that does not fit its original frame', () => {
    const rotated = hash() as { frames: Record<string, Record<string, unknown>> };
    rotated.frames['idle_00']!['rotated'] = true;
    expect(errors(rotated).join('\n')).toMatch(/rotated frames are not supported/);

    const stretched = hash() as { frames: Record<string, Record<string, unknown>> };
    stretched.frames['idle_00']!['spriteSourceSize'] = { x: 20, y: 10, w: 61, h: 120 };
    expect(errors(stretched).join('\n')).toMatch(/would be stretched/);

    const outside = hash() as { frames: Record<string, Record<string, unknown>> };
    outside.frames['idle_00']!['spriteSourceSize'] = { x: 60, y: 10, w: 60, h: 120 };
    expect(errors(outside).join('\n')).toMatch(/reach outside the original 100 × 150 frame/);

    const noSizes = hash() as { frames: Record<string, Record<string, unknown>> };
    delete noSizes.frames['idle_00']!['sourceSize'];
    expect(errors(noSizes).join('\n')).toMatch(/needs "sourceSize" and "spriteSourceSize"/);

    const lie = hash() as { frames: Record<string, Record<string, unknown>> };
    lie.frames['idle_02']!['sourceSize'] = { w: 120, h: 150 };
    expect(errors(lie).join('\n')).toMatch(/differs from the 100 × 150 of an untrimmed frame/);
  });

  it('refuses rectangles that are not whole, positive and inside the image', () => {
    for (const bad of [frame(-1, 0, 10, 10), frame(0, 0, 0, 10), frame(0, 0, 10.5, 10), frame(0, 0, 10, 10, { sourceSize: { w: 0, h: 5 } }), { frame: 'x' }, { nope: 1 }]) {
      expect(errors({ frames: { a: bad } }).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
    const out = { frames: { a: frame(250, 0, 10, 10) }, meta: { size: { w: 256, h: 160 } } };
    expect(errors(out).join('\n')).toMatch(/reaches outside the 256 × 160 image/);
  });

  it('refuses names that cannot be frame names, duplicates, and an atlas with no frame at all', () => {
    expect(errors({ frames: { 'a b': frame(0, 0, 4, 4) } }).join('\n')).toMatch(/not a valid frame name/);
    expect(errors({ frames: { '../a': frame(0, 0, 4, 4) } }).join('\n')).toMatch(/not a valid frame name/);
    expect(errors({ frames: [{ filename: 'a.png', ...frame(0, 0, 4, 4) }, { filename: 'a', ...frame(4, 0, 4, 4) }] }).join('\n')).toMatch(/appears twice/);
    expect(errors({ frames: {} }).join('\n')).toMatch(/holds no frame/);
    expect(errors({ frames: 5 }).join('\n')).toMatch(/must be an object of frames/);
    expect(errors({ frames: { a: frame(0, 0, 4, 4) }, meta: { image: '../x.png' } }).join('\n')).toMatch(/must be a relative file name/);
  });

  it('never throws, whatever it is given', () => {
    const rng = new Rng(7);
    const junk = [null, undefined, 0, 'x', [], {}, { frames: null }, { frames: [null, 1, 'a'] }, { frames: { a: null } }, { frames: { a: [] } }, { frames: { a: { frame: null } } }, { frames: { a: frame(0, 0, 1, 1) }, meta: 5 }, { frames: { a: frame(0, 0, 1, 1) }, meta: { troid: 3 } }];
    for (const j of junk) expect(() => parseAtlasData(j), JSON.stringify(j)).not.toThrow();
    for (let i = 0; i < 200; i++) {
      const o = JSON.parse(JSON.stringify(hash())) as Record<string, unknown>;
      const names = Object.keys(o['frames'] as object);
      const f = (o['frames'] as Record<string, Record<string, unknown>>)[names[rng.int(0, names.length)]!]!;
      const keys = ['frame', 'trimmed', 'rotated', 'sourceSize', 'spriteSourceSize'];
      f[keys[rng.int(0, keys.length)]!] = [null, -1, 1.5, 'x', {}, [], true][rng.int(0, 7)];
      expect(() => parseAtlasData(o)).not.toThrow();
    }
  });
});

// ------------------------------------------------------------------------------------------------ a sprite set against its pages

const spriteOf = (extra: Record<string, unknown> = {}): ArtSprite => {
  const { value, issues } = parseArtPack({
    manifestVersion: 1,
    id: 'p',
    category: 'player',
    status: 'final',
    atlases: [{ id: 'a0', source: 'a0.png', data: 'a0.json', width: 256, height: 160, resolution: 1 }],
    sprites: [{ id: 's', atlases: ['a0'], artPxPerMeter: 100, pivot: [0.5, 1], height: 1.5, clips: { idle: { frames: 'idle_', count: 3 } }, ...extra }],
  });
  if (!value) throw new Error(JSON.stringify(issues));
  return value.sprites[0]!;
};
const atlas = (id: string, w = 256, h = 160): ArtAtlas => ({ id, source: `${id}.png`, data: `${id}.json`, width: w, height: h, resolution: 1 });
const page = (id: string, raw: unknown, w = 256, h = 160): AtlasPage => ({ atlas: atlas(id, w, h), data: parseAtlasData(raw).value as AtlasData });
const messages = (issues: ReturnType<typeof checkSpriteFrames>, level: string): string[] => issues.filter((i) => i.level === level).map((i) => `${i.path}: ${i.message}`);

describe('checkSpriteFrames: the frames a sprite set needs are in its pages', () => {
  it('a complete set has nothing to report', () => {
    const raw = hash() as { meta: Record<string, unknown> };
    raw.meta['image'] = 'a0.png';
    expect(checkSpriteFrames(spriteOf(), [page('a0', raw)])).toEqual([]);
  });

  it('names the missing frames of each clip — a few of them, and how many in all', () => {
    const raw = { frames: { idle_00: frame(0, 0, 10, 10) } };
    const sprite = spriteOf({ clips: { idle: { frames: 'idle_', count: 3 }, walk: { frames: 'walk_', count: 9 } } });
    const issues = checkSpriteFrames(sprite, [page('a0', raw)]);
    expect(messages(issues, 'error')).toEqual([
      'sprites.s.clips.idle: missing frames idle_01, idle_02 (the clip has 3)',
      'sprites.s.clips.walk: missing frames walk_00, walk_01, walk_02, walk_03, … (9 in all) (the clip has 9)',
    ]);
  });

  it('spreads a set over several pages, and refuses a frame that is in two of them', () => {
    const one = { frames: { idle_00: frame(0, 0, 10, 10), idle_01: frame(10, 0, 10, 10) } };
    const two = { frames: { idle_02: frame(0, 0, 10, 10) } };
    expect(messages(checkSpriteFrames(spriteOf(), [page('a0', one), page('a1', two)]), 'error')).toEqual([]);
    const twice = { frames: { idle_02: frame(0, 0, 10, 10), idle_01: frame(10, 0, 10, 10) } };
    expect(messages(checkSpriteFrames(spriteOf(), [page('a0', one), page('a1', twice)]), 'error').join('\n')).toMatch(/frame "idle_01" is in two pages \("a0" and "a1"\)/);
  });

  it('compares the JSON with what the manifest declares: the size of the image, the file it was written for, the frames inside it', () => {
    const raw = hash() as { meta: Record<string, unknown> };
    raw.meta['image'] = 'other.png';
    raw.meta['size'] = { w: 512, h: 160 };
    const issues = checkSpriteFrames(spriteOf(), [page('a0', raw)]);
    expect(messages(issues, 'error').join('\n')).toMatch(/the JSON says the image is 512 × 160 but the manifest declares 256 × 160/);
    expect(messages(issues, 'warn').join('\n')).toMatch(/written for "other.png" but the manifest points at "a0.png"/);
    // frames inside the JSON's own size but outside the image the manifest declares
    const small = checkSpriteFrames(spriteOf(), [page('a0', { frames: { idle_00: frame(0, 0, 10, 10), idle_01: frame(0, 0, 10, 10), idle_02: frame(120, 0, 60, 10) } }, 128, 160)]);
    expect(messages(small, 'error').join('\n')).toMatch(/atlases.a0.frames.idle_02: reaches outside the 128 × 160 image/);
  });

  it('wants ONE original size for the whole set: the pivot is a fraction of it', () => {
    const mixed = { frames: { idle_00: trimmed(0, 0, 10, 10, 0, 0, 100, 150), idle_01: trimmed(10, 0, 10, 10, 0, 0, 100, 151), idle_02: trimmed(20, 0, 10, 10, 0, 0, 100, 150) } };
    expect(messages(checkSpriteFrames(spriteOf(), [page('a0', mixed)]), 'error').join('\n')).toMatch(/do not share one original size — 100 × 150 \(idle_00, idle_02\) vs 100 × 151 \(idle_01\)/);
    const uniform = { frames: { idle_00: trimmed(0, 0, 10, 10, 0, 0), idle_01: trimmed(10, 0, 10, 10, 0, 0), idle_02: trimmed(20, 0, 10, 10, 0, 0) } };
    expect(messages(checkSpriteFrames(spriteOf({ frameSize: [100, 150] }), [page('a0', uniform)]), 'error')).toEqual([]);
    expect(messages(checkSpriteFrames(spriteOf({ frameSize: [128, 128] }), [page('a0', uniform)]), 'error').join('\n')).toMatch(/the manifest says 128 × 128 but the frames are 100 × 150/);
  });

  it('points out data for frames that are not there, frames no clip uses, and a page nothing uses', () => {
    const raw = { frames: { idle_00: frame(0, 0, 10, 10), idle_01: frame(10, 0, 10, 10), idle_02: frame(20, 0, 10, 10), extra_00: frame(30, 0, 10, 10) } };
    const sprite = spriteOf({ frames: { ghost_00: { heightPx: 100 } } });
    const issues = checkSpriteFrames(sprite, [page('a0', raw), page('a1', { frames: { other_00: frame(0, 0, 4, 4) } })]);
    expect(messages(issues, 'warn').join('\n')).toMatch(/data for frames that are in no page: ghost_00/);
    expect(messages(issues, 'warn').join('\n')).toMatch(/atlases.a1: no frame of this page is used by the sprite set/);
    expect(messages(issues, 'info').join('\n')).toMatch(/2 frames are in the atlas but in no clip \(extra_00, other_00\)/);
    // the errors come first
    const levels = issues.map((i) => i.level);
    expect(levels).toEqual([...levels].sort((a, b) => ['error', 'warn', 'info'].indexOf(a) - ['error', 'warn', 'info'].indexOf(b)));
  });
});

describe('what the loader takes from the pages', () => {
  it('lists the frames a set draws, once each, clip by clip — two clips may share frames', () => {
    const clip = (frames: string, count: number) => ({ frames, count, tags: [] });
    expect(usedFrameNames({ clips: { idle: clip('idle_', 2), walk: clip('walk_', 2), fall: clip('idle_', 3) } })).toEqual(['idle_00', 'idle_01', 'walk_00', 'walk_01', 'idle_02']);
    expect(usedFrameNames(spriteOf())).toEqual(['idle_00', 'idle_01', 'idle_02']);
  });

  it('merges per-frame data: what the artist\'s tool wrote, with the pack manifest on top — anchor by anchor', () => {
    const raw = hash() as { meta: Record<string, unknown> };
    raw.meta['troid'] = { frames: { idle_00: { heightPx: 140, anchors: { hand_r: [0.4, 0.9], weapon_grip: [0.42, 0.9] } }, idle_01: { heightPx: 139 } } };
    const sprite = spriteOf({ frames: { idle_00: { anchors: { weapon_grip: [0.5, 1] } }, idle_02: { heightPx: 141 } } });
    const merged = mergeFrameMeta(sprite, [page('a0', raw)]);
    expect(merged['idle_00']).toEqual({ heightPx: 140, anchors: { hand_r: [0.4, 0.9], weapon_grip: [0.5, 1] } });
    expect(merged['idle_01']).toEqual({ heightPx: 139 });
    expect(merged['idle_02']).toEqual({ heightPx: 141 });
  });

  it('measures the height in pixels of the master image: a smaller variant scales it, the anchors (metres) stay', () => {
    const raw = hash() as { meta: Record<string, unknown> };
    raw.meta['troid'] = { frames: { idle_00: { heightPx: 140, anchors: { hand_r: [0.4, 0.9] } } } };
    const sprite = spriteOf({ frames: { idle_01: { heightPx: 138 } } });
    const half = mergeFrameMeta(sprite, [page('a0', raw)], 0.5);
    expect(half['idle_00']).toEqual({ heightPx: 70, anchors: { hand_r: [0.4, 0.9] } });
    expect(half['idle_01']).toEqual({ heightPx: 69 });
    // the sources are not touched: the same call at full resolution gives the master's numbers again
    expect(mergeFrameMeta(sprite, [page('a0', raw)])['idle_00']!.heightPx).toBe(140);
  });
});
