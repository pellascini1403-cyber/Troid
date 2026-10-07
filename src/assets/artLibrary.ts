import { atlasVariants, chooseAtlasVariant, parseArtAtlasRef, parseArtIndex, parseArtPack, toSpriteSetDefinition, artSetId, type ArtAtlas, type ArtIndexEntry, type ArtIssue, type ArtPack, type ArtSprite } from '@/presentation/artManifest';
import { checkSpriteFrames, mergeFrameMeta, parseAtlasData, usedFrameNames, type AtlasData, type AtlasFrameJson, type AtlasPage } from '@/presentation/artAtlas';
import { applyContract, type DroppedClip } from '@/presentation/artContract';
import type { SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import type { LoadedSpriteSet } from './SpriteAssetManager';

/**
 * THE ART LIBRARY (docs/ART-PIPELINE-2D.md, part C): everything the game does with art that comes from FILES — reading the index and the pack manifests,
 * fetching the atlas pages, checking them against what the manifests declare, turning them into textures, and deciding WHEN (boot, a zone, on demand) and
 * for how long they stay in memory. Gameplay never sees it: the first frame, the placeholder and every rule of the simulation work without it, and a page
 * that has no art never downloads this code (it is a chunk of its own, fetched only when an index exists — `app/art.ts`).
 *
 * The library knows nothing about Pixi or the network: files and textures come through two small interfaces (`ArtIO`, `ArtTextures`), so the whole of it is
 * tested in Node with fakes, and the same code runs in the browser with `fetch` + `createImageBitmap` + Pixi textures (`artIO.ts`).
 *
 * Rules it keeps:
 *  - NOTHING it does can fail the game. Every problem (a 404, a corrupt JSON, a frame missing from a page, an image of another size than declared, a
 *    sword that does not sit in the hand) comes back as `null` for that set and a note in the log; whoever asked keeps its placeholder.
 *  - One image, one upload: a page is cached by URL and counted by the sets drawn from it, so two sprite sets that share an atlas share its memory too,
 *    and the page is freed with the last of them.
 *  - A clip that does not meet the contract (a frame missing from the atlas, a sword anchor that is not in the hand…) is DROPPED from the set, not the
 *    whole set: its state falls back (the animator's chain, ending at idle, or the placeholder's own clip). Only a broken `idle`, or a fault of the whole
 *    set (frames that do not share one size), refuses the set. The definition a set carries (`set.def`) is the pruned one: use it, not the requested one.
 *  - Small pages, by category: every pack is its own set of atlases (the packer never merges two categories), so what a room needs is what it loads.
 *  - The resolution of the art never reaches gameplay: the variant (the half-size atlas for a phone) is chosen once per set from the pixels the screen draws,
 *    and the definition it makes is measured in metres (`toSpriteSetDefinition`).
 */

/** A decoded atlas image on the GPU (or a stand-in in a test). */
export interface ArtImage<S> {
  source: S;
  width: number;
  height: number;
  /** Frees the memory the image holds. */
  dispose(): void;
}

/** The only two things the library asks of the outside world. Both reject on any failure. */
export interface ArtIO<S> {
  json(url: string): Promise<unknown>;
  image(url: string): Promise<ArtImage<S>>;
}

/** How the frames of a page become textures. */
export interface ArtTextures<S, T> {
  /** One texture per frame, all of them over the page's image. */
  make(source: S, frames: Readonly<Record<string, AtlasFrameJson>>): Map<string, T>;
  destroy(texture: T): void;
}

export interface ArtLibraryOptions<S, T> {
  /** Absolute URL of `index.json`; every other path is relative to a file that is itself relative to it. */
  indexUrl: string;
  io: ArtIO<S>;
  textures: ArtTextures<S, T>;
  /** Pixels per metre the screen draws right now (`ppm × resolution` of the viewport): what picks the variant of each set. */
  drawnPxPerMetre: () => number;
  /** A clock in milliseconds (`performance.now`), for the load times. */
  now?: () => number;
  /** Where the problems go. Never an error: art that cannot be had is not a failure of the game. */
  note?: (message: string) => void;
}

export type ArtState = 'idle' | 'ready' | 'absent' | 'invalid';

/** A pack once its manifest has been read and checked. */
export interface ArtPackInfo {
  entry: ArtIndexEntry;
  pack: ArtPack;
  /** Absolute URL of the manifest: the paths inside it are relative to it. */
  url: string;
  atlases: ReadonlyMap<string, ArtAtlas>;
}

export interface ArtStats {
  state: ArtState;
  /** Packs in the index, and how many have their manifest read. */
  packs: number;
  packsRead: number;
  /** Atlas pages resident, and the memory they hold (RGBA8, as the GPU has them; the decoded copy the browser keeps is the same again). */
  pages: number;
  bytes: number;
  peakBytes: number;
  /** Sprite sets alive (counted by whoever holds them). */
  sets: number;
  /** Files asked for (every JSON and every image), the ones that failed, and the time the images took to arrive and be made textures. */
  requests: number;
  failures: number;
  loadMs: number;
  /** The zone the hero is in, as `enterZone` was told. */
  zone: string | null;
}

export interface ArtSnapshot extends ArtStats {
  packList: Array<{ id: string; category: string; load: string; status: string; read: boolean; held: boolean; sets: string[]; dropped: Array<{ set: string; state: string; reason: string }> }>;
  pageList: Array<{ url: string; bytes: number; refs: number }>;
}

interface PageEntry<S> {
  promise: Promise<LoadedPage<S>>;
  refs: number;
  loaded: LoadedPage<S> | null;
}

interface SetEntry<T> {
  promise: Promise<LoadedSpriteSet<T>>;
  refs: number;
  loaded: LoadedSpriteSet<T> | null;
}

interface LoadedPage<S> {
  atlas: ArtAtlas;
  url: string;
  image: ArtImage<S>;
  data: AtlasData;
  bytes: number;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const resolveUrl = (relative: string, base: string): string => new URL(relative, base).href;

export class ArtLibrary<S, T> {
  private readonly indexUrl: string;
  private readonly io: ArtIO<S>;
  private readonly textures: ArtTextures<S, T>;
  private readonly drawnPxPerMetre: () => number;
  private readonly now: () => number;
  private readonly noteTo: (message: string) => void;
  /** The sets alive, counted by their users: the last release frees the textures and gives the pages back. */
  private readonly sets = new Map<string, SetEntry<T>>();
  /** The clips left out of each set (by set id) and why. */
  private readonly droppedClips = new Map<string, DroppedClip[]>();

  private state: ArtState = 'idle';
  private index: readonly ArtIndexEntry[] = [];
  private indexRequest: Promise<readonly ArtIndexEntry[]> | null = null;
  private readonly packs = new Map<string, Promise<ArtPackInfo | null>>();
  private readonly packInfo = new Map<string, ArtPackInfo>();
  private readonly pages = new Map<string, PageEntry<S>>();
  /** The definition of each set at the variant first chosen for it: the same one for as long as the library lives. */
  private readonly defs = new Map<string, SpriteSetDefinition>();
  /** What the zone policy keeps loaded: the sets of every pack that boots with the game or belongs to the zone the hero is in. */
  private readonly held = new Map<string, SpriteSetDefinition[]>();
  private zone: string | null = null;
  private disposed = false;
  private readonly counters = { requests: 0, failures: 0, loadMs: 0, peakBytes: 0 };

  constructor(options: ArtLibraryOptions<S, T>) {
    this.indexUrl = options.indexUrl;
    this.io = options.io;
    this.textures = options.textures;
    this.drawnPxPerMetre = options.drawnPxPerMetre;
    this.now = options.now ?? (() => Date.now());
    this.noteTo = options.note ?? (() => undefined);
  }

  // ------------------------------------------------------------------------------------------------------- the index

  /** Reads `index.json` (once). Resolves to the packs it lists — none when there is no art or the index cannot be read: the game then keeps its placeholders. */
  init(): Promise<readonly ArtIndexEntry[]> {
    return (this.indexRequest ??= this.readIndex());
  }

  private async readIndex(): Promise<readonly ArtIndexEntry[]> {
    let raw: unknown;
    try {
      raw = await this.getJson(this.indexUrl);
    } catch (err) {
      this.state = 'absent';
      this.note(`no art index (${message(err)})`);
      return [];
    }
    const { value, issues } = parseArtIndex(raw);
    this.report(this.indexUrl, issues);
    if (!value) {
      this.state = 'invalid';
      return [];
    }
    this.state = 'ready';
    this.index = value.packs;
    return value.packs;
  }

  entries(): readonly ArtIndexEntry[] {
    return this.index;
  }

  // ------------------------------------------------------------------------------------------------------- packs

  /** The manifest of a pack, read and checked once. `null` when the pack is not in the index, cannot be fetched or is not valid (asked for again next time). */
  pack(id: string): Promise<ArtPackInfo | null> {
    let request = this.packs.get(id);
    if (!request) {
      request = this.readPack(id);
      this.packs.set(id, request);
      void request.then((info) => {
        if (!info && this.packs.get(id) === request) this.packs.delete(id);
      });
    }
    return request;
  }

  private async readPack(id: string): Promise<ArtPackInfo | null> {
    const entries = await this.init();
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      this.note(`pack "${id}" is not in the art index`);
      return null;
    }
    const url = resolveUrl(entry.manifest, this.indexUrl);
    let raw: unknown;
    try {
      raw = await this.getJson(url);
    } catch (err) {
      this.note(`pack "${id}" could not be fetched (${message(err)})`);
      return null;
    }
    const { value, issues } = parseArtPack(raw);
    this.report(url, issues);
    if (!value) return null;
    if (value.id !== entry.id || value.category !== entry.category) {
      this.note(`pack "${id}": the manifest says it is "${value.id}" (${value.category}) but the index lists "${entry.id}" (${entry.category})`);
      return null;
    }
    if (this.disposed) return null;
    const info: ArtPackInfo = { entry, pack: value, url, atlases: new Map(value.atlases.map((a) => [a.id, a])) };
    this.packInfo.set(id, info);
    return info;
  }

  // ------------------------------------------------------------------------------------------------------- sets

  /** The definition of a sprite set at the variant this screen wants; `null` while the pack awaits its art or has no such set. Always the same one for the same set. */
  define(info: ArtPackInfo, sprite: ArtSprite): SpriteSetDefinition | null {
    const id = artSetId(info.pack.id, sprite.id);
    const known = this.defs.get(id);
    if (known) return known;
    const variant = chooseAtlasVariant(sprite, info.atlases, this.drawnPxPerMetre());
    if (!variant) return null;
    const def = toSpriteSetDefinition(info.pack.id, sprite, variant);
    this.defs.set(id, def);
    return def;
  }

  /**
   * The set made of `packId`'s `spriteId`, loaded and counted — or `null` when it cannot be had (the reason is in the log). Never throws. Give it back
   * with `release(set.def)`. The definition to draw with is `set.def`: the one that remains after the clips that broke the contract were left out.
   */
  async acquire(packId: string, spriteId: string): Promise<LoadedSpriteSet<T> | null> {
    const info = await this.pack(packId);
    if (!info) return null;
    const sprite = info.pack.sprites.find((s) => s.id === spriteId);
    if (!sprite) {
      this.note(`pack "${packId}" has no sprite set "${spriteId}"`);
      return null;
    }
    const wanted = this.define(info, sprite);
    if (!wanted) return null;
    let entry = this.sets.get(wanted.id);
    if (!entry) {
      const created: SetEntry<T> = {
        refs: 0,
        loaded: null,
        promise: this.buildSet(info, sprite, wanted).then((set) => {
          created.loaded = set;
          return set;
        }),
      };
      // a set that failed is forgotten: the next ask tries again
      created.promise.catch(() => {
        if (this.sets.get(wanted.id) === created) this.sets.delete(wanted.id);
      });
      this.sets.set(wanted.id, created);
      entry = created;
    }
    entry.refs++;
    try {
      return await entry.promise;
    } catch (err) {
      entry.refs = Math.max(0, entry.refs - 1);
      this.note(`sprite set "${wanted.id}" could not be loaded: ${message(err)}`);
      return null;
    }
  }

  /** The set if it is in memory now (a zone or boot hold keeps it there), counted — for code that must not wait; give it back with `release`. */
  acquireLoaded(packId: string, spriteId: string): LoadedSpriteSet<T> | null {
    const def = this.defs.get(artSetId(packId, spriteId));
    const entry = def ? this.sets.get(def.id) : undefined;
    if (!entry?.loaded) return null;
    entry.refs++;
    return entry.loaded;
  }

  release(def: Pick<SpriteSetDefinition, 'id'>): void {
    const entry = this.sets.get(def.id);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0 && entry.loaded) {
      this.sets.delete(def.id);
      this.droppedClips.delete(def.id);
      entry.loaded.dispose();
    }
  }

  /** The clips of a set that were left out, and why (empty for a set that is whole, or one that is not loaded). */
  dropped(packId: string, spriteId: string): readonly DroppedClip[] {
    return this.droppedClips.get(artSetId(packId, spriteId)) ?? [];
  }

  /** Builds one set: its pages (shared with the other sets drawn from them), checked against the manifest, pruned of the clips that break the contract, made into textures. */
  private async buildSet(info: ArtPackInfo, sprite: ArtSprite, wanted: SpriteSetDefinition): Promise<LoadedSpriteSet<T>> {
    const ref = parseArtAtlasRef(wanted.atlas);
    if (!ref) throw new Error(`"${wanted.atlas}" is not a reference to art`);
    const variant = atlasVariants(sprite, info.atlases).find((v) => v.resolution === ref.resolution);
    if (!variant) throw new Error(`"${wanted.atlas}": the set has no variant at ${ref.resolution}×`);

    // the pages: all of them or none (a page that arrived is given back if another did not)
    const taken: LoadedPage<S>[] = [];
    const textures = new Map<string, T>();
    try {
      const results = await Promise.allSettled(variant.pages.map((a) => this.takePage(info, a)));
      for (const r of results) if (r.status === 'fulfilled') taken.push(r.value);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));

      const pages: AtlasPage[] = taken.map((p) => ({ atlas: p.atlas, data: p.data }));
      const meta = { frames: mergeFrameMeta(sprite, pages, ref.resolution) };
      const available = new Set(taken.flatMap((p) => Object.keys(p.data.frames)));

      // what is wrong, clip by clip (that clip is left out) and set-wide (the set is refused): one pure function, the same the build-time checker applies
      const where = `${ref.packId}/${ref.spriteId}`;
      const cross = checkSpriteFrames(sprite, pages);
      const contract = applyContract(wanted, meta, available, cross);
      if (contract.refused.length > 0) {
        this.report(where, contract.refused.map((m): ArtIssue => ({ level: 'error', path: '', message: m })));
        throw new Error(contract.refused[0]);
      }
      for (const d of contract.dropped) this.note(`${where}: clip "${d.state}" is left out (${d.reason}): the state falls back`);
      this.report(where, contract.warnings.map((m): ArtIssue => ({ level: 'warn', path: '', message: m })));
      const def = contract.def;
      const clips = def.clips;
      const dropped = contract.dropped;

      // only the frames the clips that remain draw become textures
      const used = new Set(usedFrameNames({ clips: Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, { frames: c.frames, count: c.count }])) }));
      for (const p of taken) {
        const frames: Record<string, AtlasFrameJson> = {};
        for (const [name, f] of Object.entries(p.data.frames)) if (used.has(name)) frames[name] = f;
        for (const [name, t] of this.textures.make(p.image.source, frames)) textures.set(name, t);
      }
      if (this.disposed) throw new Error('the art library was disposed');
      if (dropped.length > 0) this.droppedClips.set(def.id, dropped);
      return {
        def,
        meta,
        textures,
        dispose: () => {
          for (const t of textures.values()) this.textures.destroy(t);
          for (const p of taken) this.givePage(p.url);
        },
      };
    } catch (err) {
      for (const t of textures.values()) this.textures.destroy(t);
      for (const p of taken) this.givePage(p.url);
      throw err;
    }
  }

  // ------------------------------------------------------------------------------------------------------- pages

  /** One image and its JSON, counted by the sets that use it: the same URL is fetched and uploaded once. */
  private takePage(info: ArtPackInfo, atlas: ArtAtlas): Promise<LoadedPage<S>> {
    const url = resolveUrl(atlas.source, info.url);
    let entry = this.pages.get(url);
    if (!entry) {
      const created: PageEntry<S> = {
        refs: 0,
        loaded: null,
        promise: this.readPage(info, atlas, url).then((page) => {
          created.loaded = page;
          return page;
        }),
      };
      // a page that failed is forgotten: the next set that needs it tries again
      created.promise.catch(() => {
        if (this.pages.get(url) === created) this.pages.delete(url);
      });
      this.pages.set(url, created);
      entry = created;
    }
    entry.refs++;
    const taken = entry;
    // a request that fails gives back the count it took
    return entry.promise.catch((err: unknown) => {
      taken.refs = Math.max(0, taken.refs - 1);
      throw err;
    });
  }

  private async readPage(info: ArtPackInfo, atlas: ArtAtlas, url: string): Promise<LoadedPage<S>> {
    const t0 = this.now();
    if (atlas.data === undefined) throw new Error(`atlas "${atlas.id}" has no JSON`);
    const dataUrl = resolveUrl(atlas.data, info.url);
    const [json, picture] = await Promise.allSettled([this.getJson(dataUrl), this.getImage(url)]);
    if (json.status === 'rejected' || picture.status === 'rejected') {
      if (picture.status === 'fulfilled') picture.value.dispose(); // the image arrived but its JSON did not: nothing keeps it
      throw (json.status === 'rejected' ? json.reason : (picture as PromiseRejectedResult).reason) as Error;
    }
    const image = picture.value;
    const parsed = parseAtlasData(json.value);
    this.report(dataUrl, parsed.issues);
    if (!parsed.value) {
      image.dispose();
      throw new Error(`the JSON of atlas "${atlas.id}" is not valid`);
    }
    if (image.width !== atlas.width || image.height !== atlas.height) {
      image.dispose();
      throw new Error(`atlas "${atlas.id}": the image is ${image.width} × ${image.height} but the manifest declares ${atlas.width} × ${atlas.height}`);
    }
    if (this.disposed) {
      image.dispose();
      throw new Error('the art library was disposed');
    }
    this.counters.loadMs += this.now() - t0;
    const page: LoadedPage<S> = { atlas, url, image, data: parsed.value, bytes: image.width * image.height * 4 };
    this.counters.peakBytes = Math.max(this.counters.peakBytes, this.residentBytes() + page.bytes);
    return page;
  }

  private givePage(url: string): void {
    const entry = this.pages.get(url);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0 && entry.loaded) {
      this.pages.delete(url);
      entry.loaded.image.dispose();
    }
  }

  private residentBytes(): number {
    let bytes = 0;
    for (const e of this.pages.values()) bytes += e.loaded?.bytes ?? 0;
    return bytes;
  }

  // ------------------------------------------------------------------------------------------------------- when

  /**
   * The load policy of the index, put in motion: reads the index and keeps the packs that boot with the game. Called once, AFTER the first frame.
   * Resolves when they are in memory (or could not be).
   */
  async start(): Promise<void> {
    await this.init();
    await Promise.all(this.index.filter((e) => e.load === 'boot').map((e) => this.hold(e.id)));
  }

  /**
   * The hero is now in `zone` (a room or a region): the packs that belong to it are loaded FIRST, and only then are the ones the new zone does not need
   * given back — a pack the two zones share is never fetched twice. A call that is overtaken by a newer one leaves the cleaning to it.
   */
  async enterZone(zone: string): Promise<void> {
    this.zone = zone;
    await this.init();
    await Promise.all(this.index.filter((e) => this.wants(e)).map((e) => this.hold(e.id)));
    for (const id of [...this.held.keys()]) {
      const entry = this.index.find((e) => e.id === id);
      if (!entry || !this.wants(entry)) this.unhold(id);
    }
  }

  private wants(entry: ArtIndexEntry): boolean {
    return entry.load === 'boot' || (entry.load === 'zone' && this.zone !== null && entry.zones.includes(this.zone));
  }

  /** Loads every sprite set of a pack and keeps it (one count each) until the policy lets it go. */
  private async hold(packId: string): Promise<void> {
    if (this.held.has(packId)) return;
    const defs: SpriteSetDefinition[] = [];
    this.held.set(packId, defs); // claimed before anything is awaited: two asks for the same pack load it once
    const info = await this.pack(packId);
    if (!info) {
      this.held.delete(packId);
      return;
    }
    await Promise.all(
      info.pack.sprites.map(async (sprite) => {
        const set = await this.acquire(info.pack.id, sprite.id);
        if (!set) return;
        // the policy may have let the pack go while this set loaded: then its count is given back at once
        if (this.held.get(packId) === defs) defs.push(set.def);
        else this.release(set.def);
      }),
    );
    // the hero may have moved on while it loaded
    if (this.held.get(packId) === defs && !this.wantsPack(packId)) this.unhold(packId);
  }

  private wantsPack(packId: string): boolean {
    const entry = this.index.find((e) => e.id === packId);
    return entry !== undefined && this.wants(entry);
  }

  private unhold(packId: string): void {
    const defs = this.held.get(packId);
    if (!defs) return;
    this.held.delete(packId);
    for (const def of defs) this.release(def);
  }

  // ------------------------------------------------------------------------------------------------------- numbers, files, end

  stats(): ArtStats {
    return {
      state: this.state,
      packs: this.index.length,
      packsRead: this.packInfo.size,
      pages: [...this.pages.values()].filter((e) => e.loaded).length,
      bytes: this.residentBytes(),
      peakBytes: this.counters.peakBytes,
      sets: this.sets.size,
      requests: this.counters.requests,
      failures: this.counters.failures,
      loadMs: Math.round(this.counters.loadMs),
      zone: this.zone,
    };
  }

  /** Everything the library knows, as plain data (the test hooks and the debug panel show it). */
  snapshot(): ArtSnapshot {
    return {
      ...this.stats(),
      packList: this.index.map((e) => {
        const info = this.packInfo.get(e.id);
        return {
          id: e.id,
          category: e.category,
          load: e.load,
          status: info?.pack.status ?? 'unread',
          read: info !== undefined,
          held: this.held.has(e.id),
          sets: [...this.sets.entries()].filter(([id, set]) => id.startsWith(`${e.id}/`) && set.loaded).map(([id]) => id),
          dropped: [...this.droppedClips.entries()].filter(([id]) => id.startsWith(`${e.id}/`)).flatMap(([id, list]) => list.map((d) => ({ set: id, state: d.state, reason: d.reason }))),
        };
      }),
      pageList: [...this.pages.entries()].filter(([, e]) => e.loaded).map(([url, e]) => ({ url, bytes: e.loaded?.bytes ?? 0, refs: e.refs })),
    };
  }

  /** Frees every set and every image. A request still in flight frees what it brings when it arrives. */
  dispose(): void {
    this.disposed = true;
    this.held.clear();
    for (const e of this.sets.values()) e.loaded?.dispose();
    this.sets.clear();
    this.droppedClips.clear();
    for (const e of this.pages.values()) e.loaded?.image.dispose();
    this.pages.clear();
    this.packs.clear();
    this.packInfo.clear();
    this.defs.clear();
  }

  private async getJson(url: string): Promise<unknown> {
    this.counters.requests++;
    try {
      return await this.io.json(url);
    } catch (err) {
      this.counters.failures++;
      throw err;
    }
  }

  private async getImage(url: string): Promise<ArtImage<S>> {
    this.counters.requests++;
    try {
      return await this.io.image(url);
    } catch (err) {
      this.counters.failures++;
      throw err;
    }
  }

  private report(file: string, issues: readonly ArtIssue[]): void {
    for (const i of issues) if (i.level !== 'info') this.note(`${file}${i.path ? ` ${i.path}` : ''}: ${i.message}${i.level === 'error' ? '' : ' (warning)'}`);
  }

  private note(text: string): void {
    this.noteTo(text);
  }
}
