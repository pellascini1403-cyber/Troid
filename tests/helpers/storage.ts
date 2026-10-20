import { MemoryStorage, type StorageAdapter } from '@/save/StorageAdapter';

/** A storage that can be made to misbehave, the way real ones do: private browsing, a full disk, a write that is silently lost. */
export class FlakyStorage implements StorageAdapter {
  readonly inner = new MemoryStorage();
  /** Operations that throw (`get`, `set`, `remove`), or are skipped without a word (`dropSets`). */
  failing = new Set<'get' | 'set' | 'remove'>();
  dropSets = false;
  /** Fail the n-th `set` call (1-based) once, then work normally. */
  failSetNumber = 0;
  /** A write this picks fails, by its key and what it holds (the progress is refused while the settings still go in, or one particular text is refused and the rest go in). */
  failIf: ((key: string, value: string) => boolean) | null = null;
  private sets = 0;
  readonly log: string[] = [];

  async get(key: string): Promise<string | null> {
    if (this.failing.has('get')) throw new Error('get blocked');
    return this.inner.get(key);
  }
  async set(key: string, value: string): Promise<void> {
    this.sets++;
    this.log.push(`set ${key}`);
    if (this.failing.has('set') || this.sets === this.failSetNumber || this.failIf?.(key, value)) throw new Error('quota exceeded');
    if (this.dropSets) return;
    await this.inner.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.log.push(`remove ${key}`);
    if (this.failing.has('remove')) throw new Error('remove blocked');
    await this.inner.remove(key);
  }

  /** Every key that holds something, sorted (what the storage really has, whatever it was made to refuse). */
  keys(): string[] {
    return this.inner.keys();
  }
}

/**
 * A storage whose every operation takes a real moment (a macrotask), the way a native bridge or IndexedDB does: writes asked for one after another overlap in time, and a page can have several on their way.
 * (The browser's own `localStorage` finishes inside one task, which is why nothing in the page has ever had two writes in flight.)
 */
export class SlowStorage implements StorageAdapter {
  readonly inner = new MemoryStorage();
  constructor(private readonly ms = 2) {}

  private wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.ms));
  }
  async get(key: string): Promise<string | null> {
    await this.wait();
    return this.inner.get(key);
  }
  async set(key: string, value: string): Promise<void> {
    await this.wait();
    await this.inner.set(key, value);
  }
  async remove(key: string): Promise<void> {
    await this.wait();
    await this.inner.remove(key);
  }

  keys(): string[] {
    return this.inner.keys();
  }
}
