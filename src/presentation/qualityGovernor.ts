/**
 * AN AUTOMATIC QUALITY THAT MEASURES (docs/PROMPT20-LOG.md §7): `Auto` used to be the balanced profile and nothing more ("it does not measure your device yet"). Now it watches the one thing every device can tell: how long
 * the frames take. If the game cannot keep up — most of the frames of several seconds in a row take longer than a frame of ~40 a second — it steps down to the low profile (the lower render resolution, the smaller
 * budgets of particles, lights and effects), once, for the rest of the session. It never goes up again by itself (a device that was struggling is not asked to prove it again with a flicker), it is never saved (the
 * setting stays `Auto`, and the next visit starts balanced again), and it never acts on a device that keeps up: it only ever takes something away from a game that was not running well.
 *
 * Pure: the decision is a function of the durations it is told about. `Game2D` tells it, once per rendered frame, how long the frame took since the last one and whether that duration says anything about the device.
 */
export interface GovernorOptions {
  /** A frame that took longer than this (ms) is a slow one: 24 ms is a game below ~41 frames a second. */
  slowMs: number;
  /** The stretch of recent frames (ms of frame time) the decision is made on. */
  windowMs: number;
  /** The share of the frames of the window that must be slow. */
  share: number;
  /** The frame time (ms) that is let go by at the start, and after a step or a reset, before anything is judged: textures go to the GPU and shaders are built in the first moments of any game. */
  settleMs: number;
  /** A frame longer than this (ms) is not slowness but an interruption (a background tab, a debugger, a phone call): it is not counted at all. */
  hitchMs: number;
}

export const DEFAULT_GOVERNOR: Readonly<GovernorOptions> = { slowMs: 24, windowMs: 4000, share: 0.8, settleMs: 4000, hitchMs: 1000 };

export class QualityGovernor {
  private readonly o: GovernorOptions;
  private settle: number;
  private readonly times: number[] = [];
  private total = 0;
  private slow = 0;
  private done = false;

  constructor(options: Partial<GovernorOptions> = {}) {
    this.o = { ...DEFAULT_GOVERNOR, ...options };
    this.settle = this.o.settleMs;
  }

  /**
   * One rendered frame. `dt` is the real time (ms) since the one before; `counts` is false while the frame says nothing about the device — the world is held, the menu is open, the page is hidden, the room's art is
   * arriving. Returns `true` once: the moment the game should step down.
   */
  frame(dt: number, counts: boolean): boolean {
    if (this.done) return false;
    if (!counts || !(dt > 0) || dt > this.o.hitchMs) {
      // what happened between two frames that do not count is nothing to judge, and what came before it no longer follows from it
      if (!counts) this.forget();
      return false;
    }
    if (this.settle > 0) {
      this.settle -= dt;
      return false;
    }
    this.times.push(dt);
    this.total += dt;
    if (dt > this.o.slowMs) this.slow++;
    while (this.total - this.times[0]! >= this.o.windowMs) {
      const old = this.times.shift()!;
      this.total -= old;
      if (old > this.o.slowMs) this.slow--;
    }
    if (this.total < this.o.windowMs * 0.9 || this.slow < this.times.length * this.o.share) return false;
    this.done = true;
    return true;
  }

  /** Forgets what it has seen and waits again before judging: the player changed the profile by hand, or came back from somewhere the frames meant nothing. */
  reset(): void {
    this.done = false;
    this.settle = this.o.settleMs;
    this.forget();
  }

  /** How much of the recent frames were slow, for the log line that says why the game stepped down. */
  get summary(): { frames: number; slow: number; ms: number } {
    return { frames: this.times.length, slow: this.slow, ms: Math.round(this.total) };
  }

  private forget(): void {
    this.times.length = 0;
    this.total = 0;
    this.slow = 0;
  }
}
