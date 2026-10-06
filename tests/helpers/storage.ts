import { MemoryStorage, type StorageAdapter } from '@/save/StorageAdapter';

/** A storage that can be made to misbehave, the way real ones do: private browsing, a full disk, a write that is silently lost. */
export class FlakyStorage implements StorageAdapter {
  readonly inner = new MemoryStorage();
  /** Operations that throw (`get`, `set`, `remove`), or are skipped without a word (`dropSets`). */
  failing = new Set<'get' | 'set' | 'remove'>();
  dropSets = false;
  /** Fail the n-th `set` call (1-based) once, then work normally. */
  failSetNumber = 0;
  private sets = 0;
  readonly log: string[] = [];

  async get(key: string): Promise<string | null> {
    if (this.failing.has('get')) throw new Error('get blocked');
    return this.inner.get(key);
  }
  async set(key: string, value: string): Promise<void> {
    this.sets++;
    this.log.push(`set ${key}`);
    if (this.failing.has('set') || this.sets === this.failSetNumber) throw new Error('quota exceeded');
    if (this.dropSets) return;
    await this.inner.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.log.push(`remove ${key}`);
    if (this.failing.has('remove')) throw new Error('remove blocked');
    await this.inner.remove(key);
  }
}
