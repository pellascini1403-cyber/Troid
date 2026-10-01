import type { Disposable, Unsubscribe } from './types';

type Disposer = Disposable | Unsubscribe;

/**
 * Owns everything that must be released together: event subscriptions, scheduler timers, GPU
 * resources, DOM listeners. Rooms, entities, views and the whole game each own one, so unloading
 * the owner can never leave a listener or timer behind.
 *
 * - Disposal is idempotent and runs in reverse registration order.
 * - One failing disposer does not stop the rest; the first error is rethrown afterwards.
 * - Adding to an already-disposed store disposes the item immediately (late registrations cannot leak).
 */
export class DisposableStore implements Disposable {
  private items: Disposer[] = [];
  private _disposed = false;

  get disposed(): boolean {
    return this._disposed;
  }
  get size(): number {
    return this.items.length;
  }

  add<T extends Disposer>(item: T): T {
    if (this._disposed) {
      run(item);
      return item;
    }
    this.items.push(item);
    return item;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const items = this.items;
    this.items = [];
    let firstError: unknown;
    let failed = false;
    for (let i = items.length - 1; i >= 0; i--) {
      try {
        run(items[i] as Disposer);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    if (failed) throw firstError;
  }

  /** Disposes the current contents but keeps the store usable (used when a room is reset). */
  reset(): void {
    const items = this.items;
    this.items = [];
    for (let i = items.length - 1; i >= 0; i--) run(items[i] as Disposer);
  }
}

function run(item: Disposer): void {
  if (typeof item === 'function') item();
  else item.dispose();
}

export function toDisposable(fn: () => void): Disposable {
  let done = false;
  return {
    dispose() {
      if (done) return;
      done = true;
      fn();
    },
  };
}
