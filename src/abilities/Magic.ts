import { clamp } from '@/core/math';
import { secondsToTicks, TICK_RATE } from '@/core/time';

/** The numbers of the magic bar (docs/GAME-SPEC-2D.md §10.1). Data: nothing here is hard-coded in the class. */
export interface MagicDefinition {
  /** Size of the bar, in units. */
  max: number;
  /** Units regained per second once the delay has passed. Gradual: never an instant refill. */
  regenPerSecond: number;
  /** Seconds without spending (or casting) before the regeneration starts. */
  regenDelaySeconds: number;
}

export type MagicChangeReason = 'spend' | 'regen' | 'restore' | 'set';

/** What a listener hears when the bar changes. `delta` is in units (negative when spent). */
export interface MagicChange {
  current: number;
  max: number;
  delta: number;
  reason: MagicChangeReason;
}

/** Integer thousandths of a unit: all the arithmetic is exact, so a regeneration of 6 / s is 6.000 after 60 ticks, always. */
const MILLI = 1000;

/**
 * The magic bar: an independent resource (it knows nothing about bottles, cards or the old `Resource` of the first slice).
 * `current` is always within 0 … max; spending is exact (a cost of 30 removes exactly 30); the regeneration is gradual
 * (6 units per second after 1.0 s without spending) and does not run while the player is casting.
 *
 * Deterministic on purpose: thousandths of a unit in integers, and a remainder accumulator for rates that do not divide by 60,
 * so the same ticks always give the same bar, bit for bit.
 */
export class Magic {
  private milli: number;
  private readonly maxMilli: number;
  private delayTicks = 0;
  /** Thousandths still owed to the next tick (rates that are not a multiple of 60 / s). */
  private carry = 0;

  constructor(
    readonly def: MagicDefinition,
    private readonly onChange: (change: MagicChange) => void = () => {},
  ) {
    this.maxMilli = Math.max(0, Math.round(def.max * MILLI));
    this.milli = this.maxMilli;
  }

  get current(): number {
    return this.milli / MILLI;
  }
  get max(): number {
    return this.maxMilli / MILLI;
  }
  /** 0 … 1, for the bar. */
  get fraction(): number {
    return this.maxMilli > 0 ? this.milli / this.maxMilli : 0;
  }
  get full(): boolean {
    return this.milli >= this.maxMilli;
  }
  /** It is coming back right now: below the maximum and past the delay. */
  get regenerating(): boolean {
    return this.milli < this.maxMilli && this.delayTicks === 0;
  }
  /** Ticks left before the regeneration starts (0 = it has). */
  get delayLeft(): number {
    return this.delayTicks;
  }

  /** Is there at least `cost` units? (Casting needs the whole cost: below it the skill is refused.) */
  canSpend(cost: number): boolean {
    return cost >= 0 && this.milli >= Math.round(cost * MILLI);
  }

  /** Takes exactly `cost` units and restarts the regeneration delay. False (and nothing changes) when there is not enough. */
  spend(cost: number): boolean {
    if (!this.canSpend(cost)) return false;
    const take = Math.round(cost * MILLI);
    this.milli -= take;
    this.delayTicks = secondsToTicks(this.def.regenDelaySeconds);
    this.carry = 0;
    if (take > 0) this.emit(-take / MILLI, 'spend');
    return true;
  }

  /** Full bar (the player comes back from a defeat with life and magic full, GAME-SPEC-2D §9.2). */
  restore(): void {
    const before = this.milli;
    this.milli = this.maxMilli;
    this.delayTicks = 0;
    this.carry = 0;
    if (this.milli !== before) this.emit((this.milli - before) / MILLI, 'restore');
  }

  /** Sets the bar to `units`, clamped to 0 … max (tests, debug, loading a save). */
  set(units: number): void {
    const before = this.milli;
    this.milli = clamp(Math.round(units * MILLI), 0, this.maxMilli);
    this.carry = 0;
    if (this.milli !== before) this.emit((this.milli - before) / MILLI, 'set');
  }

  /**
   * One simulation tick. While `blocked` (the player is casting) nothing regenerates and the delay does not run down, so the
   * 1.0 s starts when the cast is over.
   */
  tick(blocked = false): void {
    if (blocked) return;
    if (this.delayTicks > 0) {
      this.delayTicks--;
      return;
    }
    if (this.milli >= this.maxMilli) {
      this.carry = 0;
      return;
    }
    this.carry += Math.round(this.def.regenPerSecond * MILLI);
    const step = Math.floor(this.carry / TICK_RATE);
    this.carry -= step * TICK_RATE;
    if (step === 0) return;
    const before = this.milli;
    this.milli = Math.min(this.maxMilli, this.milli + step);
    if (this.milli >= this.maxMilli) this.carry = 0;
    // announced once per whole unit regained (and when it fills): ≈ 6 events a second, not 60
    if (Math.floor(this.milli / MILLI) !== Math.floor(before / MILLI) || this.milli >= this.maxMilli) this.emit((this.milli - before) / MILLI, 'regen');
  }

  private emit(delta: number, reason: MagicChangeReason): void {
    this.onChange({ current: this.current, max: this.max, delta, reason });
  }
}
