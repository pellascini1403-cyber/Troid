import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtLibrary, type ArtImage } from '@/assets/artLibrary';
import type { AtlasFrameJson } from '@/presentation/artAtlas';
import { parseArtIndex, parseArtPack } from '@/presentation/artManifest';
import { Rng } from '@/core/rng';
import { buildArt, formatReport, GENERATED_MARKER } from '../../../tools/assets/build';
import { decodePng, encodePng, type RgbaImage } from '../../../tools/assets/png';
import { rawPng } from '../../helpers/png';

/**
 * THE ART BUILD, end to end (docs/ART-PIPELINE-2D.md, part C): a folder of PNGs and a manifest go in; the folder the game fetches comes out; and the game's
 * own library, reading that folder, draws every frame EXACTLY as it was handed in. The frames are noise on a transparent canvas: technical fixtures.
 */
let root: string;
let src: string;
let out: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'troid-art-'));
  src = join(root, 'art');
  out = join(root, 'public', 'art');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const W = 48;
const H = 64;
function frame(seed: number, box: { x: number; y: number; w: number; h: number }): RgbaImage {
  const rng = new Rng(seed);
  const data = new Uint8Array(W * H * 4);
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) data.set([rng.int(0, 256), rng.int(0, 256), rng.int(0, 256), [255, 255, 200, 1][rng.int(0, 4)]!], (y * W + x) * 4);
  }
  return { width: W, height: H, data };
}
const put = (file: string, data: Buffer | string): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};
const json = (v: unknown): string => JSON.stringify(v, null, 2);

const sprite = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'hero',
  artPxPerMeter: 40,
  pivot: [0.5, 1],
  height: 1.6,
  clips: { idle: { frames: 'idle_', count: 3, fps: 8 }, walk: { frames: 'walk_', count: 2, fps: 10 } },
  ...over,
});
const manifest = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ manifestVersion: 1, id: 'hero', category: 'player', status: 'provisional', atlases: [], sprites: [sprite()], ...over });
const index = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'hero', category: 'player', load: 'boot', manifest: 'hero/hero.pack.json', ...over });

/** Writes a source pack: an index, a manifest and one PNG per frame of the standard clips; returns the frames by name. */
function writeSource(opts: { manifest?: Record<string, unknown>; index?: Record<string, unknown>[]; skip?: string[]; sameSize?: boolean } = {}): Map<string, RgbaImage> {
  put(join(src, 'index.json'), json({ manifestVersion: 1, packs: opts.index ?? [index()] }));
  put(join(src, 'hero', 'hero.pack.json'), json(opts.manifest ?? manifest()));
  const frames = new Map<string, RgbaImage>();
  const specs: Array<[string, number, { x: number; y: number; w: number; h: number }]> = [
    ['idle_00', 1, { x: 10, y: 8, w: 20, h: 50 }],
    ['idle_01', 2, { x: 11, y: 9, w: 20, h: 49 }],
    ['idle_02', 1, { x: 10, y: 8, w: 20, h: 50 }], // the first pose again: a held frame
    ['walk_00', 3, { x: 6, y: 8, w: 30, h: 50 }],
    ['walk_01', 4, { x: 8, y: 8, w: 28, h: 50 }],
  ];
  for (const [name, seed, box] of specs) {
    const img = frame(seed, box);
    frames.set(name, img);
    if (!opts.skip?.includes(name)) put(join(src, 'hero', 'hero', `${name}.png`), encodePng(img));
  }
  return frames;
}
const build = (write = true, pack = {}) => buildArt({ srcDir: src, outDir: out, write, pack });
const errors = (r: ReturnType<typeof build>): string[] => r.issues.filter((i) => i.level === 'error').map((i) => `${i.path}: ${i.message}`);

