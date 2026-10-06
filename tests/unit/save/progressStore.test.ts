import { describe, expect, it } from 'vitest';
import { newProgress, parseProgress, serializeProgress, type ProgressData } from '@/save/ProgressData';
import { ProgressStore } from '@/save/ProgressStore';
import { SettingsStore } from '@/save/SettingsStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import { FlakyStorage } from '../../helpers/storage';

/**
 * The progress store (docs/PROMPT6-LOG.md S24) is as hard to lose as the settings, because it is the same `SafeStore`: a `.bak` of the
 * last good copy, an unreadable copy KEPT as `.corrupt` instead of overwritten, every write read back, a damaged previous copy never
 * allowed to replace a good backup — and it never throws. These tests are the promises a player's save is held to.
 */
const KEY = 'troid.progress';
const start = { room: 'r1_gate', entry: 'start' };
const at = (flags: string[], over: Partial<ProgressData> = {}): ProgressData => ({ ...newProgress(start, ['dash']), flags, ...over });
const warnings = (): { list: string[]; warn: (m: string) => void } => {
  const list: string[] = [];
  return { list, warn: (m) => void list.push(m) };
};

describe('loading', () => {
  it('nothing saved: null (a new game), and nothing is written', async () => {
    const storage = new FlakyStorage();
    const store = new ProgressStore(storage);
    expect(await store.load()).toBeNull();
    expect(store.value).toBeNull();
    expect(storage.log).toEqual([]);
  });

  it('a saved game comes back as saved', async () => {
    const storage = new MemoryStorage();
    await storage.set(KEY, serializeProgress(at(['defeated:r1_slime'])));
    const store = new ProgressStore(storage);
    const p = await store.load();
    expect(p?.flags).toEqual(['defeated:r1_slime']);
    expect(store.value).toEqual(p);
  });

  it('an unreadable main copy is KEPT as `.corrupt` and the backup takes over (and the main copy is put right)', async () => {
    const storage = new MemoryStorage();
    const good = serializeProgress(at(['a', 'b']));
    await storage.set(KEY, '{"saveVersion":1,"fla');
    await storage.set(`${KEY}.bak`, good);
    const w = warnings();
    const store = new ProgressStore(storage, { warn: w.warn });
    expect((await store.load())?.flags).toEqual(['a', 'b']);
    expect(await storage.get(`${KEY}.corrupt`)).toBe('{"saveVersion":1,"fla');
    expect(await storage.get(KEY)).toBe(good);
    expect(w.list[0]).toContain('.corrupt');
    expect(w.list[0]).toContain('progress');
  });

  it('unreadable and no backup: null — a NEW game — and the damaged text is still kept, for whoever wants to look at it', async () => {
    const storage = new MemoryStorage();
    await storage.set(KEY, 'not json');
    const store = new ProgressStore(storage);
    expect(await store.load()).toBeNull();
    expect(await storage.get(`${KEY}.corrupt`)).toBe('not json');
  });

  it('a save from a LATER game (a newer version) is not read and not overwritten: it is kept aside', async () => {
    const storage = new MemoryStorage();
    const future = JSON.stringify({ saveVersion: 99, hello: 'from the future' });
    await storage.set(KEY, future);
    const store = new ProgressStore(storage);
    expect(await store.load()).toBeNull();
    expect(await storage.get(`${KEY}.corrupt`)).toBe(future);
  });

  it('both copies unreadable: a new game; a damaged backup is simply ignored', async () => {
    const storage = new MemoryStorage();
    await storage.set(KEY, 'garbage');
    await storage.set(`${KEY}.bak`, 'more garbage');
    expect(await new ProgressStore(storage).load()).toBeNull();
  });

  it('a storage that refuses to be read (private browsing) gives a new game and ONE warning, never an exception', async () => {
    const storage = new FlakyStorage();
    storage.failing.add('get');
    const w = warnings();
    const store = new ProgressStore(storage, { warn: w.warn });
    expect(await store.load()).toBeNull();
    expect(w.list).toHaveLength(1);
  });

  it('it never reads or writes the settings: a settings file under the progress key is not a save, and a save under another key is not read', async () => {
    const storage = new MemoryStorage();
    await new SettingsStore(storage).update({ language: 'es' });
    expect(await new ProgressStore(storage).load()).toBeNull();
    const s2 = new MemoryStorage();
    await s2.set('troid.settings', serializeProgress(at(['x'])));
    expect(await new ProgressStore(s2).load()).toBeNull();
  });
});

