import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/save/SettingsData';
import { SettingsStore } from '@/save/SettingsStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import { FlakyStorage } from '../../helpers/storage';

/**
 * The settings store (docs/ARCHITECTURE-2D.md §11): safe writes (`.bak` → new → read back → drop the `.bak`), loading that falls
 * back from the main copy to the backup to the defaults while KEEPING what it could not read, and a platform that misbehaves
 * (private browsing, a full disk, a write that is lost) never takes the game down.
 */
const KEY = 'troid.settings';
const warnings = (): { list: string[]; warn: (m: string) => void } => {
  const list: string[] = [];
  return { list, warn: (m) => void list.push(m) };
};
const saved = (language: string, scale = 1): string => JSON.stringify({ version: 1, language, touch: { scale, opacity: 1 } });

describe('loading', () => {
  it('nothing saved: the defaults, and nothing is written (a new player leaves no trace until they change something)', async () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    expect(await store.load()).toEqual(defaultSettings());
    expect(storage.keys()).toEqual([]);
  });

  it('a saved value is the one in force', async () => {
    const storage = new MemoryStorage();
    await storage.set(KEY, saved('es', 1.2));
    const store = new SettingsStore(storage);
    const s = await store.load();
    expect(s.language).toBe('es');
    expect(s.touch.scale).toBe(1.2);
    expect(store.value).toBe(s);
  });

  it('an unreadable main copy is KEPT as `.corrupt` and the backup takes over (and the main copy is put right)', async () => {
    const storage = new MemoryStorage();
    await storage.set(KEY, '{"version":1,"lang');
    await storage.set(`${KEY}.bak`, saved('en'));
    const w = warnings();
    const store = new SettingsStore(storage, { warn: w.warn });
    expect((await store.load()).language).toBe('en');
    expect(await storage.get(`${KEY}.corrupt`)).toBe('{"version":1,"lang');
    expect(await storage.get(KEY)).toBe(saved('en')); // healed
    expect(w.list).toHaveLength(1);
    expect(w.list[0]).toContain('.corrupt');
  });

  it('unreadable main copy and no backup: the defaults, and the damaged text is still kept', async () => {
    const storage = new MemoryStorage();
    await storage.set(KEY, 'not json');
    const store = new SettingsStore(storage);
    expect(await store.load()).toEqual(defaultSettings());
    expect(await storage.get(`${KEY}.corrupt`)).toBe('not json');
  });

  it('a value from a LATER game is not read, not overwritten silently: it is kept aside and the defaults are used', async () => {
    const storage = new MemoryStorage();
    const future = '{"version":5,"language":"fr","hologram":true}';
    await storage.set(KEY, future);
    const store = new SettingsStore(storage);
    expect(await store.load()).toEqual(defaultSettings());
    expect(await storage.get(`${KEY}.corrupt`)).toBe(future);
  });

  it('both copies unreadable: the defaults; a damaged backup is simply ignored', async () => {
    const storage = new MemoryStorage();
    await storage.set(KEY, '[');
    await storage.set(`${KEY}.bak`, '{');
    expect(await new SettingsStore(storage).load()).toEqual(defaultSettings());
  });

  it('a storage that refuses to be read (private browsing) gives the defaults and one warning, never an exception', async () => {
    const storage = new FlakyStorage();
    storage.failing.add('get');
    const w = warnings();
    const store = new SettingsStore(storage, { warn: w.warn });
    await expect(store.load()).resolves.toEqual(defaultSettings());
    expect(w.list).toHaveLength(1);
  });
});

