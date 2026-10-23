import type { StorageAdapter } from '@/save/StorageAdapter';

/**
 * The saved games inside a NATIVE SHELL (docs/PROMPT20-LOG.md, docs/PUBLISHING.md): a Capacitor app (iOS, Android) keeps what must outlive a session in the platform's own preferences store — `UserDefaults`
 * on iOS, `SharedPreferences` on Android — which the system never clears to make room, where a web view's `localStorage` can be (a phone short of space evicts it, and a game that was saved there would be gone).
 *
 * It is a chunk of its own, fetched only when the page finds `window.Capacitor`: a web player never downloads it. It needs NO package of the web build — the shell puts `Capacitor` in the page, and the plugin is
 * asked of it by name — but the NATIVE project must have `@capacitor/preferences` installed (`npm i @capacitor/preferences && npx cap sync`: an external step, docs/PUBLISHING.md). Nothing here has been run on a
 * device: what is proven is the contract (a fake of the plugin's documented `get` / `set` / `remove`), and the page checks that the store WORKS before it trusts it with a game.
 */

/** The part of Capacitor's Preferences plugin that the game uses: its documented `get`, `set` and `remove`. */
export interface PreferencesPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

/** What is read of the `Capacitor` object the native shell puts in the page. */
export interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
  registerPlugin?: (name: string) => unknown;
}

const isPlugin = (p: unknown): p is PreferencesPlugin => typeof p === 'object' && p !== null && ['get', 'set', 'remove'].every((m) => typeof (p as Record<string, unknown>)[m] === 'function');

/** The Preferences plugin, if this page runs in a native shell that has it (`null` otherwise: a web page, or a shell built without the plugin). */
export function findPreferences(cap: CapacitorGlobal | undefined): PreferencesPlugin | null {
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
  const registered = cap.Plugins?.['Preferences'];
  if (isPlugin(registered)) return registered;
  try {
    const asked = cap.registerPlugin?.('Preferences');
    return isPlugin(asked) ? asked : null;
  } catch {
    return null;
  }
}

/** The preferences store as the saved games' `StorageAdapter`. A failure of the plugin is a failure of the write or the read: the stores above report it and the game goes on. */
export class NativeStorage implements StorageAdapter {
  constructor(private readonly plugin: PreferencesPlugin) {}

  async get(key: string): Promise<string | null> {
    const r = await this.plugin.get({ key });
    return typeof r?.value === 'string' ? r.value : null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.plugin.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await this.plugin.remove({ key });
  }
}

/** A key no game uses: the store is asked to keep it, give it back and forget it before the game trusts it with a save. */
const PROBE_KEY = 'troid.probe';

/**
 * The native store, once it has shown that it works (a write, a read that gives the same text back, a removal): `null` when the page is not in a native shell, the plugin is not there or the probe fails —
 * then the page keeps using the web's own storage, which is what a browser does.
 */
export async function nativeStorage(cap: CapacitorGlobal | undefined): Promise<StorageAdapter | null> {
  const plugin = findPreferences(cap);
  if (!plugin) return null;
  const store = new NativeStorage(plugin);
  try {
    const mark = `ok:${Math.random().toString(36).slice(2)}`;
    await store.set(PROBE_KEY, mark);
    const back = await store.get(PROBE_KEY);
    await store.remove(PROBE_KEY);
    return back === mark ? store : null;
  } catch {
    return null;
  }
}
