// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { findPreferences, NativeStorage, nativeStorage, type CapacitorGlobal, type PreferencesPlugin } from '@/app/nativeStorage';
import { isDurable, LocalStorageAdapter, openStorage } from '@/app/storage';
import { newProgress } from '@/save/ProgressData';
import { ProgressStore } from '@/save/ProgressStore';
import { SaveSlots } from '@/save/SaveSlots';
import { MemoryStorage } from '@/save/StorageAdapter';

/**
 * THE SAVED GAMES IN A NATIVE SHELL (docs/PROMPT20-LOG.md): inside a Capacitor app the game keeps its saves in the platform's preferences store. Nothing here runs on a device — what is proven is the CONTRACT: a fake of the
 * plugin's documented `get` / `set` / `remove`, the way the page finds it, the check that it works before it is trusted, and the whole save stack running over it (the same one that runs over `localStorage`).
 */

/** A fake of `@capacitor/preferences`: a map behind the documented calls (and the way its native side fails when told to). */
function fakePlugin(over: Partial<PreferencesPlugin> = {}): PreferencesPlugin & { data: Map<string, string>; calls: string[] } {
  const data = new Map<string, string>();
  const calls: string[] = [];
  return {
    data,
    calls,
    get: async ({ key }) => (calls.push(`get:${key}`), { value: data.get(key) ?? null }),
    set: async ({ key, value }) => (calls.push(`set:${key}`), void data.set(key, value)),
    remove: async ({ key }) => (calls.push(`remove:${key}`), void data.delete(key)),
    ...over,
  };
}
const shell = (plugin: PreferencesPlugin | undefined, over: Partial<CapacitorGlobal> = {}): CapacitorGlobal => ({ isNativePlatform: () => true, Plugins: plugin ? { Preferences: plugin } : {}, ...over });

describe('finding the plugin', () => {
  it('a page that is not in a native shell has none (a web page, or a shell that says it is not native)', () => {
    expect(findPreferences(undefined)).toBeNull();
    expect(findPreferences({})).toBeNull();
    expect(findPreferences(shell(fakePlugin(), { isNativePlatform: () => false }))).toBeNull();
    expect(findPreferences({ Plugins: { Preferences: fakePlugin() } })).toBeNull();
  });

  it('is the one the shell registered under its name', () => {
    const plugin = fakePlugin();
    expect(findPreferences(shell(plugin))).toBe(plugin);
  });

  it('or the one the shell hands over when it is asked for by name', () => {
    const plugin = fakePlugin();
    const asked: string[] = [];
    expect(findPreferences(shell(undefined, { registerPlugin: (name) => (asked.push(name), plugin) }))).toBe(plugin);
    expect(asked).toEqual(['Preferences']);
  });

  it('a shell built without the plugin, or with something that is not it, has none — and a shell that throws when asked is not a crash', () => {
    expect(findPreferences(shell(undefined))).toBeNull();
    expect(findPreferences(shell(undefined, { Plugins: { Preferences: { get: () => 1 } } }))).toBeNull();
    expect(findPreferences(shell(undefined, { registerPlugin: () => ({}) }))).toBeNull();
    expect(findPreferences(shell(undefined, { registerPlugin: () => { throw new Error('"Preferences" plugin is not implemented on ios'); } }))).toBeNull();
  });
});

describe('the store over the plugin', () => {
  it('keeps, gives back and forgets a text, with the calls the plugin documents', async () => {
    const plugin = fakePlugin();
    const store = new NativeStorage(plugin);
    expect(await store.get('k')).toBeNull();
    await store.set('k', 'hello');
    expect(await store.get('k')).toBe('hello');
    await store.set('k', 'hello again');
    expect(await store.get('k')).toBe('hello again');
    await store.remove('k');
    expect(await store.get('k')).toBeNull();
    expect(plugin.calls).toEqual(['get:k', 'set:k', 'get:k', 'set:k', 'get:k', 'remove:k', 'get:k']);
  });

  it('a value the plugin gives back that is not a text is nothing saved (never a crash, never "null" as a game)', async () => {
    const store = new NativeStorage(fakePlugin({ get: async () => ({ value: null }) }));
    expect(await store.get('k')).toBeNull();
    expect(await new NativeStorage(fakePlugin({ get: async () => ({}) as never })).get('k')).toBeNull();
    expect(await new NativeStorage(fakePlugin({ get: async () => undefined as never })).get('k')).toBeNull();
    expect(await new NativeStorage(fakePlugin({ get: async () => ({ value: 7 as never }) })).get('k')).toBeNull();
  });

  it('a plugin that fails is a read or a write that fails: the stores above report it and the game goes on', async () => {
    const boom = new NativeStorage(fakePlugin({ set: async () => { throw new Error('disk full'); }, get: async () => { throw new Error('locked'); } }));
    await expect(boom.set('k', 'v')).rejects.toThrow('disk full');
    await expect(boom.get('k')).rejects.toThrow('locked');
  });
});

