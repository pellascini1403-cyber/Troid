import { log } from '@/core/log';
import type { AtlasMeta, SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';
import { validateSpriteSet } from '@/presentation/validateSpriteSet';

/** A sprite set ready to draw: its definition, the per-frame metadata and one texture per frame. */
export interface LoadedSpriteSet<T> {
  def: SpriteSetDefinition;
  meta: AtlasMeta;
  textures: ReadonlyMap<string, T>;
  /** Frees the GPU resources; called when the last reference is released. */
  dispose(): void;
}

/** How a definition becomes textures. Generic over the texture type so the manager is tested without a GPU. */
export type SpriteSetLoader<T> = (def: SpriteSetDefinition) => Promise<Omit<LoadedSpriteSet<T>, 'def'>>;

export interface SpriteAssetManagerOptions {
  /** Validate every set against its definition and log issues (default true). */
  validate?: boolean;
}

interface Entry<T> {
  promise: Promise<LoadedSpriteSet<T>>;
  refs: number;
  loaded: LoadedSpriteSet<T> | null;
}

/**
 * Loads and caches sprite sets by definition id (the 2D successor of the glTF `AssetManager`).
 *
 * - Concurrent requests for the same set share one load.
 * - Reference counted: when the last user releases it (a room unloads) the textures are freed.
 * - Every set is validated against the asset contract when it loads, and issues are logged once.
 * - A failed load never poisons the cache.
 */
export class SpriteAssetManager<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly validate: boolean;
  private readonly warn = log.scope('assets');

  constructor(
    private readonly loader: SpriteSetLoader<T>,
    options: SpriteAssetManagerOptions = {},
  ) {
    this.validate = options.validate ?? true;
  }

  /** Loads (or reuses) the set for `def`. Does not take a reference. */
  load(def: SpriteSetDefinition): Promise<LoadedSpriteSet<T>> {
    let entry = this.entries.get(def.id);
    if (!entry) {
      const created: Entry<T> = {
        refs: 0,
        loaded: null,
        promise: this.loader(def).then((parts) => {
          const set: LoadedSpriteSet<T> = { def, ...parts };
          created.loaded = set;
          if (this.validate) this.report(set);
          return set;
        }),
      };
      // A failed load must not poison the cache forever.
      created.promise.catch(() => this.entries.delete(def.id));
      this.entries.set(def.id, created);
      entry = created;
    }
    return entry.promise;
  }

  /** Loads the set if needed and takes a reference. Call `release(def)` when done. */
  async acquire(def: SpriteSetDefinition): Promise<LoadedSpriteSet<T>> {
    const set = await this.load(def);
    const entry = this.entries.get(def.id);
    if (entry) entry.refs++;
    return set;
  }

  /** Synchronous `acquire` for already-loaded sets (rooms preload what they need). */
  acquireLoaded(def: SpriteSetDefinition): LoadedSpriteSet<T> {
    const entry = this.entries.get(def.id);
    if (!entry?.loaded) throw new Error(`sprite set "${def.id}" is not loaded; await sprites.load() first`);
    entry.refs++;
    return entry.loaded;
  }

  release(def: SpriteSetDefinition): void {
    const entry = this.entries.get(def.id);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0 && entry.loaded) this.free(def.id, entry);
  }

  has(def: SpriteSetDefinition): boolean {
    return this.entries.get(def.id)?.loaded != null;
  }

  /** Number of sets currently cached (leak checks). */
  get size(): number {
    return this.entries.size;
  }

  refCount(def: SpriteSetDefinition): number {
    return this.entries.get(def.id)?.refs ?? 0;
  }

  dispose(): void {
    for (const [id, entry] of [...this.entries]) this.free(id, entry);
  }

  private free(id: string, entry: Entry<T>): void {
    entry.loaded?.dispose();
    this.entries.delete(id);
  }

  private report(set: LoadedSpriteSet<T>): void {
    for (const issue of validateSpriteSet(set.def, set.meta, new Set(set.textures.keys()))) {
      if (issue.level === 'info') continue;
      const msg = `[${set.def.id}] ${issue.message}`;
      if (issue.level === 'error') this.warn.error(msg);
      else this.warn.warn(msg);
    }
  }
}
