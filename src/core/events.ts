import type { Unsubscribe } from './types';

type Handler<P> = (payload: P) => void;
/** One registration. Wrapping the function makes every subscription independent, even if the same function is registered twice. */
interface Entry {
  readonly fn: Handler<never>;
}

/**
 * Strongly typed synchronous event bus.
 *
 * - `emit` for `void` events takes no payload argument.
 * - Subscribing / unsubscribing while an event is being dispatched is safe: lists are copy-on-write,
 *   so the dispatch in flight iterates the snapshot it started with.
 * - A throwing handler never prevents the other handlers from running (see `onError`).
 * - `listenerCount()` exists so tests can prove that nothing leaks across room loads / respawns.
 */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, ReadonlyArray<Entry>>();

  /** Replace in tests with `(e) => { throw e }` so a buggy handler fails loudly. */
  onError: (error: unknown, type: keyof E) => void = (error, type) => {
    console.error(`[EventBus] handler for "${String(type)}" threw`, error);
  };

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): Unsubscribe {
    const entry: Entry = { fn: handler as Handler<never> };
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), entry]);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.handlers.get(type);
      if (!current) return;
      const next = current.filter((e) => e !== entry);
      if (next.length === 0) this.handlers.delete(type);
      else this.handlers.set(type, next);
    };
  }

  once<K extends keyof E>(type: K, handler: Handler<E[K]>): Unsubscribe {
    const off = this.on(type, ((payload: E[K]) => {
      off();
      handler(payload);
    }) as Handler<E[K]>);
    return off;
  }

  emit<K extends keyof E>(type: K, ...payload: E[K] extends void ? [] : [E[K]]): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const value = payload[0] as never;
    for (const entry of list) {
      try {
        entry.fn(value);
      } catch (error) {
        this.onError(error, type);
      }
    }
  }

  listenerCount(type?: keyof E): number {
    if (type !== undefined) return this.handlers.get(type)?.length ?? 0;
    let total = 0;
    for (const list of this.handlers.values()) total += list.length;
    return total;
  }

  clear(): void {
    this.handlers.clear();
  }
}
