import { MemoryStorage, type StorageAdapter } from '@/save/StorageAdapter';

/** A seeded generator (a linear congruential one): the same seed gives the same story. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/**
 * A store whose writes go wrong at random, the way real ones do — a write that throws before storing, one that stores and then
 * throws, one that stores only the first part of the text, one that is lost without a word, a removal that fails — and a process that is
 * killed in the middle of a save (docs/PROMPT5-LOG.md S20). Shared by the soak of the settings and the soak of the progress: they are
 * promised the same hardness.
 */
export class ChaosStorage {
  readonly inner = new MemoryStorage();
  faults = false;
  /** The last storage calls and what became of them: a violation says how it came about. */
  readonly history: string[] = [];
  stats = { threw: 0, storedThenThrew: 0, partial: 0, lost: 0, removeFailed: 0, killed: 0 };

  constructor(
    private readonly rnd: () => number,
    /** The main key, shortened to "main" in `history`. */
    private readonly mainKey: string,
  ) {}

  note(what: string): void {
    this.history.push(what);
    if (this.history.length > 16) this.history.shift();
  }

  /** The view one process has of the store: once `kill()`ed, nothing it does reaches the storage (it is gone). */
  handle(): StorageAdapter & { kill(): void } {
    let dead = false;
    const gone = (): never => {
      this.stats.killed++;
      throw new Error('the process is gone');
    };
    return {
      kill: () => void (dead = true),
      get: async (key) => (dead ? gone() : this.inner.get(key)),
      set: async (key, value) => {
        if (dead) gone();
        const name = key.replace(this.mainKey, 'main');
        if (this.faults) {
          const r = this.rnd();
          if (r < 0.07) {
            this.stats.threw++;
            this.note(`set ${name}: THREW before storing`);
            throw new Error('quota exceeded');
          }
          if (r < 0.1) {
            await this.inner.set(key, value);
            this.stats.storedThenThrew++;
            this.note(`set ${name}: stored, then THREW`);
            throw new Error('the write was stored, but the call failed');
          }
          if (r < 0.13) {
            await this.inner.set(key, value.slice(0, Math.floor(this.rnd() * value.length)));
            this.stats.partial++;
            this.note(`set ${name}: PARTIAL`);
            return;
          }
          if (r < 0.16) {
            this.stats.lost++;
            this.note(`set ${name}: LOST`);
            return;
          }
        }
        this.note(`set ${name}`);
        await this.inner.set(key, value);
      },
      remove: async (key) => {
        if (dead) gone();
        const name = key.replace(this.mainKey, 'main');
        if (this.faults && this.rnd() < 0.1) {
          this.stats.removeFailed++;
          this.note(`remove ${name}: FAILED`);
          throw new Error('remove blocked');
        }
        this.note(`remove ${name}`);
        await this.inner.remove(key);
      },
    };
  }
}
