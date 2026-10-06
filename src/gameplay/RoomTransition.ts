import type { Scheduler } from '@/core/scheduler';
import type { Destination } from '@/world/RoomDefinition';

/** Durations of a room transition, in SIMULATION ticks (60 per second). Data: docs/PROMPT6-LOG.md S23. */
export interface TransitionDefinition {
  /** Fade to black on the room that is being left. */
  fadeOut: number;
  /** Black: the new room has just been built and the camera cut to it. */
  hold: number;
  /** Fade back in on the new room. */
  fadeIn: number;
}

export const DEFAULT_TRANSITION: TransitionDefinition = { fadeOut: 12, hold: 6, fadeIn: 14 };

export type TransitionPhase = 'none' | 'fadeOut' | 'hold' | 'fadeIn';

/** What the overlay needs to draw one frame of the transition. Plain data. */
export interface TransitionSnapshot {
  phase: TransitionPhase;
  /** Simulation ticks spent in the phase so far, and the phase's length. */
  ticks: number;
  length: number;
}

export interface TransitionHost {
  readonly scheduler: Scheduler;
  /** Unloads the room that is being left and builds the destination, the player at the entry it names. */
  swap(to: Destination, exitId: string): void;
  emitStarted(from: string, exitId: string, to: Destination, ticks: number): void;
  emitFadeOut(ticks: number): void;
  emitFadeIn(ticks: number): void;
  emitFinished(to: Destination): void;
  emitCancelled(reason: TransitionCancel): void;
}

/** Why a transition that had started did not finish: the player went down, or something loaded a room by hand. */
export type TransitionCancel = 'death' | 'reload';

/**
 * The room transition (docs/PROMPT6-LOG.md S23): `fadeOut → swap → hold → fadeIn`, as timers of the simulation `Scheduler` owned
 * by this object, exactly like the defeat flow, so it is deterministic, waits out a hit-stop and can be cancelled without
 * residue. It decides NOTHING about what is drawn: the overlay reads `snapshot()` and the events say when each phase starts.
 *
 * It is one-at-a-time by construction: `begin` is refused while a transition runs, so a second exit touched in the middle (or
 * the same one) cannot start another. The swap is a single step — the old room is unloaded and the new one built in the same
 * call, the player placed at the entry the exit names — so there is no moment with two rooms, or none.
 */
export class RoomTransition {
  private _phase: TransitionPhase = 'none';
  private phaseStart = 0;
  private length = 0;
  private readonly owner = {};

  constructor(
    private readonly host: TransitionHost,
    private readonly def: TransitionDefinition = DEFAULT_TRANSITION,
  ) {}

  get phase(): TransitionPhase {
    return this._phase;
  }
  /** A transition is running: the player has no control and no other one can start. */
  get active(): boolean {
    return this._phase !== 'none';
  }

  snapshot(out: TransitionSnapshot = { phase: 'none', ticks: 0, length: 0 }): TransitionSnapshot {
    out.phase = this._phase;
    out.ticks = this._phase === 'none' ? 0 : Math.min(this.length, this.host.scheduler.now - this.phaseStart);
    out.length = this.length;
    return out;
  }

  /** Starts leaving `from` through `exitId` toward `to`. Returns false (and does nothing) while another transition runs. */
  begin(from: string, exitId: string, to: Destination): boolean {
    if (this.active) return false;
    this.host.emitStarted(from, exitId, to, this.def.fadeOut + this.def.hold + this.def.fadeIn);
    this.enter('fadeOut', this.def.fadeOut, () => this.swap(to, exitId));
    this.host.emitFadeOut(this.def.fadeOut);
    return true;
  }

  /** Stops the transition where it is (the player went down, a room was loaded by hand). Whatever room is loaded stays loaded. */
  cancel(reason: TransitionCancel): void {
    if (!this.active) return;
    this.host.scheduler.cancelOwner(this.owner);
    this._phase = 'none';
    this.length = 0;
    this.host.emitCancelled(reason);
  }

  private swap(to: Destination, exitId: string): void {
    this.host.swap(to, exitId);
    this.enter('hold', this.def.hold, () => this.fadeIn(to));
  }

  private fadeIn(to: Destination): void {
    this.enter('fadeIn', this.def.fadeIn, () => this.done(to));
    this.host.emitFadeIn(this.def.fadeIn);
  }

  private done(to: Destination): void {
    this._phase = 'none';
    this.length = 0;
    this.host.emitFinished(to);
  }

  private enter(phase: TransitionPhase, ticks: number, next: () => void): void {
    this._phase = phase;
    this.phaseStart = this.host.scheduler.now;
    this.length = ticks;
    this.host.scheduler.after(ticks, next, this.owner);
  }
}
