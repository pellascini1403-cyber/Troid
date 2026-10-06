import { clamp } from '@/core/math';
import { DEFAULT_TOUCH, type TouchConfig } from './TouchConfig';

/** What the recognizer produces, in the terms of the input contract (docs/PROMPT5-LOG.md S13). */
export interface GestureSink {
  /** The movement drag: `x` is the run speed (dead zone applied, 0..±1), `y` the vertical drag (negative = crouch). Independent axes. */
  move(x: number, y: number): void;
  /** The jump button: pressed when the drag crosses up, held while it stays up, released when it comes back. */
  jump(down: boolean): void;
  /** A flick down: the player wants to fall through the one-way platform underneath. */
  drop(): void;
}

/** A snapshot for the debug gesture viewer (origin, axes, arming). */
export interface GestureState {
  pointer: number | null;
  originX: number;
  originY: number;
  /** Normalised drag, −1..1 on each axis, +y up. */
  ax: number;
  ay: number;
  /** The jump gesture can fire (it fires once per rise and re-arms when the finger comes back down). */
  armed: boolean;
  jumping: boolean;
}

const FLICK_SAMPLES = 8;

/**
 * The movement gesture of the touch controls (docs/GAME-SPEC-2D.md §4.3.1–§4.3.3), as PURE TypeScript: pointer events in,
 * `GestureSink` calls out. No DOM, no clock (the caller says when each event happened), so it is tested with synthetic
 * pointer sequences: running, jumping, flicking, drifting, reversing, a second finger, cancelling.
 *
 *  - The first finger down in the zone is THE movement pointer; its contact point is the floating origin. A second finger
 *    in the zone is ignored while the first is down.
 *  - The drag, relative to the origin, is two independent axes: `ax` (run) with a dead zone and `ay` (crouch below zero).
 *  - Dragging UP across `jumpEnter` presses the jump; it stays held while `ay ≥ jumpHold`; it fires again only after the
 *    drag has come back to `jumpRearm` (no repeated jumps from a thumb that stays up). Variable jump height, the buffer and
 *    coyote time are the simulation's: a flick that is released at once is a short hop.
 *  - A fast flick DOWN (`dropFlickDistance` within `dropFlickWindowMs`) asks to drop through a one-way platform.
 */
export class TouchGestureRecognizer {
  private pointer: number | null = null;
  private ox = 0;
  private oy = 0;
  private ax = 0;
  private ay = 0;
  private armed = true;
  private jumping = false;
  private dropArmed = true;
  private readonly flickT = new Float64Array(FLICK_SAMPLES);
  private readonly flickY = new Float64Array(FLICK_SAMPLES);
  private flickN = 0;

  constructor(
    private readonly sink: GestureSink,
    private readonly cfg: Readonly<TouchConfig> = DEFAULT_TOUCH,
    /** The current `uiScale`: distances in dp are multiplied by it (it changes with the window, so it is read every event). */
    private readonly scale: () => number = () => 1,
  ) {}

  get activePointer(): number | null {
    return this.pointer;
  }

  get state(): Readonly<GestureState> {
    return { pointer: this.pointer, originX: this.ox, originY: this.oy, ax: this.ax, ay: this.ay, armed: this.armed, jumping: this.jumping };
  }

  /** A finger touched down in the movement zone. True when it became THE movement pointer, false when it is ignored. */
  down(id: number, x: number, y: number, t: number): boolean {
    if (this.pointer !== null) return false;
    this.pointer = id;
    this.ox = x;
    this.oy = y;
    this.ax = 0;
    this.ay = 0;
    this.armed = true;
    this.jumping = false;
    this.dropArmed = true;
    this.flickN = 0;
    this.pushFlick(t, y);
    return true;
  }

  move(id: number, x: number, y: number, t: number): void {
    if (id !== this.pointer) return;
    const s = this.scale();
    const rx = this.cfg.rx * s;
    const ry = this.cfg.ry * s;
    let dx = x - this.ox;
    const dy = y - this.oy;
    if (this.cfg.followOrigin) {
      if (dx > rx) this.ox += dx - rx;
      else if (dx < -rx) this.ox += dx + rx;
      if (dy > ry) this.oy += dy - ry;
      else if (dy < -ry) this.oy += dy + ry;
      dx = x - this.ox;
    }
    const ax = clamp(dx / rx, -1, 1);
    const ay = clamp((this.oy - y) / ry, -1, 1); // (screen y grows downwards; written this way a still finger reads +0, not −0)
    const prevAy = this.ay;
    this.ax = ax;
    this.ay = ay;

    // ---- jump: cross up while armed → pressed; stays held above `jumpHold`; re-arms when the drag is back down ----
    const c = this.cfg;
    if (this.armed && ay >= c.jumpEnter && prevAy < c.jumpEnter) {
      this.armed = false;
      this.jumping = true;
      this.sink.jump(true);
    } else if (!this.armed && ay <= c.jumpRearm) {
      this.armed = true;
    }
    if (this.jumping && ay < c.jumpHold) {
      this.jumping = false;
      this.sink.jump(false);
    }

    this.detectDrop(y, t, s);
    this.sink.move(this.runAxis(ax), ay);
  }

  /** The finger lifted. */
  up(id: number): void {
    if (id === this.pointer) this.release();
  }

  /** The pointer was cancelled (the system took the touch, capture was lost): the same as lifting. */
  cancel(id: number): void {
    if (id === this.pointer) this.release();
  }

  /** Lets go of everything the movement pointer held: the jump, the axes, the zone (blur, a rotation, a pause). */
  release(): void {
    if (this.pointer === null) return;
    this.pointer = null;
    if (this.jumping) {
      this.jumping = false;
      this.sink.jump(false);
    }
    this.ax = 0;
    this.ay = 0;
    this.armed = true;
    this.flickN = 0;
    this.sink.move(0, 0);
  }

  /** Dead zone on the run axis, the rest rescaled to 0..1 so the walk speed starts from nothing (§4.3.1). */
  private runAxis(ax: number): number {
    const dz = this.cfg.deadZoneX;
    const m = Math.abs(ax);
    return m > dz ? Math.sign(ax) * ((m - dz) / (1 - dz)) : 0;
  }

  private pushFlick(t: number, y: number): void {
    if (this.flickN === FLICK_SAMPLES) {
      this.flickT.copyWithin(0, 1);
      this.flickY.copyWithin(0, 1);
      this.flickN--;
    }
    this.flickT[this.flickN] = t;
    this.flickY[this.flickN] = y;
    this.flickN++;
  }

  /** A flick down: the finger travelled `dropFlickDistance` downwards within the window. It fires once per flick. */
  private detectDrop(y: number, t: number, scale: number): void {
    this.pushFlick(t, y);
    const need = this.cfg.dropFlickDistance * scale;
    let travelled = 0;
    for (let i = 0; i < this.flickN; i++) {
      if (t - (this.flickT[i] as number) <= this.cfg.dropFlickWindowMs) travelled = Math.max(travelled, y - (this.flickY[i] as number));
    }
    if (this.dropArmed) {
      if (travelled >= need) {
        this.dropArmed = false;
        this.sink.drop();
      }
    } else if (travelled < need * 0.5) {
      this.dropArmed = true; // the swipe is over: the next fast flick counts again
    }
  }
}