describe('trusting it with a game', () => {
  it('only after it has kept a text, given it back and forgotten it — and the probe leaves nothing behind', async () => {
    const plugin = fakePlugin();
    const store = await nativeStorage(shell(plugin));
    expect(store).toBeInstanceOf(NativeStorage);
    expect(plugin.data.size, 'no probe left in the store').toBe(0);
    expect(plugin.calls.map((c) => c.split(':')[0])).toEqual(['set', 'get', 'remove']);
  });

  it('a store that keeps nothing, that gives back something else or that throws is NOT trusted: the page keeps the web\'s own storage', async () => {
    expect(await nativeStorage(shell(fakePlugin({ set: async () => undefined })))).toBeNull();
    expect(await nativeStorage(shell(fakePlugin({ get: async () => ({ value: 'something else' }) })))).toBeNull();
    expect(await nativeStorage(shell(fakePlugin({ set: async () => { throw new Error('not implemented'); } })))).toBeNull();
    expect(await nativeStorage(undefined)).toBeNull();
    expect(await nativeStorage(shell(undefined))).toBeNull();
  });
});

describe('the page opens the storage that suits where it runs', () => {
  const win = window as unknown as { Capacitor?: unknown };
  afterEach(() => {
    delete win.Capacitor;
  });

  it('a web page: the browser\'s', async () => {
    expect(await openStorage()).toBeInstanceOf(LocalStorageAdapter);
  });

  it('a native shell with the plugin: its preferences store — durable', async () => {
    win.Capacitor = shell(fakePlugin());
    const storage = await openStorage();
    expect(storage).toBeInstanceOf(NativeStorage);
    expect(isDurable(storage)).toBe(true);
  });

  it('a native shell whose plugin does not work, or that has none: the browser\'s, not a crash and not a store in memory', async () => {
    win.Capacitor = shell(fakePlugin({ get: async () => { throw new Error('nope'); } }));
    expect(await openStorage()).toBeInstanceOf(LocalStorageAdapter);
    win.Capacitor = shell(undefined);
    expect(await openStorage()).toBeInstanceOf(LocalStorageAdapter);
  });
});

describe('the whole save stack over the native store', () => {
  it('saves a game, closes, opens again and finds it: the progress, three slots, a backup of the last good copy', async () => {
    const plugin = fakePlugin();
    const first = new SaveSlots(new NativeStorage(plugin));
    const game = newProgress({ room: 'r1_gate', entry: 'start' }, ['dash']);
    game.flags = ['defeated:r1_slime', 'completed:adventure'];
    expect(await first.store(1).save(game)).toBe(true);
    expect(await first.store(2).save({ ...game, flags: ['taken:air_dash'] })).toBe(true);
    // a second write keeps the first as the backup until it is known to have landed, and leaves none behind when it has
    expect(await first.store(1).save({ ...game, flags: [...game.flags, 'broken:r3_seal'] })).toBe(true);
    expect([...plugin.data.keys()].sort()).toEqual(['troid.progress', 'troid.progress.2']);

    // another process opens the same store
    const again = new SaveSlots(new NativeStorage(plugin));
    const loaded = await again.store(1).load();
    expect(loaded?.flags).toEqual(['broken:r3_seal', 'completed:adventure', 'defeated:r1_slime']);
    expect((await again.store(2).load())?.flags).toEqual(['taken:air_dash']);
  });

  it('a game that cannot be read is kept aside and the good backup is the one that opens', async () => {
    const plugin = fakePlugin();
    const store = new ProgressStore(new NativeStorage(plugin));
    const game = newProgress({ room: 'r2_hall', entry: 'west' });
    await store.save(game);
    plugin.data.set('troid.progress.bak', plugin.data.get('troid.progress')!);
    plugin.data.set('troid.progress', '{"saveVersion":2,"at":'); // a write that stopped halfway
    const loaded = await new ProgressStore(new NativeStorage(plugin)).load();
    expect(loaded?.at).toEqual({ room: 'r2_hall', entry: 'west' });
    expect(plugin.data.get('troid.progress.corrupt')).toBe('{"saveVersion":2,"at":');
  });

  it('is a different store from the memory one: what the memory one forgets with the page, this keeps', async () => {
    expect(isDurable(new NativeStorage(fakePlugin()))).toBe(true);
    expect(isDurable(new MemoryStorage())).toBe(false);
  });
});
