import type { StorageAdapter } from './StorageAdapter';

export interface SafeStoreOptions<T> {
  /** The key the value lives under (`<key>.bak` is the previous copy while a write is in flight, `<key>.corrupt` an unreadable one). */
  key: string;
  /** What is stored, for the messages: "settings", "progress". */
  label: string;
  /** What a stored text MEANS: the value, or `null` when it cannot be trusted at all (not JSON, a version this build does not know…). */
  parse: (text: string) => T | null;
  /** Where problems are reported (never thrown): the platform wires it to the log. Once per session. */
  warn?: (message: string) => void;
}

/**
 * One value, kept safely in a `StorageAdapter` (docs/ARCHITECTURE-2D.md §11). The settings and the progress of the game are two
 * models in two keys, but they must be equally hard to lose, so they share this. It never throws: a store that is full, blocked or
 * empty means the game runs on what is in memory, and says so once.
 *
 * - **Load:** `key` → if it is unreadable it is KEPT as `key.corrupt` and `key.bak` is tried → if that fails too, `null` (the caller's defaults).
 * - **Write:** `key.bak` ← the previous value · `key` ← the new one · it is read back and checked · only then is the `.bak` removed.
 *   Whatever stops in the middle leaves a good copy behind, and a damaged previous copy never replaces a good backup.
 * - Writes are SERIALISED: two quick changes reach the storage in order, the last one wins. A write of exactly what is already stored does nothing.
 */
export class SafeStore<T> {
  private queue: Promise<unknown> = Promise.resolve();
  private warned = false;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly options: SafeStoreOptions<T>,
  ) {}

  /** Reads what is saved: the value, or `null` when nothing usable is there. Never rejects. */
  async load(): Promise<T | null> {
    const { key } = this.options;
    const main = await this.read(key);
    if (main !== null) {
      const parsed = this.options.parse(main);
      if (parsed !== null) return parsed;
      this.report(`the saved ${this.options.label} are unreadable; they are kept as "${key}.corrupt"`);
      await this.attempt(() => this.storage.set(`${key}.corrupt`, main));
    }
    const backup = await this.read(`${key}.bak`);
    if (backup !== null) {
      const parsed = this.options.parse(backup);
      if (parsed !== null) {
        // the good copy is back in force; put it where it belongs (the backup stays until the next good write)
        await this.attempt(() => this.storage.set(key, backup));
        return parsed;
      }
    }
    return null;
  }

  /** Saves `text` after the writes already asked for. Resolves to whether it reached the storage. */
  write(text: string): Promise<boolean> {
    const written = this.queue.then(() => this.put(text));
    this.queue = written;
    return written;
  }

  /** Forgets what is saved (a new game): the value, its backup and its damaged copy. A good copy is NOT kept aside; nothing is lost by accident, this is on purpose. */
  erase(): Promise<boolean> {
    const done = this.queue.then(async () => {
      try {
        for (const k of [this.options.key, `${this.options.key}.bak`, `${this.options.key}.corrupt`]) await this.storage.remove(k);
        return true;
      } catch (error) {
        this.report(`${this.options.label} could not be erased: ${message(error)}`);
        return false;
      }
    });
    this.queue = done;
    return done;
  }

  /** Resolves when every write asked for so far is finished. */
  async flush(): Promise<void> {
    await this.queue;
  }

  // ---------------------------------------------------------------------------------------------- internals

  private async put(text: string): Promise<boolean> {
    const { key, label } = this.options;
    const bak = `${key}.bak`;
    try {
      const previous = await this.storage.get(key);
      if (previous === text) return true; // it is already exactly what is stored: nothing to write, so nothing to put at risk
      // Only a GOOD previous copy is worth keeping: a damaged one (a write that stopped halfway) must never replace the good backup.
      const replacing = previous !== null && this.options.parse(previous) !== null;
      if (replacing) {
        await this.storage.set(bak, previous);
        // the main file is not touched until the backup is known to be there: a backup that did not land leaves the main file as it was
        if ((await this.storage.get(bak)) !== previous) {
          this.report(`the backup of the ${label} did not read back as written; nothing was changed`);
          return false;
        }
      }
      await this.storage.set(key, text);
      if ((await this.storage.get(key)) !== text) {
        this.report(`a ${label} write did not read back as written; the previous copy is kept`);
        return false;
      }
      if (replacing) await this.storage.remove(bak);
      return true;
    } catch (error) {
      this.report(`${label} could not be saved: ${message(error)}`);
      return false;
    }
  }

  private async read(key: string): Promise<string | null> {
    try {
      return await this.storage.get(key);
    } catch (error) {
      this.report(`${this.options.label} could not be read: ${message(error)}`);
      return null;
    }
  }

  private async attempt(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.report(`${this.options.label} storage failed: ${message(error)}`);
    }
  }

  /** Once per session: a store that fails does so every time, and the player needs to hear it once. */
  private report(text: string): void {
    if (this.warned) return;
    this.warned = true;
    this.options.warn?.(text);
  }
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));
