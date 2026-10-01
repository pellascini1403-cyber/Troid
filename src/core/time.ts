/** Simulation step: every gameplay constant expressed in "ticks" assumes this rate. */
export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}
export function ticksToSeconds(ticks: number): number {
  return ticks / TICK_RATE;
}

/** Injectable wall clock: the simulation never reads `Date.now()` itself. */
export interface Clock {
  now(): number;
}

/**
 * Fixed-timestep accumulator ("Fix Your Timestep"). Feed it real frame time; it calls `onStep` zero or
 * more times and returns the interpolation factor for rendering the leftover fraction.
 *
 * - A frame longer than `maxFrameTime` (tab switched away, debugger) is clamped.
 * - At most `maxStepsPerAdvance` steps run per call; any remaining backlog is dropped
 *   so a slow device degrades into slow-motion instead of a spiral of death.
 */
export class FixedStepper {
  private acc = 0;

  constructor(
    readonly step = TICK_SECONDS,
    readonly maxStepsPerAdvance = 5,
    readonly maxFrameTime = 0.25,
  ) {}

  advance(dtSeconds: number, onStep: () => void): number {
    this.acc += Math.min(Math.max(dtSeconds, 0), this.maxFrameTime);
    let steps = 0;
    while (this.acc >= this.step - 1e-9 && steps < this.maxStepsPerAdvance) {
      onStep();
      this.acc -= this.step;
      steps++;
    }
    if (steps === this.maxStepsPerAdvance && this.acc >= this.step) this.acc = 0;
    if (this.acc < 0) this.acc = 0;
    return this.acc / this.step;
  }

  reset(): void {
    this.acc = 0;
  }
}
