import type { Unsubscribe } from './types';

type Listener<T> = (value: T, previous: T) => void;

/**
 * Minimal observable value: the binding point between simulation data and any UI.
 *
 * Systems write plain data into a view-model made of `Observable`s; views subscribe to the
 * parts they draw. The system never learns whether a DOM HUD, a PNG skin or nothing at all is listening.
 */
export class Observable<T> {
  private listeners: ReadonlyArray<Listener<T>> = [];

  constructor(
    private value: T,
    private readonly equals: (a: T, b: T) => boolean = Object.is,
  ) {}

  get(): T {
    return this.value;
  }

  /** Returns true if the value changed (and listeners were notified). */
  set(next: T): boolean {
    if (this.equals(this.value, next)) return false;
    const previous = this.value;
    this.value = next;
    for (const listener of this.listeners) listener(next, previous);
    return true;
  }

  update(fn: (current: T) => T): boolean {
    return this.set(fn(this.value));
  }

  subscribe(listener: Listener<T>, immediate = false): Unsubscribe {
    this.listeners = [...this.listeners, listener];
    if (immediate) listener(this.value, this.value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.length;
  }
}
