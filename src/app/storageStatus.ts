/**
 * What the browser says about keeping this site's data, and the ask to keep it. It is the saved-games screen's alone, so it lives apart from `storage.ts` (which every start needs): the
 * cold start carries none of it.
 */

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
