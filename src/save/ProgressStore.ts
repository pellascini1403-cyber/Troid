import { parseProgress, repairProgress, serializeProgress, type ProgressData } from './ProgressData';
import { SafeStore, type GuardedResult, type Inspection } from './SafeStore';
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

  /**
   * Saves `data` (repaired first) unless the game stored now was saved AFTER `knownSavedAt` — the moment of the last save this page knows of, its own or the one it loaded: someone else has written
   * since (another tab of the same game: they share the storage), and writing over it would throw their progress away. Then nothing is written and the answer is `conflict`; the progress in force
   * stays what it was. A storage with nothing in it, or nothing readable, is not a conflict.
   */
  async saveGuarded(data: Readonly<ProgressData>, knownSavedAt: number): Promise<GuardedResult> {
    const clean = repairProgress(data);
    const result = await this.safe.writeGuarded(serializeProgress(clean), (stored) => stored === null || stored.savedAt <= knownSavedAt);
    if (result !== 'conflict') this.state = clean;
    return result;
  }

  /** What is saved, looked at without touching it (`load` repairs while it reads; this does not). */
  inspect(): Promise<Inspection<ProgressData>> {
    return this.safe.inspect();
  }

  /** Forgets the save AND its copies, the damaged one included: the player asked for this one by name. */
  async erase(): Promise<boolean> {
    this.state = null;
    return this.safe.erase();
  }

  /** A new game here: the save goes, but a copy that could not be read is kept (filed as `.corrupt`) — only a good one is replaced, and only because the player said so. */
  async restart(): Promise<boolean> {
    this.state = null;
    return this.safe.restart();
  }

  /** Resolves when every write asked for so far is finished. */
  flush(): Promise<void> {
    return this.safe.flush();
  }
}
