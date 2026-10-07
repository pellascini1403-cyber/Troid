import type { ArtImage, ArtIO, ArtTextures } from '@/assets/artLibrary';
import type { AtlasFrameJson } from '@/presentation/artAtlas';

/**
 * A FAKE WORLD of art files for the tests of everything that loads art: JSON by URL, images that are only a size, and the counts of what was fetched,
 * uploaded and freed. Nothing here is art — the frames are 10 × 10 cells with names — and nothing needs a GPU or a network.
 */
export interface FakeSource {
  url: string;
}
export interface FakeTexture {
  name: string;
  url: string;
  destroyed: boolean;
}

export interface WorldAtlas {
  id: string;
  /** Pixel density relative to the master (default 1). */
  resolution?: number;
  width?: number;
  height?: number;
  /** The frames this page holds, laid out in a row of 10 × 10 cells. */
  frames: string[];
  /** What to change in the atlas JSON the world writes (`meta`, `frames`). */
  json?: (data: Record<string, unknown>) => Record<string, unknown>;
}

export interface WorldSprite {
  id: string;
  atlases: string[];
  /** The clips of the set: a state (or alias) → its frame prefix and count. */
  clips: Record<string, [prefix: string, count: number]>;
  /** Anything else of the sprite set in the manifest (`frames`, `anchors`, `scale`…). */
  extra?: Record<string, unknown>;
}

export interface WorldPack {
  id: string;
  category?: string;
  load?: 'boot' | 'zone' | 'lazy';
  zones?: string[];
  status?: string;
  atlases: WorldAtlas[];
  sprites: WorldSprite[];
}

export const ART_BASE = 'http://art.test/art/';

/** Frame names `idle_00 … idle_NN`. */
export const names = (prefix: string, count: number): string[] => Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);

export class ArtWorld {
  readonly indexUrl = `${ART_BASE}index.json`;
  readonly files = new Map<string, unknown>();
  readonly images = new Map<string, { width: number; height: number }>();
  /** Every file asked for, in order. */
  readonly requests: string[] = [];
  /** Images uploaded and not yet freed. */
  readonly live = new Set<string>();
  readonly freed: string[] = [];
  readonly textures: FakeTexture[] = [];
  /** URLs that fail (a 404 / a network error) until removed. */
  readonly failing = new Set<string>();
  /** A gate a test can hold shut to keep a request in flight: URL → a promise it resolves later. */
  readonly gates = new Map<string, Promise<void>>();
  private readonly index: Array<Record<string, unknown>> = [];

  readonly io: ArtIO<FakeSource> = {
    json: async (url) => {
      this.requests.push(url);
      await this.gates.get(url);
      if (this.failing.has(url) || !this.files.has(url)) throw new Error(`${url} → HTTP 404`);
      return structuredClone(this.files.get(url));
    },
    image: async (url): Promise<ArtImage<FakeSource>> => {
      this.requests.push(url);
      await this.gates.get(url);
      const size = this.images.get(url);
      if (this.failing.has(url) || !size) throw new Error(`${url} → HTTP 404`);
      this.live.add(url);
      let freed = false;
      return {
        source: { url },
        width: size.width,
        height: size.height,
        dispose: () => {
          if (freed) return;
          freed = true;
          this.live.delete(url);
          this.freed.push(url);
        },
      };
    },
  };

  readonly textureApi: ArtTextures<FakeSource, FakeTexture> = {
    make: (source, frames: Readonly<Record<string, AtlasFrameJson>>) => {
      const out = new Map<string, FakeTexture>();
      for (const name of Object.keys(frames)) {
        const t: FakeTexture = { name, url: source.url, destroyed: false };
        this.textures.push(t);
        out.set(name, t);
      }
      return out;
    },
    destroy: (t) => {
      t.destroyed = true;
    },
  };

  /** Writes a pack's manifest, its atlases' JSON and images, and lists it in the index. */
  addPack(p: WorldPack): this {
    const dir = `${ART_BASE}${p.id}/`;
    const atlases = p.atlases.map((a) => {
      const width = a.width ?? Math.max(16, a.frames.length * 10);
      const height = a.height ?? 16;
      const frames: Record<string, unknown> = {};
      a.frames.forEach((name, i) => (frames[name] = { frame: { x: i * 10, y: 0, w: 10, h: 10 } }));
      const data = { frames, meta: { image: `${a.id}.png`, size: { w: width, h: height } } };
      this.files.set(`${dir}${a.id}.json`, a.json ? a.json(data) : data);
      this.images.set(`${dir}${a.id}.png`, { width, height });
      return { id: a.id, source: `${a.id}.png`, data: `${a.id}.json`, width, height, resolution: a.resolution ?? 1 };
    });
    const sprites = p.sprites.map((s) => ({
      id: s.id,
      atlases: s.atlases,
      artPxPerMeter: 10,
      pivot: [0.5, 1],
      height: 1,
      clips: Object.fromEntries(Object.entries(s.clips).map(([state, [frames, count]]) => [state, { frames, count, fps: 10 }])),
      ...s.extra,
    }));
    this.files.set(`${dir}${p.id}.pack.json`, { manifestVersion: 1, id: p.id, category: p.category ?? 'enemies', status: p.status ?? 'final', atlases, sprites });
    this.index.push({ id: p.id, category: p.category ?? 'enemies', load: p.load ?? 'lazy', ...(p.zones ? { zones: p.zones } : {}), manifest: `${p.id}/${p.id}.pack.json` });
    this.files.set(this.indexUrl, { manifestVersion: 1, packs: this.index });
    return this;
  }

  /** The URLs of a pack's files: its manifest, and each atlas's image and JSON. */
  urls(packId: string, atlasId: string): { manifest: string; image: string; data: string } {
    const dir = `${ART_BASE}${packId}/`;
    return { manifest: `${dir}${packId}.pack.json`, image: `${dir}${atlasId}.png`, data: `${dir}${atlasId}.json` };
  }

  fetches(url: string): number {
    return this.requests.filter((r) => r === url).length;
  }

  /** Holds the requests for `url` until the returned function is called. */
  hold(url: string): () => void {
    let open!: () => void;
    this.gates.set(url, new Promise<void>((res) => (open = res)));
    return () => {
      this.gates.delete(url);
      open();
    };
  }
}

/** A minimal valid pack: one sprite set `hero` with an `idle` (3 frames) and a `walk` (2) on one page. */
export const simplePack = (over: Partial<WorldPack> = {}): WorldPack => ({
  id: 'enemies',
  atlases: [{ id: 'main', frames: [...names('idle_', 3), ...names('walk_', 2)] }],
  sprites: [{ id: 'hero', atlases: ['main'], clips: { idle: ['idle_', 3], walk: ['walk_', 2] } }],
  ...over,
});
