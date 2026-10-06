import type { DisposableStore } from '@/core/lifecycle';

/**
 * Registers a DOM listener whose removal is owned by `store`.
 *
 * Every DOM listener in the project goes through here (or an `AbortSignal` derived from a store), so a
 * disposed owner cannot leave listeners behind — and tests can assert `store.size` / spy on add/remove.
 */
export function listen<K extends keyof WindowEventMap>(
  store: DisposableStore,
  target: Window,
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void;
export function listen<K extends keyof DocumentEventMap>(
  store: DisposableStore,
  target: Document,
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void;
export function listen<K extends keyof HTMLElementEventMap>(
  store: DisposableStore,
  target: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void;
export function listen(
  store: DisposableStore,
  target: EventTarget,
  type: string,
  handler: (event: never) => void,
  options?: AddEventListenerOptions,
): void {
  const controller = new AbortController();
  target.addEventListener(type, handler as EventListener, { ...options, signal: controller.signal });
  store.add(() => controller.abort());
}

/**
 * Runs `run` once, `delayMs` from now and then at the next idle moment of the page (it does not wait for one longer than 2 s; where the
 * platform has no idle callback it runs at once). Returns what cancels it: a disposed owner never runs it.
 */
export function afterIdle(run: () => void, delayMs: number): () => void {
  let cancelIdle: (() => void) | null = null;
  const timer = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 2000 });
      cancelIdle = () => cancelIdleCallback(id);
    } else run();
  }, delayMs);
  return () => {
    clearTimeout(timer);
    cancelIdle?.();
  };
}
