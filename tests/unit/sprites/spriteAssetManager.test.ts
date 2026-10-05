// @vitest-environment happy-dom
import { TextureSource } from 'pixi.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { SpriteAssetManager, type SpriteSetLoader } from '@/assets/SpriteAssetManager';
import { texturesFromFrames } from '@/assets/spriteLoader';
import { PLAYER_PLACEHOLDER } from '@/content/placeholders/playerPlaceholder';
import { log, type LogEntry } from '@/core/log';

const DEF = PLAYER_PLACEHOLDER.def;
const META = PLAYER_PLACEHOLDER.meta;

/** In-memory loader that counts loads and disposals; the textures are plain objects (the manager is generic). */
function makeLoader() {
  const stats = { loads: 0, disposed: 0 };
  const loader: SpriteSetLoader<object> = async (def) => {
    stats.loads++;
    expect(def.id).toBe(DEF.id);
    return {
      meta: META,
      textures: new Map(PLAYER_PLACEHOLDER.frames.map((f) => [f.name, {}])),
      dispose: () => void stats.disposed++,
    };
  };
  return { loader, stats };
}

describe('SpriteAssetManager (port of AssetManager)', () => {
  it('shares one load between concurrent requests', async () => {
    const { loader, stats } = makeLoader();
    const sprites = new SpriteAssetManager(loader, { validate: false });
    await Promise.all([sprites.load(DEF), sprites.load(DEF), sprites.acquire(DEF)]);
    expect(stats.loads).toBe(1);
    expect(sprites.size).toBe(1);
  });

  it('ref-counts users and frees the entry (and its textures) when the last one is released', async () => {
    const { loader, stats } = makeLoader();
    const sprites = new SpriteAssetManager(loader, { validate: false });
    await sprites.acquire(DEF);
    sprites.acquireLoaded(DEF);
    expect(sprites.refCount(DEF)).toBe(2);
    sprites.release(DEF);
    expect(sprites.has(DEF)).toBe(true);
    expect(stats.disposed).toBe(0);
    sprites.release(DEF);
    expect(sprites.has(DEF)).toBe(false);
    expect(sprites.size).toBe(0);
    expect(stats.disposed).toBe(1);
  });

  it('a failed load does not poison the cache', async () => {
    let fail = true;
    const { loader } = makeLoader();
    const sprites = new SpriteAssetManager<object>(
      async (def) => {
        if (fail) throw new Error('network');
        return loader(def);
      },
      { validate: false },
    );
    await expect(sprites.load(DEF)).rejects.toThrow('network');
    await Promise.resolve();
    fail = false;
    await expect(sprites.load(DEF)).resolves.toBeDefined();
  });

  it('acquireLoaded throws a clear error when the set was never loaded', () => {
    const sprites = new SpriteAssetManager(makeLoader().loader, { validate: false });
    expect(() => sprites.acquireLoaded(DEF)).toThrow(/not loaded/);
  });

  it('dispose() frees everything that is still cached', async () => {
    const { loader, stats } = makeLoader();
    const sprites = new SpriteAssetManager(loader, { validate: false });
    await sprites.acquire(DEF);
    sprites.dispose();
    expect(sprites.size).toBe(0);
    expect(stats.disposed).toBe(1);
  });
});

describe('SpriteAssetManager validation', () => {
  let entries: LogEntry[];
  beforeEach(() => {
    entries = [];
    log.setSink((e) => entries.push(e));
  });

  it('logs the contract violations of a set when it loads (a texture that is missing from the atlas)', async () => {
    const sprites = new SpriteAssetManager<object>(async () => ({ meta: META, textures: new Map([['idle_00', {}]]), dispose: () => {} }));
    await sprites.load(DEF);
    expect(entries.some((e) => e.level === 'error' && e.message.includes('not in the atlas'))).toBe(true);
    log.setSink(() => {});
  });

  it('a clean set loads silently', async () => {
    const { loader } = makeLoader();
    await new SpriteAssetManager(loader).load(DEF);
    expect(entries.filter((e) => e.level !== 'debug' && e.level !== 'info')).toEqual([]);
    log.setSink(() => {});
  });
});

describe('atlas JSON → textures (the path final art will use)', () => {
  it('builds one texture per frame sharing the atlas source, honouring the trim', () => {
    const source = new TextureSource({ width: 256, height: 128 });
    const map = texturesFromFrames(source, {
      idle_00: { frame: { x: 0, y: 0, w: 100, h: 120 } },
      run_00: { frame: { x: 100, y: 0, w: 60, h: 100 }, sourceSize: { w: 100, h: 120 }, spriteSourceSize: { x: 20, y: 10, w: 60, h: 100 }, trimmed: true },
    });
    expect([...map.keys()]).toEqual(['idle_00', 'run_00']);
    const idle = map.get('idle_00')!;
    const run = map.get('run_00')!;
    expect(idle.source).toBe(source);
    expect(run.source).toBe(source);
    expect(idle.frame.width).toBe(100);
    expect(idle.trim).toBeFalsy();
    // trimmed: the pixels are 60×100 but the ORIGINAL frame (the one pivots refer to) is 100×120
    expect(run.frame.width).toBe(60);
    expect(run.orig.width).toBe(100);
    expect(run.orig.height).toBe(120);
    expect(run.trim?.x).toBe(20);
    expect(run.trim?.y).toBe(10);
  });
});
