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

/** How a guarded write ended: it reached the storage, it did not, or the guard refused it (what is stored is not what the writer thinks it is replacing). */
export type GuardedResult = 'written' | 'failed' | 'conflict';

/** What a LOOK at the storage found (nothing was written to find it): no value, a good one (`recovered`: only the backup of a write that stopped halfway was readable), or only what cannot be read. */
export type Inspection<T> = { state: 'empty' } | { state: 'ok'; value: T; recovered: boolean } | { state: 'damaged' };

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

  /**
   * Looks at what is saved WITHOUT touching it (a list of saved games must not rewrite anything): `load` repairs while it reads — it files an unreadable copy as
   * `.corrupt` and puts a good backup back — and a screen that only shows the slots has no business doing that to the ones the player is not playing. It looks after
   * the writes already asked for, so it sees the latest. Never rejects.
   */
  inspect(): Promise<Inspection<T>> {
    const done = this.queue.then(() => this.look());
    this.queue = done;
    return done;
  }

  /** Saves `text` after the writes already asked for. Resolves to whether it reached the storage. */
  write(text: string): Promise<boolean> {
    const written = this.queue.then(async () => (await this.put(text)) === 'written');
    this.queue = written;
    return written;
  }

  /**
   * Saves `text` only if `allowed` agrees to what it would REPLACE: it is given the value stored right now (`null`: nothing there, or nothing that can be read) at the moment of the write, after
   * the writes already asked for. Where the storage is shared with another page — two tabs of the same game — this is how a page that holds an old picture of the value finds out, instead of
   * writing over what the other one saved. A refused write touches nothing.
   */
  writeGuarded(text: string, allowed: (stored: T | null) => boolean): Promise<GuardedResult> {
    const written = this.queue.then(() => this.put(text, allowed));
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

  /**
   * Starts the value over — a NEW game in this place — without losing what could not be read: a main copy that cannot be parsed is filed as `.corrupt` first (a person
   * can still recover it by hand), then the value and its backup go. A good copy is replaced on purpose (the caller has asked the player); nothing damaged is thrown away.
   */
  restart(): Promise<boolean> {
    const { key, label } = this.options;
    const done = this.queue.then(async () => {
      try {
        const main = await this.storage.get(key);
        if (main !== null && this.options.parse(main) === null) await this.storage.set(`${key}.corrupt`, main);
        await this.storage.remove(key);
        await this.storage.remove(`${key}.bak`);
        return true;
      } catch (error) {
        this.report(`${label} could not be restarted: ${message(error)}`);
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

  private async look(): Promise<Inspection<T>> {
    const { key } = this.options;
    const main = await this.read(key);
    if (main !== null) {
      const parsed = this.options.parse(main);
      if (parsed !== null) return { state: 'ok', value: parsed, recovered: false };
    }
    const backup = await this.read(`${key}.bak`);
    if (backup !== null) {
      const parsed = this.options.parse(backup);
      if (parsed !== null) return { state: 'ok', value: parsed, recovered: true };
    }
    // something is there and none of it can be read (a copy filed as `.corrupt` by a load counts: it is still the player's data)
    if (main !== null || backup !== null || (await this.read(`${key}.corrupt`)) !== null) return { state: 'damaged' };
    return { state: 'empty' };
  }

  private async put(text: string, allowed?: (stored: T | null) => boolean): Promise<GuardedResult> {
    const { key, label } = this.options;
    const bak = `${key}.bak`;
    try {
      const previous = await this.storage.get(key);
      if (allowed && !allowed(previous === null ? null : this.options.parse(previous))) return 'conflict';
      if (previous === text) return 'written'; // it is already exactly what is stored: nothing to write, so nothing to put at risk
      // Only a GOOD previous copy is worth keeping: a damaged one (a write that stopped halfway) must never replace the good backup.
      const replacing = previous !== null && this.options.parse(previous) !== null;
      if (replacing) {
        await this.storage.set(bak, previous);
        // the main file is not touched until the backup is known to be there: a backup that did not land leaves the main file as it was
        if ((await this.storage.get(bak)) !== previous) {
          this.report(`the backup of the ${label} did not read back as written; nothing was changed`);
          return 'failed';
        }
      }
      await this.storage.set(key, text);
      if ((await this.storage.get(key)) !== text) {
        this.report(`a ${label} write did not read back as written; the previous copy is kept`);
        return 'failed';
      }
      if (replacing) await this.storage.remove(bak);
      return 'written';
    } catch (error) {
      this.report(`${label} could not be saved: ${message(error)}`);
      return 'failed';
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