describe('saving', () => {
  it('a saved game reads back, and a second save keeps the first as the backup only while it is being replaced', async () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    expect(await store.save(at(['a']))).toBe(true);
    expect(parseProgress((await storage.get(KEY))!)?.flags).toEqual(['a']);
    expect(await storage.get(`${KEY}.bak`)).toBeNull();
    expect(await store.save(at(['a', 'b']))).toBe(true);
    expect(parseProgress((await storage.get(KEY))!)?.flags).toEqual(['a', 'b']);
    expect(await storage.get(`${KEY}.bak`)).toBeNull(); // the backup is removed once the new copy is known good
    expect(storage.keys()).toEqual([KEY]);
  });

  it('the value is in force at once, before the write has landed; and `flush` waits for it', async () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    const done = store.save(at(['a']));
    expect(store.value?.flags).toEqual(['a']);
    await store.flush();
    expect(await done).toBe(true);
    expect(await storage.get(KEY)).not.toBeNull();
  });

  it('what is written is repaired first: a bad value never reaches the storage', async () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    await store.save({ ...at(['ok']), flags: ['ok', '<script>', 'ok'], bottleSlots: 99 } as ProgressData);
    const back = parseProgress((await storage.get(KEY))!)!;
    expect(back.flags).toEqual(['ok']);
    expect(back.bottleSlots).toBe(8);
  });

  it('saving exactly what is already stored writes nothing', async () => {
    const storage = new FlakyStorage();
    const store = new ProgressStore(storage);
    await store.save(at(['a']));
    const sets = storage.log.filter((l) => l.startsWith('set')).length;
    await store.save(at(['a']));
    expect(storage.log.filter((l) => l.startsWith('set')).length).toBe(sets);
  });

  it('writes are SERIALISED: two quick saves reach the storage in order, and the last one wins', async () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    const a = store.save(at(['a']));
    const b = store.save(at(['a', 'b']));
    const c = store.save(at(['a', 'b', 'c']));
    expect(await Promise.all([a, b, c])).toEqual([true, true, true]);
    expect(parseProgress((await storage.get(KEY))!)?.flags).toEqual(['a', 'b', 'c']);
  });

  it('a write that throws (a full disk): `save` resolves false, the game keeps its value, ONE warning, and the last good copy is untouched', async () => {
    const storage = new FlakyStorage();
    const w = warnings();
    const store = new ProgressStore(storage, { warn: w.warn });
    await store.save(at(['a']));
    storage.failing.add('set');
    expect(await store.save(at(['a', 'b']))).toBe(false);
    expect(await store.save(at(['a', 'b', 'c']))).toBe(false);
    expect(store.value?.flags).toEqual(['a', 'b', 'c']);
    expect(w.list).toHaveLength(1);
    storage.failing.clear();
    expect(parseProgress((await storage.get(KEY))!)?.flags).toEqual(['a']);
  });

  it('a write that is silently LOST is noticed by the read-back: it resolves false and the previous copy is kept', async () => {
    const storage = new FlakyStorage();
    const w = warnings();
    const store = new ProgressStore(storage, { warn: w.warn });
    await store.save(at(['a']));
    storage.dropSets = true;
    expect(await store.save(at(['a', 'b']))).toBe(false);
    storage.dropSets = false;
    expect(parseProgress((await storage.get(KEY))!)?.flags).toEqual(['a']);
    expect(w.list[0]).toContain('read back');
  });

  it('a DAMAGED previous copy never replaces the good backup', async () => {
    const storage = new MemoryStorage();
    const good = serializeProgress(at(['good']));
    await storage.set(`${KEY}.bak`, good);
    await storage.set(KEY, '{"saveVersion":1,"flags":["tru'); // a write that stopped halfway
    const store = new ProgressStore(storage);
    expect(await store.save(at(['good', 'newer']))).toBe(true);
    expect(parseProgress((await storage.get(KEY))!)?.flags).toEqual(['good', 'newer']);
    expect(await storage.get(`${KEY}.bak`)).toBe(good); // untouched
  });
});

describe('a new game', () => {
  it('erase forgets the save, its backup and its damaged copy, and the value is null', async () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    await store.save(at(['a']));
    await storage.set(`${KEY}.bak`, 'x');
    await storage.set(`${KEY}.corrupt`, 'y');
    expect(await store.erase()).toBe(true);
    expect(store.value).toBeNull();
    expect(storage.keys()).toEqual([]);
    expect(await new ProgressStore(storage).load()).toBeNull();
  });

  it('erase waits for the saves already asked for (it cannot be undone by a write that was on its way)', async () => {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    void store.save(at(['a']));
    await store.erase();
    expect(storage.keys()).toEqual([]);
  });

  it('erase on a storage that refuses: false, a warning, never an exception', async () => {
    const storage = new FlakyStorage();
    storage.failing.add('remove');
    const w = warnings();
    const store = new ProgressStore(storage, { warn: w.warn });
    expect(await store.erase()).toBe(false);
    expect(w.list[0]).toContain('could not be erased');
  });
});
