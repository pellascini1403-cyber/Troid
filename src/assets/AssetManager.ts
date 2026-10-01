import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelDefinition } from '@/models/ModelDefinition';
import { log } from '@/core/log';
import { CharacterModel, type ModelAsset } from './CharacterModel';
import { validateModel } from './validateModel';

interface Entry {
  asset: Promise<ModelAsset>;
  refs: number;
  loaded: ModelAsset | null;
}

/** What the manager needs from a loader; tests inject an in-memory one. */
export interface GltfLike {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}
export type GltfLoadFn = (url: string) => Promise<GltfLike>;

export interface AssetManagerOptions {
  /** Validate every model against its definition and log issues (default true). */
  validate?: boolean;
  /** Replace the network loader (tests). */
  loadGltf?: GltfLoadFn;
}

/**
 * Loads and caches glTF models by definition id; hands out independent `CharacterModel` instances.
 *
 * - Concurrent requests for the same model share one download.
 * - Reference counted: when the last instance is released (e.g. a room unloads) the geometry is freed.
 * - In dev builds every model is validated against its definition and issues are logged once.
 */
export class AssetManager {
  private readonly entries = new Map<string, Entry>();
  private readonly loadGltf: GltfLoadFn;
  private readonly validate: boolean;
  private readonly warn = log.scope('assets');

  constructor(
    private readonly baseUrl: string,
    options: AssetManagerOptions = {},
  ) {
    this.validate = options.validate ?? true;
    this.loadGltf = options.loadGltf ?? ((url) => new GLTFLoader().loadAsync(url));
  }

  /** Loads (or reuses) the asset for `def`. */
  load(def: ModelDefinition): Promise<ModelAsset> {
    let entry = this.entries.get(def.id);
    if (!entry) {
      const url = `${this.baseUrl}${def.url}`;
      const created: Entry = {
        refs: 0,
        loaded: null,
        asset: this.loadGltf(url).then((gltf) => {
          const asset: ModelAsset = { def, scene: gltf.scene, animations: gltf.animations };
          created.loaded = asset;
          if (this.validate) this.report(def, asset);
          return asset;
        }),
      };
      // A failed download must not poison the cache forever.
      created.asset.catch(() => this.entries.delete(def.id));
      this.entries.set(def.id, created);
      entry = created;
    }
    return entry.asset;
  }

  /** Loads the model if needed and returns a new live instance. Call `release(def)` when done with it. */
  async instantiate(def: ModelDefinition): Promise<CharacterModel> {
    const asset = await this.load(def);
    const entry = this.entries.get(def.id);
    if (entry) entry.refs++;
    return new CharacterModel(asset);
  }

  /** Synchronous instantiate for already-loaded models (rooms preload what they need). */
  instantiateLoaded(def: ModelDefinition): CharacterModel {
    const entry = this.entries.get(def.id);
    if (!entry?.loaded) throw new Error(`model "${def.id}" is not loaded; await assets.load() first`);
    entry.refs++;
    return new CharacterModel(entry.loaded);
  }

  release(def: ModelDefinition): void {
    const entry = this.entries.get(def.id);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0 && entry.loaded) this.free(def.id, entry);
  }

  has(def: ModelDefinition): boolean {
    return this.entries.get(def.id)?.loaded != null;
  }

  /** Number of models currently cached (leak checks). */
  get size(): number {
    return this.entries.size;
  }

  refCount(def: ModelDefinition): number {
    return this.entries.get(def.id)?.refs ?? 0;
  }

  dispose(): void {
    for (const [id, entry] of [...this.entries]) this.free(id, entry);
  }

  private free(id: string, entry: Entry): void {
    entry.loaded?.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.entries.delete(id);
  }

  private report(def: ModelDefinition, asset: ModelAsset): void {
    for (const issue of validateModel(def, asset.scene, asset.animations)) {
      if (issue.level === 'info') continue;
      const msg = `[${def.id}] ${issue.message}`;
      if (issue.level === 'error') this.warn.error(msg);
      else this.warn.warn(msg);
    }
  }
}
