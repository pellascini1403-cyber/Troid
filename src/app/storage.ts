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

/**
 * The page's storage. Inside a native shell (`window.Capacitor`: a Capacitor app on iOS or Android) it is the platform's preferences store — the system never clears it to make room — once it has shown that
 * it works; anywhere else, or when it does not, the browser's (`createStorage`). The native part is a chunk of its own: a web player never downloads it (docs/PROMPT20-LOG.md).
 */
export async function openStorage(): Promise<StorageAdapter> {
  const cap = typeof window !== 'undefined' ? (window as { Capacitor?: unknown }).Capacitor : undefined;
  if (cap) {
    try {
      const native = await (await import('./nativeStorage')).nativeStorage(cap as never);
      if (native) return native;
    } catch {
      // the chunk could not be fetched, or the shell misbehaved: the web's storage is still there
    }
  }
  return createStorage();
}

/** Does this storage outlive the page? A memory store (what `createStorage` falls back to when the browser offers nothing) does not: what is "saved" in it dies with the page. */
export function isDurable(storage: StorageAdapter): boolean {
  return !(storage instanceof MemoryStorage);
}
