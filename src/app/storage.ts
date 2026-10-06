import { MemoryStorage, type StorageAdapter } from '@/save/StorageAdapter';

/**
 * The browser's `localStorage` as a `StorageAdapter`. Every access can throw (private browsing, blocked site data, a full quota):
 * a read that cannot happen is "nothing saved", a write that cannot happen throws so the settings store can say so once — and
 * the game goes on with what it has in memory.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private area(): Storage | null {
    try {
      return window.localStorage;
    } catch {
      return null; // the property itself throws when site data is blocked
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return this.area()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    const area = this.area();
    if (!area) throw new Error('local storage is not available');
    area.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    this.area()?.removeItem(key);
  }
}

/** The platform's storage, or a memory store when it offers none (the game still runs; nothing survives the session). */
export function createStorage(): StorageAdapter {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return new LocalStorageAdapter();
  } catch {
    // blocked: fall through
  }
  return new MemoryStorage();
}
