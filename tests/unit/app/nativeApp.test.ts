import { describe, expect, it } from 'vitest';
import { attachNativeApp, findApp, type AppPlugin } from '@/app/nativeApp';
import type { CapacitorGlobal } from '@/app/nativeStorage';

/**
 * THE GAME IN A NATIVE SHELL, the part about the app around it (docs/PROMPT20-LOG.md): the Back button of an Android phone is the pause key and the app going to the background is the pause. Nothing here runs on
 * a device — what is proven is the CONTRACT: a fake of the plugin's documented `addListener` (which answers a promise of a handle that removes the listener), the way the page finds it, and a shell that misbehaves.
 */
function fakeApp(over: Partial<AppPlugin> = {}): AppPlugin & { listeners: Map<string, (data: { isActive?: boolean }) => void>; removed: string[] } {
  const listeners = new Map<string, (data: { isActive?: boolean }) => void>();
  const removed: string[] = [];
  return {
    listeners,
    removed,
    addListener: (event, listener) => {
      listeners.set(event, listener);
      return Promise.resolve({ remove: async () => void removed.push(event) });
    },
    ...over,
  };
}
const shell = (plugin: unknown, over: Partial<CapacitorGlobal> = {}): CapacitorGlobal => ({ isNativePlatform: () => true, Plugins: plugin ? { App: plugin } : {}, ...over });
const handlers = (): { calls: string[]; back: () => void; background: () => void } => {
  const calls: string[] = [];
  return { calls, back: () => void calls.push('back'), background: () => void calls.push('background') };
};
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('finding the plugin', () => {
  it('a web page, or a shell that says it is not native, has none', () => {
    expect(findApp(undefined)).toBeNull();
    expect(findApp({})).toBeNull();
    expect(findApp(shell(fakeApp(), { isNativePlatform: () => false }))).toBeNull();
  });

  it('is the one the shell registered, or the one it hands over when asked by name', () => {
    const plugin = fakeApp();
    expect(findApp(shell(plugin))).toBe(plugin);
    const asked: string[] = [];
    expect(findApp(shell(undefined, { registerPlugin: (name) => (asked.push(name), plugin) }))).toBe(plugin);
    expect(asked).toEqual(['App']);
  });

  it('a shell built without it, with something that is not it, or that throws when asked has none', () => {
    expect(findApp(shell(undefined))).toBeNull();
    expect(findApp(shell({ get: () => 1 }))).toBeNull();
    expect(findApp(shell(undefined, { registerPlugin: () => { throw new Error('"App" plugin is not implemented on ios'); } }))).toBeNull();
  });
});

describe('listening to the shell', () => {
  it('the Back button is the pause key', () => {
    const plugin = fakeApp();
    const h = handlers();
    attachNativeApp(shell(plugin), h);
    plugin.listeners.get('backButton')!({});
    plugin.listeners.get('backButton')!({ isActive: true });
    expect(h.calls).toEqual(['back', 'back']);
  });

  it('the app going to the background is the pause — and coming back is not (the menu waits for the player)', () => {
    const plugin = fakeApp();
    const h = handlers();
    attachNativeApp(shell(plugin), h);
    plugin.listeners.get('appStateChange')!({ isActive: false });
    expect(h.calls).toEqual(['background']);
    plugin.listeners.get('appStateChange')!({ isActive: true });
    plugin.listeners.get('appStateChange')!({});
    expect(h.calls, 'only the way out of the app is a pause').toEqual(['background']);
  });

  it('removes what it listened to, when it is told (the game is taken away)', async () => {
    const plugin = fakeApp();
    const off = attachNativeApp(shell(plugin), handlers());
    off();
    await settle();
    expect(plugin.removed.sort()).toEqual(['appStateChange', 'backButton']);
    off(); // twice is nothing
    await settle();
    expect(plugin.removed).toHaveLength(2);
  });

  it('listens to nothing where there is nothing to listen to: a web page, a shell with no plugin', () => {
    expect(() => attachNativeApp(undefined, handlers())()).not.toThrow();
    expect(() => attachNativeApp(shell(undefined), handlers())()).not.toThrow();
  });

  it('a shell that refuses a listener, or whose handle cannot be removed, is not a crash — the page plays on', async () => {
    const h = handlers();
    const refusing = fakeApp({ addListener: () => { throw new Error('not implemented'); } });
    expect(() => attachNativeApp(shell(refusing), h)()).not.toThrow();
    const stubborn = fakeApp({ addListener: () => Promise.resolve({ remove: () => { throw new Error('cannot remove'); } }) });
    const off = attachNativeApp(shell(stubborn), h);
    expect(() => off()).not.toThrow();
    await settle();
    const rejected = fakeApp({ addListener: () => Promise.reject(new Error('refused later')) });
    const off2 = attachNativeApp(shell(rejected), h);
    expect(() => off2()).not.toThrow();
    await settle();
  });
});
