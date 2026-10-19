import { describe, expect, it } from 'vitest';
import { SafeStore } from '@/save/SafeStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import { FlakyStorage } from '../../helpers/storage';

/**
 * The store both the settings and the progress are built on (docs/PROMPT6-LOG.md S24). Here with a trivial model — a number in
 * a text — to show that the safety belongs to the store and not to what is stored: another model gets it for free.
 */
const parse = (text: string): number | null => (/^\d+$/.test(text) ? Number(text) : null);
const make = (storage: MemoryStorage | FlakyStorage, warn?: (m: string) => void) => new SafeStore<number>(storage, { key: 'k', label: 'numbers', parse, ...(warn ? { warn } : {}) });

describe('SafeStore', () => {
  it('loads what the model accepts, and null when there is nothing', async () => {
    const storage = new MemoryStorage();
    expect(await make(storage).load()).toBeNull();
    await storage.set('k', '42');
    expect(await make(storage).load()).toBe(42);
  });

  it('keeps a text the model refuses as `.corrupt` and falls back to a good `.bak`; the messages name what is stored', async () => {
    const storage = new MemoryStorage();
    await storage.set('k', 'oops');
    await storage.set('k.bak', '7');
    const said: string[] = [];
    expect(await make(storage, (m) => said.push(m)).load()).toBe(7);
    expect(await storage.get('k.corrupt')).toBe('oops');
    expect(await storage.get('k')).toBe('7');
    expect(said).toEqual(['the saved numbers are unreadable; they are kept as "k.corrupt"']);
  });

  it('writes in order, reads back, removes the backup, and skips a write of what is already there', async () => {
    const storage = new FlakyStorage();
    const store = make(storage);
    await Promise.all([store.write('1'), store.write('2'), store.write('3')]);
    expect(await storage.get('k')).toBe('3');
    expect(await storage.get('k.bak')).toBeNull();
    const sets = storage.log.length;
    expect(await store.write('3')).toBe(true);
    expect(storage.log.length).toBe(sets);
  });

  it('a model that refuses the previous copy never lets it replace the backup', async () => {
    const storage = new MemoryStorage();
    await storage.set('k.bak', '5');
    await storage.set('k', 'half-writ');
    expect(await make(storage).write('6')).toBe(true);
    expect(await storage.get('k.bak')).toBe('5');
  });

  it('erase removes the value and both copies, after the writes already asked for; and `flush` waits', async () => {
    const storage = new MemoryStorage();
    const store = make(storage);
    void store.write('1');
    await storage.set('k.bak', '0');
    await storage.set('k.corrupt', 'x');
    expect(await store.erase()).toBe(true);
    await store.flush();
    expect(storage.keys()).toEqual([]);
  });

  it('never throws: a storage that fails to read, write or remove is a warning (one), not an exception', async () => {
    const storage = new FlakyStorage();
    storage.failing = new Set(['get', 'set', 'remove']);
    const said: string[] = [];
    const store = make(storage, (m) => said.push(m));
    expect(await store.load()).toBeNull();
    expect(await store.write('1')).toBe(false);
    expect(await store.erase()).toBe(false);
    expect(said).toHaveLength(1);
  });
});

describe('SafeStore.inspect: a look that changes nothing', () => {
  it('finds nothing, a good value, a value that had to be recovered from the backup, or only what cannot be read', async () => {
    const storage = new MemoryStorage();
    const store = make(storage);
    expect(await store.inspect()).toEqual({ state: 'empty' });
    await storage.set('k', '42');
    expect(await store.inspect()).toEqual({ state: 'ok', value: 42, recovered: false });
    await storage.set('k', 'oops');
    await storage.set('k.bak', '7');
    expect(await store.inspect()).toEqual({ state: 'ok', value: 7, recovered: true });
    await storage.set('k.bak', 'also oops');
    expect(await store.inspect()).toEqual({ state: 'damaged' });
  });

  it('a copy that a load filed as `.corrupt` still counts as something the player has: damaged, not empty', async () => {
    const storage = new MemoryStorage();
    await storage.set('k.corrupt', 'oops');
    expect(await make(storage).inspect()).toEqual({ state: 'damaged' });
  });

  it('writes NOTHING: not the `.corrupt` copy a load would make, nor the good backup put back in force', async () => {
    const storage = new FlakyStorage();
    await storage.inner.set('k', 'oops');
    await storage.inner.set('k.bak', '7');
    const before = JSON.stringify([...(['k', 'k.bak', 'k.corrupt'] as const)].map((k) => storage.inner.get(k)));
    await make(storage).inspect();
    expect(storage.log, 'no set, no remove').toEqual([]);
    expect(JSON.stringify([...(['k', 'k.bak', 'k.corrupt'] as const)].map((k) => storage.inner.get(k)))).toBe(before);
    expect(await storage.get('k.corrupt')).toBeNull();
  });

  it('looks AFTER the writes already asked for, so it sees the latest', async () => {
    const storage = new MemoryStorage();
    const store = make(storage);
    void store.write('1');
    void store.write('2');
    expect(await store.inspect()).toEqual({ state: 'ok', value: 2, recovered: false });
  });

  it('never throws: a storage that cannot be read is one that has nothing to show', async () => {
    const storage = new FlakyStorage();
    storage.failing = new Set(['get']);
    expect(await make(storage).inspect()).toEqual({ state: 'empty' });
  });
});

describe('SafeStore.restart: a new game here without losing what could not be read', () => {
  it('a good value and its backup go, on purpose (the caller has asked the player)', async () => {
    const storage = new MemoryStorage();
    await storage.set('k', '42');
    await storage.set('k.bak', '41');
    expect(await make(storage).restart()).toBe(true);
    expect(storage.keys()).toEqual([]);
  });

  it('an unreadable main copy is FILED as `.corrupt` first: a person can still recover it by hand', async () => {
    const storage = new MemoryStorage();
    await storage.set('k', 'half-writ');
    expect(await make(storage).restart()).toBe(true);
    expect(await storage.get('k')).toBeNull();
    expect(await storage.get('k.corrupt')).toBe('half-writ');
  });

  it('a copy already filed as damaged is not touched by it, but `erase` — a delete the player asked for by name — takes it too', async () => {
    const storage = new MemoryStorage();
    await storage.set('k.corrupt', 'old damage');
    await storage.set('k', '5');
    const store = make(storage);
    await store.restart();
    expect(await storage.get('k.corrupt')).toBe('old damage');
    await store.erase();
    expect(storage.keys()).toEqual([]);
  });

  it('runs after the writes already asked for (a late save cannot bring the old game back), and never throws', async () => {
    const storage = new MemoryStorage();
    const store = make(storage);
    void store.write('1');
    await store.restart();
    expect(storage.keys()).toEqual([]);
    const flaky = new FlakyStorage();
    flaky.failing = new Set(['get', 'set', 'remove']);
    expect(await make(flaky).restart()).toBe(false);
  });
});

