import type { CapacitorGlobal } from './nativeStorage';

/**
 * THE GAME AND THE APP AROUND IT (docs/PROMPT20-LOG.md, docs/PUBLISHING.md): inside a native shell the system tells the page two things the web does not — that the HARDWARE BACK BUTTON of an Android phone was pressed
 * (which, with nobody listening, closes the app on the spot: a game in the middle of a fight must not end that way) and that the app went to the BACKGROUND (the system's own account of it, which does not wait for the web
 * view to notice that it is hidden). Both are answered the way the page answers them anywhere: the back button is the pause key, and the background is the pause.
 *
 * It is a chunk of its own, fetched only when the page finds `window.Capacitor`, and it needs no package of the web build — the plugin (`@capacitor/app`) is asked of the shell by name; the NATIVE project must have it
 * (`npm i @capacitor/app && npx cap sync`: an external step). Nothing here has been run on a device: what is proven is the contract, against a fake of the plugin's documented `addListener`.
 */

/** The part of Capacitor's App plugin that the game uses: its documented `addListener`, which answers a handle (a promise of one, in the plugin's current versions) that can remove the listener. */
export interface AppPlugin {
  addListener(event: string, listener: (data: { isActive?: boolean }) => void): unknown;
}

const isPlugin = (p: unknown): p is AppPlugin => typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>)['addListener'] === 'function';

/** The App plugin, if this page runs in a native shell that has it (`null` otherwise: a web page, or a shell built without the plugin). */
export function findApp(cap: CapacitorGlobal | undefined): AppPlugin | null {
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
  const registered = cap.Plugins?.['App'];
  if (isPlugin(registered)) return registered;
  try {
    const asked = cap.registerPlugin?.('App');
    return isPlugin(asked) ? asked : null;
  } catch {
    return null;
  }
}

export interface NativeAppHandlers {
  /** The Back button: the page's pause key. */
  back(): void;
  /** The app went to the background (the system said so). */
  background(): void;
}

/** Listens to the shell. Answers what removes the listeners; with no plugin (a web page) there is nothing to listen to and it removes nothing. A shell that misbehaves is not a crash. */
export function attachNativeApp(cap: CapacitorGlobal | undefined, handlers: NativeAppHandlers): () => void {
  const app = findApp(cap);
  if (!app) return () => undefined;
  const handles: unknown[] = [];
  const listen = (event: string, run: (data: { isActive?: boolean }) => void): void => {
    try {
      handles.push(app.addListener(event, run));
    } catch {
      // a shell that refuses a listener: the page plays on without that signal
    }
  };
  listen('backButton', () => handlers.back());
  listen('appStateChange', (state) => {
    if (state?.isActive === false) handlers.background();
  });
  return () => {
    for (const h of handles.splice(0)) {
      void Promise.resolve(h)
        .then((handle) => (handle as { remove?: () => unknown } | null)?.remove?.())
        .catch(() => undefined);
    }
  };
}