describe('saving', () => {
  it('a change is applied at once and written: the text is exactly the repaired settings', async () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    await store.load();
    const done = store.update({ language: 'es' });
    expect(store.value.language).toBe('es'); // before the write finishes
    expect(await done).toBe(true);
    expect(JSON.parse((await storage.get(KEY)) ?? '')).toEqual({ version: 1, language: 'es', touch: { scale: 1, opacity: 1 } });
  });

  it('a patch changes only what it names: the touch settings merge field by field', async () => {
    const store = new SettingsStore(new MemoryStorage());
    await store.load();
    await store.update({ language: 'en', touch: { scale: 1.3 } });
    await store.update({ touch: { opacity: 0.5 } });
    expect(store.value).toEqual({ version: 1, language: 'en', touch: { scale: 1.3, opacity: 0.5 } });
    await store.update({ language: null });
    expect(store.value.language).toBeNull();
  });

  it('a bad value is repaired on the way in: the interface and the storage never see it', async () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    await store.load();
    await store.update({ touch: { scale: 50, opacity: -2 }, language: 'xx-YY' });
    expect(store.value).toEqual({ version: 1, language: null, touch: { scale: 1.4, opacity: 0.3 } });
    expect(JSON.parse((await storage.get(KEY)) ?? '').touch).toEqual({ scale: 1.4, opacity: 0.3 });
  });

  it('the write order is `.bak` ← previous, main ← new, read back, drop the `.bak`: nothing is left over when it all goes well', async () => {
    const storage = new FlakyStorage();
    const store = new SettingsStore(storage);
    await store.load();
    await store.update({ language: 'es' });
    storage.log.length = 0;
    await store.update({ language: 'en' });
    expect(storage.log).toEqual([`set ${KEY}.bak`, `set ${KEY}`, `remove ${KEY}.bak`]);
    expect(storage.inner.keys()).toEqual([KEY]);
  });

  it('the first write of all has nothing to back up', async () => {
    const storage = new FlakyStorage();
    const store = new SettingsStore(storage);
    await store.load();
    await store.update({ language: 'es' });
    expect(storage.log).toEqual([`set ${KEY}`]);
  });

  it('writing the same thing again touches nothing it does not have to', async () => {
    const storage = new FlakyStorage();
    const store = new SettingsStore(storage);
    await store.load();
    await store.update({ language: 'es' });
    storage.log.length = 0;
    await store.update({ language: 'es' });
    expect(storage.log).toEqual([`set ${KEY}`]); // no `.bak` of an identical value
  });

  it('two quick changes reach the storage in order and the last one wins', async () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    await store.load();
    const a = store.update({ language: 'es' });
    const b = store.update({ language: 'en' });
    const c = store.update({ touch: { scale: 1.1 } });
    expect(await Promise.all([a, b, c])).toEqual([true, true, true]);
    expect(JSON.parse((await storage.get(KEY)) ?? '')).toEqual({ version: 1, language: 'en', touch: { scale: 1.1, opacity: 1 } });
  });

  it('`changed` announces every change, with the new settings', async () => {
    const store = new SettingsStore(new MemoryStorage());
    await store.load();
    const seen: Array<string | null> = [];
    store.changed.subscribe((s) => void seen.push(s.language));
    await store.update({ language: 'es' });
    await store.update({ language: 'en' });
    expect(seen).toEqual(['es', 'en']);
  });

  it('`flush` waits for every write asked for so far', async () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    await store.load();
    void store.update({ language: 'es' });
    void store.update({ touch: { opacity: 0.4 } });
    await store.flush();
    expect(JSON.parse((await storage.get(KEY)) ?? '')).toMatchObject({ language: 'es', touch: { opacity: 0.4 } });
  });
});

describe('a storage that misbehaves never takes the game down', () => {
  it('writes that throw (a full disk, private browsing): `update` resolves false, the game keeps the new value, one warning', async () => {
    const storage = new FlakyStorage();
    storage.failing.add('set');
    const w = warnings();
    const store = new SettingsStore(storage, { warn: w.warn });
    await store.load();
    expect(await store.update({ language: 'es' })).toBe(false);
    expect(await store.update({ language: 'en' })).toBe(false);
    expect(store.value.language).toBe('en');
    expect(w.list).toHaveLength(1);
  });

  it('a write that is silently LOST is noticed when it is read back: false, and the previous copy stays as the backup', async () => {
    const storage = new FlakyStorage();
    const store = new SettingsStore(storage);
    await store.load();
    await store.update({ language: 'es' });
    const good = await storage.get(KEY);
    storage.dropSets = true;
    const w = warnings();
    const lossy = new SettingsStore(storage, { warn: w.warn });
    await lossy.load();
    expect(await lossy.update({ language: 'en' })).toBe(false);
    expect(await storage.get(KEY)).toBe(good); // the main copy is untouched
    expect(w.list[0]).toContain('read back');
  });

  it('a write interrupted between the backup and the main copy leaves a good copy: the next load finds it', async () => {
    const storage = new FlakyStorage();
    const first = new SettingsStore(storage);
    await first.load();
    await first.update({ language: 'es' });
    storage.failSetNumber = 3; // the 1st update was set #1; the 2nd: set bak (#2) works, set main (#3) fails — power lost after the backup
    const second = new SettingsStore(storage);
    await second.load();
    expect(await second.update({ language: 'en' })).toBe(false);
    const next = new SettingsStore(storage);
    expect((await next.load()).language).toBe('es'); // the previous value, intact in the main copy (and in the `.bak`)
  });

  it('a `remove` that fails after a good write is not a failed save: the value is there, the leftover backup is harmless', async () => {
    const storage = new FlakyStorage();
    const store = new SettingsStore(storage);
    await store.load();
    await store.update({ language: 'es' });
    storage.failing.add('remove');
    const result = await store.update({ language: 'en' });
    expect(result).toBe(false); // reported, because the contract (nothing left over) was not met
    expect((await new SettingsStore(storage).load()).language).toBe('en');
  });
});
