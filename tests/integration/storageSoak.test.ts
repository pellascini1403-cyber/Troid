import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, repairSettings, serializeSettings } from '@/save/SettingsData';
import { SettingsStore } from '@/save/SettingsStore';
import { MemoryStorage, type StorageAdapter } from '@/save/StorageAdapter';

/**
 * SOAK of the settings' persistence (docs/PROMPT5-LOG.md S20): hundreds of changes and COLD STARTS against a storage that misbehaves the
 * way real ones do — a write that throws before storing, one that stores and then throws, one that stores only the first part of the
 * text, one that is lost without a word, a removal that fails — and a process that is killed in the middle of a save. The promise of
 * `SettingsStore` is that whatever stops in the middle leaves a good copy behind. So after ANY of that, a clean load must give valid
 * settings that are NEVER OLDER than the last change that reported success: either that one, or one asked for after it.
 */
const SEEDS = Array.from({ length: Math.max(8, Number(process.env['SOAK_SEEDS'] ?? 8)) }, (_, i) => [1, 2, 3, 5, 8, 13, 21, 34][i] ?? 100 + i * 3571);
const OPS = Math.max(300, Number(process.env['SOAK_TICKS'] ?? 600));
const LANGS = [null, 'es', 'en', 'fr', 'ES', 'xx9', 'pt'];

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** A store whose writes go wrong at random, and that can be told that the process was killed. */
class ChaosStorage {
  readonly inner = new MemoryStorage();
  faults = false;
  /** The last storage calls and what became of them: a violation says how it came about. */
  readonly history: string[] = [];
  note(what: string): void {
    this.history.push(what);
    if (this.history.length > 16) this.history.shift();
  }
  stats = { threw: 0, storedThenThrew: 0, partial: 0, lost: 0, removeFailed: 0, killed: 0 };
  constructor(private readonly rnd: () => number) {}

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
        const name = key.replace('troid.settings', 'main');
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
        const name = key.replace('troid.settings', 'main');
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

async function run(seed: number): Promise<{ violations: string[]; stats: ChaosStorage['stats']; coldStarts: number; committed: number }> {
  const rnd = lcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const violations: string[] = [];
  const bad = (what: string): void => {
    if (violations.length < 8) violations.push(`seed ${seed}: ${what}`);
  };
  const storage = new ChaosStorage(lcg(seed ^ 0x5bd1e995));
  let handle = storage.handle();
  let store = new SettingsStore(handle);
  let coldStarts = 0;
  let committedWrites = 0;

  // what a clean load may give right now: the text of the last change that reported success, or of any asked for after it
  let issued: string[] = [serializeSettings(defaultSettings())];
  let lastCommit = 0;
  const pending: Array<Promise<void>> = [];

  const coldStart = async (killFirst: boolean): Promise<void> => {
    if (killFirst) handle.kill(); // the process dies where it stands: writes in flight stop at their next storage call
    else await Promise.all(pending);
    await Promise.allSettled(pending);
    pending.length = 0;
    coldStarts++;
    handle = storage.handle();
    store = new SettingsStore(handle);
    const before = Object.fromEntries(await Promise.all(storage.inner.keys().map(async (k) => [k.replace('troid.settings', 'main'), (await storage.inner.get(k))?.slice(0, 40)])));
    storage.note(`-- cold start; the storage holds ${JSON.stringify(before)}`);
    const wasFaulty = storage.faults;
    storage.faults = false; // the start-up itself reads a reliable store; it is the SAVING that goes wrong
    const loaded = await store.load();
    storage.faults = wasFaulty;
    const text = serializeSettings(loaded);
    if (JSON.stringify(repairSettings(loaded)) !== JSON.stringify(loaded)) bad(`a load gave settings that are not valid: ${JSON.stringify(loaded)}`);
    if (!issued.slice(lastCommit).includes(text)) {
      bad(
        `after cold start ${coldStarts} the load gave ${text}, which is OLDER than the last change that reported success (index ${lastCommit} of ${issued.length - 1}; allowed: ${issued.slice(lastCommit).join(' | ')})` +
          `\n      storage calls: ${storage.history.join(' · ')}\n      killed first: ${killFirst}`,
      );
    }
    issued = [text];
    lastCommit = 0;
  };

  for (let i = 0; i < OPS; i++) {
    storage.faults = true;
    const r = rnd();
    if (r < 0.7) {
      // a change: the interface follows at once, the save goes on in the background
      const patch = rnd() < 0.5 ? { language: pick(LANGS) } : { touch: { scale: 0.5 + rnd() * 1.2, opacity: rnd() * 1.2 } };
      const promise = store.update(patch);
      const text = serializeSettings(store.value);
      issued.push(text);
      const index = issued.length - 1;
      const base = coldStarts;
      pending.push(
        promise.then((ok) => {
          if (ok && base === coldStarts) {
            lastCommit = Math.max(lastCommit, index);
            committedWrites++;
          }
        }),
      );
      if (rnd() < 0.5) await promise;
    } else if (r < 0.8) {
      await store.flush();
    } else if (r < 0.92) {
      await coldStart(false);
    } else {
      await coldStart(true); // killed mid-save
    }
  }
  storage.faults = false;
  await store.flush();
  await Promise.allSettled(pending);
  await coldStart(false); // and a last clean start
  // the storage holds nothing but the settings and, at most, their two safety copies
  for (const k of storage.inner.keys()) if (!['troid.settings', 'troid.settings.bak', 'troid.settings.corrupt'].includes(k)) bad(`a stray key "${k}"`);
  const main = await storage.inner.get('troid.settings');
  if (main !== null && parseSettings(main) === null && (await storage.inner.get('troid.settings.bak')) === null && committedWrites > 0) {
    // a damaged main is acceptable only while a good copy exists; after a clean load it must have been replaced or kept aside
    bad('the main file is damaged and there is no copy of it');
  }
  return { violations, stats: storage.stats, coldStarts, committed: committedWrites };
}

describe('settings persistence soak: changes and cold starts against a storage that fails, loses and truncates writes', () => {
  it('never loads anything but valid settings that are not older than the last saved change, on any seed', async () => {
    const results = await Promise.all(SEEDS.map((seed) => run(seed)));
    expect(results.flatMap((r) => r.violations)).toEqual([]);
    // it really was hostile: every kind of failure happened, a lot of starts, and a lot of changes were saved properly in between
    const sum = (f: (r: (typeof results)[number]) => number): number => results.reduce((n, r) => n + f(r), 0);
    expect(sum((r) => r.stats.threw)).toBeGreaterThan(30);
    expect(sum((r) => r.stats.storedThenThrew)).toBeGreaterThan(10);
    expect(sum((r) => r.stats.partial)).toBeGreaterThan(10);
    expect(sum((r) => r.stats.lost)).toBeGreaterThan(10);
    expect(sum((r) => r.stats.removeFailed)).toBeGreaterThan(5);
    expect(sum((r) => r.stats.killed)).toBeGreaterThan(5);
    expect(sum((r) => r.coldStarts)).toBeGreaterThan(100);
    expect(sum((r) => r.committed)).toBeGreaterThan(300);
  }, 280_000); // (a deeper hunt through SOAK_SEEDS / SOAK_TICKS may take a while)

  it('is deterministic: the same seed gives the same story', async () => {
    const a = await run(SEEDS[0]!);
    const b = await run(SEEDS[0]!);
    expect(b).toEqual(a);
  });
});
