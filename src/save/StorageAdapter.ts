/**
 * Where the game keeps what must outlive a session (docs/ARCHITECTURE-2D.md §11). The `save/` module is PURE: it never touches
 * `localStorage` or a plugin, it is handed one of these. Asynchronous on purpose — the native shell's preferences store is — even
 * though the browser's is not.
 *
 * A read of a missing key gives `null`. A write may fail (a full or blocked store): it throws, and the caller decides what that means.
 */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** An in-memory store: the tests', and the fallback when the platform offers nothing. */
export class MemoryStorage implements StorageAdapter {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  /** Every key, sorted (tests). */
  keys(): string[] {
    return [...this.data.keys()].sort();
  }
}
