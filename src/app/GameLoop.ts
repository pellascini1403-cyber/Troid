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
}

/**
 * Fixed-step simulation, variable-rate rendering.
 *
 * - `timeScale` scales simulation time (slow-mo, debug); rendering always uses real time.
 * - `paused` stops ticks but keeps rendering, so menus and camera effects stay alive.
 * - `resetClock()` drops the accumulated time; call it when the page becomes visible again so the
 *   first frame back does not try to simulate the whole time spent in the background.
 */
export class GameLoop {
  timeScale = 1;
  paused = false;

  private handle = 0;
  private running = false;
  private last = -1;
  private alpha = 0;

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
    if (!this.paused) {
      this.alpha = this.stepper.advance(realDt * this.timeScale, this.hooks.tick);
    }
    this.hooks.frame(this.alpha, realDt);
    // The hooks may have called stop(); only keep going if we are still running.
    if (this.running) this.handle = this.driver.request(this.onFrame);
  };
}
