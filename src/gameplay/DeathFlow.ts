import type { Scheduler } from '@/core/scheduler';
import type { InputFrame } from '@/input/InputFrame';

/** Durations of the defeat flow, in SIMULATION ticks (60 per second). Data: docs/GAME-SPEC-2D.md §9.2. */
export interface DeathFlowDefinition {
  /** The death animation and the energy dispersal, with the world still running. */
  dying: number;
  /** Fade to black. */
  fadeOut: number;
  /** Black screen with the defeat title. */
  hold: number;
  /** Fade back in on the respawned player. */
  fadeIn: number;
  /** Ticks of `hold` after which ANY button press skips the rest of the wait. */
  skipAfter: number;
}

export const DEFAULT_DEATH_FLOW: DeathFlowDefinition = { dying: 72, fadeOut: 30, hold: 60, fadeIn: 30, skipAfter: 30 };

export type DeathPhase = 'none' | 'dying' | 'fadeOut' | 'hold' | 'fadeIn';

/** What the overlay needs to draw one frame of the flow. Plain data. */
export interface DeathSnapshot {
  phase: DeathPhase;
  /** Simulation ticks spent in the phase so far, and the phase's length. */
  ticks: number;
  length: number;
  /** A press would skip the wait right now. */
  canSkip: boolean;
}

export interface DeathHost {
  readonly scheduler: Scheduler;
  /** Reloads the room at the respawn point, with the player alive again. */
  respawn(): void;
  emitStarted(): void;
  emitFadeOut(ticks: number): void;
  emitRespawned(): void;
  emitFadeIn(ticks: number): void;
}

/**
 * The defeat flow (docs/ARCHITECTURE-2D.md §5.8): `dying → fadeOut → hold → respawn → fadeIn`, as timers of the
 * simulation `Scheduler` owned by this object, so it is deterministic, pauses with the world (a hit-stop does not count)
 * and can be cancelled without residue. It decides NOTHING about what is drawn: the overlay reads `snapshot()` and
 * the events say when each phase starts.
 *
 * Dying costs nothing: the host's `respawn()` restores health and reloads the room (enemies reappear), and keeps every
 * ability and item. A press after `skipAfter` ticks of `hold` skips the rest of the wait.
 */
export class DeathFlow {
  private _phase: DeathPhase = 'none';
  private phaseStart = 0;
  private length = 0;
  private readonly owner = {};

  constructor(
    private readonly host: DeathHost,
    private readonly def: DeathFlowDefinition = DEFAULT_DEATH_FLOW,
  ) {}

  get phase(): DeathPhase {
    return this._phase;
  }
  get active(): boolean {
    return this._phase !== 'none';
  }

  snapshot(out: DeathSnapshot = { phase: 'none', ticks: 0, length: 0, canSkip: false }): DeathSnapshot {
    out.phase = this._phase;
    out.ticks = this._phase === 'none' ? 0 : Math.min(this.length, this.host.scheduler.now - this.phaseStart);
    out.length = this.length;
    out.canSkip = this.canSkip();
    return out;
  }

  /** Starts the flow (the player died). Ignored if it is already running. */
  start(): void {
    if (this.active) return;
    this.enter('dying', this.def.dying, () => this.fadeOut());
    this.host.emitStarted();
  }

  /**
   * Once per simulated tick: any button press skips the wait once it is allowed. Returns true when the press WAS the
   * skip: it belongs to the defeat screen and must not also jump or swing the sword of the player who just came back.
   */
  update(input: InputFrame): boolean {
    if (!this.canSkip()) return false;
    if (!(input.jumpPressed || input.attackPressed || input.dashPressed || input.abilityPressed || input.pausePressed)) return false;
    this.skip();
    return true;
  }

  /** Stops the flow without respawning (the room was reloaded by someone else). */
  cancel(): void {
    this.host.scheduler.cancelOwner(this.owner);
    this._phase = 'none';
    this.length = 0;
  }

  private canSkip(): boolean {
    return this._phase === 'hold' && this.host.scheduler.now - this.phaseStart >= this.def.skipAfter;
  }

  private skip(): void {
    this.host.scheduler.cancelOwner(this.owner);
    this.respawn();
  }

  private fadeOut(): void {
    this.enter('fadeOut', this.def.fadeOut, () => this.hold());
    this.host.emitFadeOut(this.def.fadeOut);
  }

  private hold(): void {
    this.enter('hold', this.def.hold, () => this.respawn());
  }

  private respawn(): void {
    this.host.respawn();
    this.enter('fadeIn', this.def.fadeIn, () => this.done());
    this.host.emitRespawned();
    this.host.emitFadeIn(this.def.fadeIn);
  }

  private done(): void {
    this._phase = 'none';
    this.length = 0;
  }

  private enter(phase: DeathPhase, ticks: number, next: () => void): void {
    this._phase = phase;
    this.phaseStart = this.host.scheduler.now;
    this.length = ticks;
    this.host.scheduler.after(ticks, next, this.owner);
  }
}
