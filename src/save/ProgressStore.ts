import { parseProgress, repairProgress, serializeProgress, type ProgressData } from './ProgressData';
import { SafeStore } from './SafeStore';
import type { StorageAdapter } from './StorageAdapter';

export interface ProgressStoreOptions {
  /** The key the progress lives under (`<key>.bak`, `<key>.corrupt`: see `SafeStore`). Never the settings' key. */
  key?: string;
  /** Where problems are reported (never thrown): the platform wires it to the log. */
  warn?: (message: string) => void;
}

/**
 * The progress of the game, loaded and saved safely (docs/PROMPT6-LOG.md S24). It has the same hardness as the settings — a save is
 * the hardest thing in the game to lose — because it IS the same code: `SafeStore` keeps a `.bak` of the last good copy, keeps an
 * unreadable one as `.corrupt` instead of overwriting it, reads every write back, and never lets a damaged previous copy replace a good
 * backup. It never throws: a store that is full or blocked means the game goes on in memory and says so once.
 */
export class ProgressStore {
  private state: ProgressData | null = null;
  private readonly safe: SafeStore<ProgressData>;

  constructor(storage: StorageAdapter, options: ProgressStoreOptions = {}) {
    this.safe = new SafeStore(storage, { key: options.key ?? 'troid.progress', label: 'progress', parse: parseProgress, ...(options.warn ? { warn: options.warn } : {}) });
  }

  /** The progress in force: what was loaded or last saved. `null` while there is none (a new game). */
  get value(): Readonly<ProgressData> | null {
    return this.state;
  }

  /** Reads what is saved: the progress, or `null` when there is no usable save. Never rejects. */
  async load(): Promise<Readonly<ProgressData> | null> {
    this.state = await this.safe.load();
    return this.state;
  }

  /** Saves `data` (repaired first): it is in force at once and reaches the storage after the writes already asked for. Resolves to whether it did. */
  save(data: Readonly<ProgressData>): Promise<boolean> {
    const clean = repairProgress(data);
    this.state = clean;
    return this.safe.write(serializeProgress(clean));
  }

  /** A new game: forgets the save (and its copies). */
  async erase(): Promise<boolean> {
    this.state = null;
    return this.safe.erase();
  }

  /** Resolves when every write asked for so far is finished. */
  flush(): Promise<void> {
    return this.safe.flush();
  }
}
