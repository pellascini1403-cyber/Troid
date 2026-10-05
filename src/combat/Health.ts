import { clamp } from '@/core/math';

/**
 * Hit points. It is plain data with rules and NO knowledge of who displays it: the CombatSystem announces changes
 * through the event bus, and any HUD / floating number / sound listens. Swapping the UI never touches this class.
 */
export class Health {
  private _current: number;
  private _max: number;

  constructor(max: number) {
    this._max = max;
    this._current = max;
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
  get dead(): boolean {
    return this._current <= 0;
  }

  /** Returns the amount actually removed (never more than what was left). */
  damage(amount: number): number {
    if (amount <= 0 || this.dead) return 0;
    const before = this._current;
    this._current = Math.max(0, this._current - amount);
    return before - this._current;
  }

  /** Returns the amount actually restored. Dead things stay dead (revive explicitly). */
  heal(amount: number): number {
    if (amount <= 0 || this.dead) return 0;
    const before = this._current;
    this._current = Math.min(this._max, this._current + amount);
    return this._current - before;
  }

  setMax(max: number, fill = false): void {
    this._max = Math.max(1, max);
    this._current = fill ? this._max : clamp(this._current, 0, this._max);
  }

  /** Back to full health (respawn, arena reset). */
  restore(): void {
    this._current = this._max;
  }
}