describe('building art', () => {
  it('has nothing to do without art/index.json: it writes nothing and leaves a folder that is not its own alone', () => {
    const r = build();
    expect(r.ok).toBe(true);
    expect(r.packs).toEqual([]);
    expect(existsSync(out)).toBe(false);
    put(join(out, 'index.json'), json({ manifestVersion: 1, packs: [] })); // somebody else's (art put by hand is checked too: this one is valid)
    expect(build().ok).toBe(true);
    expect(existsSync(join(out, 'index.json'))).toBe(true);
    expect(formatReport(build(), true)).toMatch(/nothing to build/);
    put(join(out, 'index.json'), '{}');
    expect(build().ok, 'a hand-made index that is not valid is reported, and still not touched').toBe(false);
    expect(readFileSync(join(out, 'index.json'), 'utf8')).toBe('{}');
  });

  it('packs the frames of each sprite set into pages and writes the manifest the game reads — valid by the game\'s own reader', () => {
    writeSource();
    const r = build();
    expect(errors(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.written).toEqual(expect.arrayContaining(['hero/hero_0.png', 'hero/hero_0.json', 'hero/hero.pack.json', 'index.json', 'README.txt']));
    const pack = parseArtPack(JSON.parse(readFileSync(join(out, 'hero', 'hero.pack.json'), 'utf8')) as unknown);
    expect(pack.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(pack.value!.atlases).toEqual([expect.objectContaining({ id: 'hero_0', source: 'hero_0.png', data: 'hero_0.json', resolution: 1 })]);
    expect(pack.value!.sprites[0]!.atlases).toEqual(['hero_0']);
    expect(parseArtIndex(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')) as unknown).value!.packs.map((p) => [p.id, p.load, p.manifest])).toEqual([['hero', 'boot', 'hero/hero.pack.json']]);
    expect(readFileSync(join(out, 'README.txt'), 'utf8').startsWith(GENERATED_MARKER)).toBe(true);
    expect(r.packs[0]).toMatchObject({ id: 'hero', shipped: true, how: 'packed' });
    expect(r.packs[0]!.sprites[0]).toMatchObject({ id: 'hero', frames: 5, stored: 4, pages: 1 });
  });

  it('what the game draws is exactly what was handed in: through the game\'s own library, every frame, every pixel', async () => {
    const frames = writeSource();
    expect(build().ok).toBe(true);

    type Tex = { name: string; url: string; json: AtlasFrameJson };
    const toPath = (url: string): string => join(out, ...url.slice('http://art.test/art/'.length).split('/'));
    const lib = new ArtLibrary<{ url: string }, Tex>({
      indexUrl: 'http://art.test/art/index.json',
      io: {
        json: async (url) => JSON.parse(readFileSync(toPath(url), 'utf8')) as unknown,
        image: async (url): Promise<ArtImage<{ url: string }>> => {
          const img = decodePng(readFileSync(toPath(url)));
          return { source: { url }, width: img.width, height: img.height, dispose: () => undefined };
        },
      },
      textures: { make: (source, fr) => new Map(Object.entries(fr).map(([name, json]) => [name, { name, url: source.url, json }])), destroy: () => undefined },
      drawnPxPerMetre: () => 40,
      note: (m) => {
        throw new Error(`the library complained: ${m}`);
      },
    });
    const set = await lib.acquire('hero', 'hero');
    expect(set).not.toBeNull();
    expect([...set!.textures.keys()].sort()).toEqual([...frames.keys()].sort());
    for (const [name, original] of frames) {
      const t = set!.textures.get(name)!;
      const page = decodePng(readFileSync(toPath(t.url)));
      const f = t.json;
      const size = f.sourceSize ?? { w: f.frame.w, h: f.frame.h };
      const off = f.spriteSourceSize ?? { x: 0, y: 0, w: f.frame.w, h: f.frame.h };
      const rebuilt = new Uint8Array(size.w * size.h * 4);
      for (let y = 0; y < f.frame.h; y++) rebuilt.set(page.data.subarray(((f.frame.y + y) * page.width + f.frame.x) * 4, ((f.frame.y + y) * page.width + f.frame.x + f.frame.w) * 4), ((off.y + y) * size.w + off.x) * 4);
      expect([size.w, size.h], name).toEqual([W, H]);
      expect(Buffer.from(rebuilt).equals(Buffer.from(original.data)), `${name} is bit for bit what was handed in`).toBe(true);
    }
  });

  it('writes the same bytes every time it runs (nothing changes in version control by rebuilding)', () => {
    writeSource();
    const first = build();
    const files = (): Record<string, string> => Object.fromEntries(first.written.map((rel) => [rel, readFileSync(join(out, ...rel.split('/'))).toString('base64')]));
    const a = files();
    build();
    expect(files()).toEqual(a);
  });

  it('stores a held pose once and says so', () => {
    writeSource();
    const r = build(false);
    expect(r.packs[0]!.sprites[0]).toMatchObject({ frames: 5, stored: 4 });
    expect(formatReport(r, false)).toMatch(/hero: 5 frames, 4 stored \(1 repeated\), 1 page\(s\)/);
  });

  it('check mode writes nothing, however good the art', () => {
    writeSource();
    const r = build(false);
    expect(r.ok).toBe(true);
    expect(r.written).toEqual([]);
    expect(existsSync(out)).toBe(false);
    expect(formatReport(r, false)).toMatch(/would write 1 pack\(s\)/);
  });

  it('refuses a missing frame, naming the file and the clip — and writes nothing at all', () => {
    writeSource({ skip: ['walk_01'] });
    const r = build();
    expect(r.ok).toBe(false);
    expect(errors(r).join('\n')).toMatch(/hero sprites\.hero\.clips\.walk: missing frame file hero\/walk_01\.png/);
    expect(existsSync(out)).toBe(false);
    expect(formatReport(r, true)).toMatch(/art: FAILED — nothing was written/);
  });

  it('refuses frames that are not drawn on one canvas size: the pivot is a fraction of it', () => {
    writeSource();
    put(join(src, 'hero', 'hero', 'walk_01.png'), encodePng({ width: 50, height: 64, data: new Uint8Array(50 * 64 * 4).fill(255) }));
    const r = build();
    expect(errors(r).join('\n')).toMatch(/its frames are not all the same size \(48 × 64, 50 × 64\)/);
  });

  it('warns about a frame file no clip uses (it is not packed) and about a colour profile the build does not carry over', () => {
    writeSource();
    put(join(src, 'hero', 'hero', 'spare_00.png'), encodePng(frame(9, { x: 1, y: 1, w: 4, h: 4 })));
    put(join(src, 'hero', 'hero', 'walk_01.png'), rawPng({ width: W, height: H, bitDepth: 8, colorType: 6, samples: Array.from({ length: H }, () => new Array<number>(W * 4).fill(40)), extra: [{ type: 'iCCP', body: [80, 0, 0] }] }));
    const r = build();
    expect(r.ok).toBe(true);
    const all = r.issues.map((i) => `${i.level} ${i.path}: ${i.message}`).join('\n');
    expect(all).toMatch(/warn hero sprites\.hero: 1 frame file\(s\) no clip uses \(spare_00\.png\)/);
    expect(all).toMatch(/warn hero hero\/walk_01\.png: carries an embedded colour profile/);
  });

  it('says when a source is 16 bits per channel (its values are rounded to 8: the GPU has 8)', () => {
    writeSource();
    put(join(src, 'hero', 'hero', 'walk_01.png'), rawPng({ width: W, height: H, bitDepth: 16, colorType: 6, samples: Array.from({ length: H }, () => new Array<number>(W * 4).fill(0x8080)) }));
    const r = build();
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => `${i.level} ${i.message}`)).toContain('info is 16 bits per channel: the GPU has 8, so its values were rounded to 8');
  });

  it('refuses a damaged PNG, naming the file', () => {
    writeSource();
    put(join(src, 'hero', 'hero', 'idle_01.png'), Buffer.from('this is not a picture'));
    expect(errors(build()).join('\n')).toMatch(/hero hero\/idle_01\.png: not a PNG file/);
  });

  it('refuses two sprite sets that name a frame the same, unless they are one set', () => {
    const second = sprite({ id: 'twin' });
    writeSource({ manifest: manifest({ sprites: [sprite(), second] }) });
    expect(errors(build()).join('\n')).toMatch(/frame name "idle_00" is also used by sprite set "hero"/);
  });

  it('does not ship art that is awaited: it is checked, reported, and the game fetches nothing', () => {
    writeSource({ manifest: manifest({ status: 'awaiting-art' }), skip: ['idle_00', 'idle_01', 'idle_02', 'walk_00', 'walk_01'] });
    const r = build();
    expect(r.ok).toBe(true);
    expect(r.packs[0]).toMatchObject({ status: 'awaiting-art', shipped: false, how: 'awaiting' });
    expect(existsSync(out), 'no art, no folder: the game asks for nothing').toBe(false);
    expect(formatReport(r, true)).toMatch(/awaiting art — checked, NOT shipped/);
  });

  it('copies art the artist packed with their own tool exactly as it is, after the same checks', () => {
    // a 2-frame atlas written "by another tool": the build must not re-encode it
    const image = encodePng({ width: 128, height: 64, data: new Uint8Array(128 * 64 * 4).fill(90) });
    const atlasJson = json({ frames: { idle_00: { frame: { x: 0, y: 0, w: 64, h: 64 } }, idle_01: { frame: { x: 64, y: 0, w: 64, h: 64 } } }, meta: { image: 'sheet.png', size: { w: 128, h: 64 } } });
    put(join(src, 'index.json'), json({ manifestVersion: 1, packs: [index()] }));
    put(join(src, 'hero', 'sheet.png'), image);
    put(join(src, 'hero', 'sheet.json'), atlasJson);
    put(
      join(src, 'hero', 'hero.pack.json'),
      json(manifest({ atlases: [{ id: 'sheet', source: 'sheet.png', data: 'sheet.json', width: 128, height: 64, resolution: 1 }], sprites: [sprite({ atlases: ['sheet'], clips: { idle: { frames: 'idle_', count: 2 } } })] })),
    );
    const r = build();
    expect(errors(r)).toEqual([]);
    expect(r.packs[0]).toMatchObject({ how: 'copied', shipped: true });
    expect(readFileSync(join(out, 'hero', 'sheet.png')).equals(image)).toBe(true);
    expect(readFileSync(join(out, 'hero', 'sheet.json'), 'utf8')).toBe(atlasJson);
    // and a copied pack whose atlas does not hold the frames its clips name is refused
    put(join(src, 'hero', 'hero.pack.json'), json(manifest({ atlases: [{ id: 'sheet', source: 'sheet.png', data: 'sheet.json', width: 128, height: 64, resolution: 1 }], sprites: [sprite({ atlases: ['sheet'] })] })));
    expect(errors(build(false)).join('\n')).toMatch(/missing frames? (idle_02|walk_00)/);
  });

  it('cuts a spritesheet by the grid the manifest states — lossless, and the grid does not ship', async () => {
    const frames = writeSource({ skip: ['walk_00', 'walk_01'], manifest: manifest({ sprites: [sprite({ sheets: [{ file: 'walk.png', prefix: 'walk_', frameSize: [W, H], columns: 2, count: 2 }] })] }) });
    // walk.png: the two walk frames side by side (a sheet drawn by hand elsewhere)
    const a = frames.get('walk_00')!;
    const b = frames.get('walk_01')!;
    const data = new Uint8Array(2 * W * 4 * H);
    for (let y = 0; y < H; y++) {
      data.set(a.data.subarray(y * W * 4, (y + 1) * W * 4), (y * 2 * W) * 4);
      data.set(b.data.subarray(y * W * 4, (y + 1) * W * 4), (y * 2 * W + W) * 4);
    }
    put(join(src, 'hero', 'hero', 'walk.png'), encodePng({ width: 2 * W, height: H, data }));
    const r = build();
    expect(errors(r)).toEqual([]);
    expect(r.ok).toBe(true);
    const pack = JSON.parse(readFileSync(join(out, 'hero', 'hero.pack.json'), 'utf8')) as { sprites: Array<Record<string, unknown>> };
    expect(pack.sprites[0]!['sheets'], 'how the frames were cut is not something the game needs').toBeUndefined();
    // every frame, the two from the sheet included, comes back out of the pages exactly as it was drawn
    const json = JSON.parse(readFileSync(join(out, 'hero', 'hero_0.json'), 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; spriteSourceSize?: { x: number; y: number }; sourceSize?: { w: number; h: number } }> };
    const page = decodePng(readFileSync(join(out, 'hero', 'hero_0.png')));
    for (const [name, original] of frames) {
      const f = json.frames[name]!;
      const rebuilt = new Uint8Array(W * H * 4);
      const off = f.spriteSourceSize ?? { x: 0, y: 0 };
      for (let y = 0; y < f.frame.h; y++) rebuilt.set(page.data.subarray(((f.frame.y + y) * page.width + f.frame.x) * 4, ((f.frame.y + y) * page.width + f.frame.x + f.frame.w) * 4), ((off.y + y) * W + off.x) * 4);
      expect(Buffer.from(rebuilt).equals(Buffer.from(original.data)), name).toBe(true);
    }
  });

  it('refuses a sheet that is not the size of its grid, a frame that is both a file and a cell, and a sheet that is not there', () => {
    writeSource({ manifest: manifest({ sprites: [sprite({ sheets: [{ file: 'walk.png', prefix: 'walk_', frameSize: [W, H], columns: 2, count: 2 }] })] }) });
    expect(errors(build(false)).join('\n')).toMatch(/hero sprites\.hero\.sheets\[0\]: the sheet hero\/walk\.png is not there/);
    put(join(src, 'hero', 'hero', 'walk.png'), encodePng({ width: 2 * W + 1, height: H, data: new Uint8Array((2 * W + 1) * H * 4).fill(9) }));
    expect(errors(build(false)).join('\n')).toMatch(/walk\.png is 97 × 64 but 2 column\(s\) of 48 × 64 and 2 frame\(s\) make 96 × 64: nothing is guessed/);
    put(join(src, 'hero', 'hero', 'walk.png'), encodePng({ width: 2 * W, height: H, data: new Uint8Array(2 * W * H * 4).fill(9) }));
    expect(errors(build(false)).join('\n')).toMatch(/frame "walk_00" is both a file \(hero\/walk_00\.png\) and a cell of sheet walk\.png: say it once/);
  });

  it('refuses to write into a folder it did not make, and rewrites one it did', () => {
    writeSource();
    put(join(out, 'index.json'), '{"mine":true}');
    const refused = build();
    expect(refused.ok).toBe(false);
    expect(errors(refused).join('\n')).toMatch(/was not generated by this tool/);
    expect(readFileSync(join(out, 'index.json'), 'utf8')).toBe('{"mine":true}');
    rmSync(out, { recursive: true, force: true });
    expect(build().ok).toBe(true);
    put(join(out, 'stale.png'), 'old'); // something an earlier build left
    expect(build().ok).toBe(true);
    expect(readdirSync(out).sort()).toEqual(['README.txt', 'hero', 'index.json']);
  });

  it('removes what it generated when the art leaves art/ — and ships nothing', () => {
    writeSource();
    expect(build().ok).toBe(true);
    rmSync(src, { recursive: true, force: true });
    const r = build();
    expect(r.ok).toBe(true);
    expect(existsSync(out)).toBe(false);
  });

  it('reports a broken index or a pack that is not in its folder instead of falling over', () => {
    put(join(src, 'index.json'), '{ not json');
    expect(errors(build()).join('\n')).toMatch(/index\.json: cannot be read as JSON/);
    put(join(src, 'index.json'), json({ manifestVersion: 1, packs: [index()] }));
    expect(errors(build()).join('\n')).toMatch(/hero: its manifest hero\/hero\.pack\.json is not there/);
    put(join(src, 'hero', 'hero.pack.json'), '[1,2]');
    expect(errors(build()).join('\n')).toMatch(/must be an object/);
  });

  it('packs a set that does not fit one page into several, and each page is a PNG within the limit', () => {
    writeSource();
    const r = build(true, { maxSide: 64 });
    expect(errors(r)).toEqual([]);
    expect(r.packs[0]!.sprites[0]!.pages).toBeGreaterThan(1);
    for (const rel of r.written.filter((f) => f.endsWith('.png'))) {
      const page = decodePng(readFileSync(join(out, ...rel.split('/'))));
      expect(Math.max(page.width, page.height)).toBeLessThanOrEqual(64);
    }
  });
});

describe('scenery: one set of pages for the whole pack, and the scenes that place its pieces', () => {
  const piece = (id: string, seed: number, w: number, h: number): RgbaImage => {
    const rng = new Rng(seed);
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([rng.int(0, 256), rng.int(0, 256), rng.int(0, 256), 255], i * 4);
    void id;
    return { width: w, height: h, data };
  };
  const SIZES: Record<string, [number, number]> = { arch: [60, 90], fern: [30, 24], rock: [40, 20] };
  const envSprite = (id: string): Record<string, unknown> => ({
    id,
    artPxPerMeter: 48,
    pivot: [0.5, 1],
    height: SIZES[id]![1] / 48,
    tags: ['role:decor', 'layer:backdrop-near'],
    clips: { idle: { frames: `${id}_`, count: 1 } },
  });
  /** A pack of scenery: three pieces, a scene that places two of them. */
  function writeScenery(over: { manifest?: Record<string, unknown>; scene?: unknown; skipScene?: boolean } = {}): Map<string, RgbaImage> {
    put(join(src, 'index.json'), json({ manifestVersion: 1, packs: [{ id: 'ruins', category: 'environment', load: 'zone', zones: ['r1_gate'], manifest: 'ruins/ruins.pack.json' }] }));
    put(join(src, 'ruins', 'ruins.pack.json'), json({ manifestVersion: 1, id: 'ruins', category: 'environment', status: 'provisional', atlasMode: 'shared', scenes: { r1_gate: 'scenes/r1_gate.json' }, atlases: [], sprites: ['arch', 'fern', 'rock'].map(envSprite), ...over.manifest }));
    const frames = new Map<string, RgbaImage>();
    let seed = 1;
    for (const [id, [w, h]] of Object.entries(SIZES)) {
      const img = piece(id, seed++, w, h);
      frames.set(`${id}_00`, img);
      put(join(src, 'ruins', id, `${id}_00.png`), encodePng(img));
    }
    if (!over.skipScene) {
      put(join(src, 'ruins', 'scenes', 'r1_gate.json'), json(over.scene ?? { sceneVersion: 1, room: 'r1_gate', layers: { backdropNear: [{ sprite: 'arch', x: 10, y: -1 }, { sprite: 'fern', x: 12, y: 0, flip: true }] } }));
    }
    return frames;
  }

  it('packs the frames of every set onto the SAME pages, and each set lists the pages its own frames are on', () => {
    const frames = writeScenery();
    const r = build();
    expect(errors(r)).toEqual([]);
    expect(r.ok).toBe(true);
    const pack = parseArtPack(JSON.parse(readFileSync(join(out, 'ruins', 'ruins.pack.json'), 'utf8')) as unknown).value!;
    // one page for all three pieces, named after the PACK, not after a sprite
    expect(pack.atlases.map((a) => a.id)).toEqual(['ruins_0']);
    expect(pack.sprites.map((s) => s.atlases)).toEqual([['ruins_0'], ['ruins_0'], ['ruins_0']]);
    expect(r.written).toEqual(expect.arrayContaining(['ruins/ruins_0.png', 'ruins/ruins_0.json']));
    expect(r.written.filter((f) => f.endsWith('.png'))).toEqual(['ruins/ruins_0.png']);
    // and the frames are in it, bit for bit
    const page = decodePng(readFileSync(join(out, 'ruins', 'ruins_0.png')));
    const atlas = JSON.parse(readFileSync(join(out, 'ruins', 'ruins_0.json'), 'utf8')) as { frames: Record<string, AtlasFrameJson> };
    for (const [name, original] of frames) {
      const f = atlas.frames[name]!;
      for (let y = 0; y < f.frame.h; y++) {
        const got = page.data.subarray(((f.frame.y + y) * page.width + f.frame.x) * 4, ((f.frame.y + y) * page.width + f.frame.x + f.frame.w) * 4);
        const want = original.data.subarray(y * original.width * 4, (y + 1) * original.width * 4);
        expect(Buffer.from(got).equals(Buffer.from(want)), `${name} row ${y}`).toBe(true);
      }
    }
  });

  it('without the mode, each set keeps its own pages (what a character wants)', () => {
    writeScenery({ manifest: { atlasMode: 'sprite' } });
    const r = build();
    expect(errors(r)).toEqual([]);
    expect(r.written.filter((f) => f.endsWith('.png')).sort()).toEqual(['ruins/arch_0.png', 'ruins/fern_0.png', 'ruins/rock_0.png']);
  });

  it('ships the scenes the pack declares, byte for byte, and reads them against the pack', () => {
    writeScenery();
    const r = build();
    expect(r.written).toContain('ruins/scenes/r1_gate.json');
    expect(readFileSync(join(out, 'ruins', 'scenes', 'r1_gate.json'), 'utf8')).toBe(readFileSync(join(src, 'ruins', 'scenes', 'r1_gate.json'), 'utf8'));
    const pack = parseArtPack(JSON.parse(readFileSync(join(out, 'ruins', 'ruins.pack.json'), 'utf8')) as unknown).value!;
    expect(pack.scenes).toEqual({ r1_gate: 'scenes/r1_gate.json' });
  });

  it('refuses a scene that places a piece the pack does not have, one that is not there, and one that dresses another room', () => {
    writeScenery({ scene: { sceneVersion: 1, room: 'r1_gate', layers: { terrain: [{ sprite: 'ghost', x: 0, y: 0 }] } } });
    expect(errors(build()).join('\n')).toMatch(/"ghost" is not a sprite set of the pack/);
    expect(existsSync(out)).toBe(false);

    rmSync(src, { recursive: true, force: true });
    writeScenery({ skipScene: true });
    expect(errors(build()).join('\n')).toMatch(/ruins scenes\.r1_gate: the scene file scenes\/r1_gate\.json is not there/);

    rmSync(src, { recursive: true, force: true });
    writeScenery({ scene: { sceneVersion: 1, room: 'r2_hall', layers: {} } });
    expect(errors(build()).join('\n')).toMatch(/dresses "r2_hall", not "r1_gate"/);
  });

  it('its pieces are read by the game\'s own library through the shared page, and the scene by the library too', async () => {
    writeScenery();
    expect(build().ok).toBe(true);
    const toPath = (url: string): string => join(out, ...url.slice('http://art.test/art/'.length).split('/'));
    const lib = new ArtLibrary<{ url: string }, { name: string }>({
      indexUrl: 'http://art.test/art/index.json',
      io: {
        json: async (url) => JSON.parse(readFileSync(toPath(url), 'utf8')) as unknown,
        image: async (url): Promise<ArtImage<{ url: string }>> => {
          const img = decodePng(readFileSync(toPath(url)));
          return { source: { url }, width: img.width, height: img.height, dispose: () => undefined };
        },
      },
      textures: { make: (_s, fr) => new Map(Object.keys(fr).map((name) => [name, { name }])), destroy: () => undefined },
      drawnPxPerMetre: () => 48,
      note: (m) => {
        throw new Error(`the library complained: ${m}`);
      },
    });
    const arch = await lib.acquire('ruins', 'arch');
    const fern = await lib.acquire('ruins', 'fern');
    expect([...arch!.textures.keys()]).toEqual(['arch_00']);
    expect([...fern!.textures.keys()]).toEqual(['fern_00']);
    // both sets are drawn from ONE page: it is in memory once
    expect(lib.stats().pages).toBe(1);
    const scene = await lib.scene('ruins', 'r1_gate');
    expect(scene!.layers.backdropNear).toHaveLength(2);
    expect(await lib.scene('ruins', 'r9_nowhere')).toBeNull();
  });
});
