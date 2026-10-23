import { FixedStepper } from '@/core/time';

export interface FrameDriver {
  request(callback: (timeMs: number) => void): number;
  cancel(handle: number): void;
}

/** Real driver; referenced lazily so importing this module in node (tests) is harmless. */
export const browserDriver: FrameDriver = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
};

export interface LoopHooks {
  /** One fixed simulation step (1/60 s). */
  tick(): void;
  /**
   * Once per rendered frame, after the ticks. `alpha` ∈ [0,1) is how far we are between the last two
   * simulation states (for interpolation); `realDt` is unscaled wall time (camera, VFX, UI).
   */
  frame(alpha: number, realDt: number): void;
  /**
   * A tick or a frame threw: `streak` frames in a row have. The loop has skipped it and asks for the next one — a frame that fails is not the end of the game, and a loop that stopped asking would leave the last picture on a
   * screen that answers nothing. Whoever is told can say it and stop the loop (`stop()`) when it is plain that it will not recover. Without one, the error is left for the browser to report once the next frame is asked for.
   */
  failed?(error: unknown, streak: number): void;
}

/**
 * Fixed-step simulation, variable-rate rendering.
 *
 * - `timeScale` scales simulation time (slow-mo, debug); rendering always uses real time.
 * - `paused` stops ticks but keeps rendering, so menus and camera effects stay alive.
 * - `resetClock()` drops the accumulated time; call it when the page becomes visible again so the
 *   first frame back does not try to simulate the whole time spent in the background.
 * - A tick or a frame that throws never ends the loop: it is skipped and the next one is asked for (see `LoopHooks.failed`).
 */
export class GameLoop {
  timeScale = 1;
  paused = false;

  private handle = 0;
  private running = false;
  private last = -1;
  private alpha = 0;
  private streak = 0;

  constructor(
    private readonly hooks: LoopHooks,
    private readonly stepper = new FixedStepper(),
    private readonly driver: FrameDriver = browserDriver,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }
  get interpolation(): number {
    return this.alpha;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resetClock();
    this.handle = this.driver.request(this.onFrame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.driver.cancel(this.handle);
  }

  resetClock(): void {
    this.last = -1;
    this.stepper.reset();
  }

  private readonly onFrame = (timeMs: number): void => {
    if (!this.running) return;
    const realDt = this.last < 0 ? 0 : (timeMs - this.last) / 1000;
    this.last = timeMs;
    let failure: { error: unknown } | null = null;
    try {
      if (!this.paused) {
        this.alpha = this.stepper.advance(realDt * this.timeScale, this.hooks.tick);
      }
      this.hooks.frame(this.alpha, realDt);
      this.streak = 0;
    } catch (error) {
      // the time this frame owed is dropped, not paid back in a burst once the next one works
      this.stepper.reset();
      this.streak++;
      failure = { error };
    }
    // The hooks may have called stop(); only keep going if we are still running.
    if (this.running) this.handle = this.driver.request(this.onFrame);
    if (failure === null) return;
    if (this.hooks.failed) this.hooks.failed(failure.error, this.streak);
    else throw failure.error;
  };
}
