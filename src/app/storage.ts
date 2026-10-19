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

/** Does this storage outlive the page? A memory store (what `createStorage` falls back to when the browser offers nothing) does not: what is "saved" in it dies with the page. */
export function isDurable(storage: StorageAdapter): boolean {
  return !(storage instanceof MemoryStorage);
}

/** What the browser says about keeping this site's data (`null`: it does not say). */
export interface StorageStatus {
  /** The browser promised not to clear the site's data to make room (`navigator.storage.persisted`). */
  persisted: boolean | null;
  /** Bytes this site uses and the most it may (`navigator.storage.estimate`): an estimate, rounded by the browser on purpose. */
  usage: number | null;
  quota: number | null;
}

/** Asks the browser, never throws: an engine without the API (or one that refuses to answer) gives `null`s. */
export async function storageStatus(): Promise<StorageStatus> {
  const out: StorageStatus = { persisted: null, usage: null, quota: null };
  try {
    const manager = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!manager) return out;
    if (typeof manager.persisted === 'function') out.persisted = await manager.persisted();
    if (typeof manager.estimate === 'function') {
      const e = await manager.estimate();
      out.usage = typeof e.usage === 'number' ? e.usage : null;
      out.quota = typeof e.quota === 'number' ? e.quota : null;
    }
  } catch {
    // an engine that cannot say: the player is told nothing about it, which is true
  }
  return out;
}

/** Asks the browser to keep this site's data (it may refuse, or ask the player): resolves to whether it will. Never throws. */
export async function requestPersistence(): Promise<boolean> {
  try {
    const manager = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    return typeof manager?.persist === 'function' ? await manager.persist() : false;
  } catch {
    return false;
  }
}
