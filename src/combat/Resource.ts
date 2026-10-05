import { clamp } from '@/core/math';

/** A bar that fills and drains (energy for abilities). Data only: the HUD binds to events, never to this object. */
export class Resource {
  private _current: number;

  constructor(
    private _max: number,
    start = 0,
  ) {
    this._current = clamp(start, 0, _max);
  }

  get current(): number {
    return this._current;
  }
  get max(): number {
    return this._max;
  }
  get fraction(): number {
    return this._max > 0 ? this._current / this._max : 0;
  }

  /** Returns the amount actually gained. */
  gain(amount: number): number {
    const before = this._current;
    this._current = Math.min(this._max, this._current + Math.max(0, amount));
    return this._current - before;
  }

  canSpend(amount: number): boolean {
    return this._current + 1e-9 >= amount;
  }

  /** Spends `amount` if available; returns whether it did. All-or-nothing: no partial casts. */
  spend(amount: number): boolean {
    if (!this.canSpend(amount)) return false;
    this._current = Math.max(0, this._current - amount);
    return true;
  }

  set(value: number): void {
    this._current = clamp(value, 0, this._max);
  }
}
