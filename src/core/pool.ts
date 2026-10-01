/**
 * Object pool with a hard cap and a double-release guard.
 *
 * `acquire()` returns `null` once `max` objects are active: callers (VFX, projectiles, damage numbers)
 * must treat that as "skip this effect", which gives a natural, mobile-friendly upper bound.
 */
export class Pool<T extends object> {
  private readonly free: T[] = [];
  private readonly used = new Set<T>();
  private _created = 0;

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void = () => {},
    readonly max = Infinity,
  ) {}

  get created(): number {
    return this._created;
  }
  get active(): number {
    return this.used.size;
  }
  get available(): number {
    return this.free.length;
  }

  prewarm(count: number): void {
    while (this._created < count && this._created < this.max) {
      const item = this.factory();
      this._created++;
      this.reset(item);
      this.free.push(item);
    }
  }

  acquire(): T | null {
    let item = this.free.pop();
    if (!item) {
      if (this._created >= this.max) return null;
      item = this.factory();
      this._created++;
    }
    this.used.add(item);
    return item;
  }

  /** Returns `false` (and does nothing) if the item is not currently active in this pool. */
  release(item: T): boolean {
    if (!this.used.delete(item)) return false;
    this.reset(item);
    this.free.push(item);
    return true;
  }

  releaseAll(): void {
    for (const item of this.used) {
      this.reset(item);
      this.free.push(item);
    }
    this.used.clear();
  }

  forEachActive(fn: (item: T) => void): void {
    for (const item of this.used) fn(item);
  }

  /** Drops every object; `disposeItem` lets the caller free GPU resources. */
  dispose(disposeItem?: (item: T) => void): void {
    if (disposeItem) {
      for (const item of this.free) disposeItem(item);
      for (const item of this.used) disposeItem(item);
    }
    this.free.length = 0;
    this.used.clear();
    this._created = 0;
  }
}
