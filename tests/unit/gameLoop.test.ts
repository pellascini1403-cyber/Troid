import { describe, expect, it } from 'vitest';
import { GameLoop, type FrameDriver } from '@/app/GameLoop';

/** Manual frame driver: tests decide exactly when frames happen and how long they take. */
class ManualDriver implements FrameDriver {
  private cb: ((t: number) => void) | null = null;
  private pending = 0;
  private next = 1;
  /** Frames requested and neither fired nor cancelled (like pending rAF callbacks). */
  active = 0;
  time = 1000;
  request(cb: (t: number) => void): number {
    this.cb = cb;
    this.pending = this.next++;
    this.active++;
    return this.pending;
  }
  cancel(handle: number): void {
    // Like cancelAnimationFrame: cancelling an id that already fired is a no-op.
    if (handle !== this.pending || !this.cb) return;
    this.cb = null;
    this.active--;
  }
  frame(dtMs: number): void {
    const cb = this.cb;
    if (!cb) throw new Error('no frame requested');
    this.cb = null;
    this.active--;
    this.time += dtMs;
    cb(this.time);
  }
}

function setup() {
  const driver = new ManualDriver();
  const calls = { ticks: 0, frames: 0, lastAlpha: 0, lastDt: 0 };
  const loop = new GameLoop(
    {
      tick: () => void calls.ticks++,
      frame: (a, dt) => {
        calls.frames++;
        calls.lastAlpha = a;
        calls.lastDt = dt;
      },
    },
    undefined,
    driver,
  );
  return { driver, calls, loop };
}

describe('GameLoop', () => {
  it('first frame simulates nothing (no dt yet), then one tick per 1/60 s', () => {
    const { driver, calls, loop } = setup();
    loop.start();
    driver.frame(16.667);
    expect(calls.ticks).toBe(0);
    driver.frame(16.667);
    expect(calls.ticks).toBe(1);
    expect(calls.frames).toBe(2);
  });

  it('a 144 Hz display renders more frames than ticks and interpolates', () => {
    const { driver, calls, loop } = setup();
    loop.start();
    driver.frame(0);
    for (let i = 0; i < 144; i++) driver.frame(1000 / 144);
    expect(calls.ticks).toBeGreaterThanOrEqual(59);
    expect(calls.ticks).toBeLessThanOrEqual(60);
    expect(calls.frames).toBe(145);
  });

  it('pause stops ticks but keeps rendering', () => {
    const { driver, calls, loop } = setup();
    loop.start();
    driver.frame(0);
    loop.paused = true;
    for (let i = 0; i < 10; i++) driver.frame(16.667);
    expect(calls.ticks).toBe(0);
    expect(calls.frames).toBe(11);
  });

  it('timeScale slows the simulation but not the render dt', () => {
    const { driver, calls, loop } = setup();
    loop.start();
    driver.frame(0);
    loop.timeScale = 0.5;
    for (let i = 0; i < 60; i++) driver.frame(1000 / 60);
    expect(calls.ticks).toBeGreaterThanOrEqual(29);
    expect(calls.ticks).toBeLessThanOrEqual(30);
    expect(calls.lastDt).toBeCloseTo(1 / 60, 3);
  });

  it('a long stall (tab in background) never produces a burst of ticks', () => {
    const { driver, calls, loop } = setup();
    loop.start();
    driver.frame(0);
    driver.frame(30_000);
    expect(calls.ticks).toBeLessThanOrEqual(5);
  });

  it('resetClock discards the time spent away', () => {
    const { driver, calls, loop } = setup();
    loop.start();
    driver.frame(0);
    loop.resetClock();
    driver.frame(10_000); // first frame after reset has no dt
    expect(calls.ticks).toBe(0);
  });

  it('stop cancels the pending frame and start is idempotent (no double loops)', () => {
    const { driver, loop } = setup();
    loop.start();
    loop.start();
    expect(driver.active).toBe(1);
    loop.stop();
    loop.stop();
    expect(driver.active).toBe(0);
    expect(loop.isRunning).toBe(false);
  });

  it('stopping from inside a frame hook does not schedule another frame', () => {
    const driver = new ManualDriver();
    let loop!: GameLoop;
    loop = new GameLoop({ tick: () => {}, frame: () => loop.stop() }, undefined, driver);
    loop.start();
    driver.frame(16);
    expect(driver.active).toBe(0);
  });
});
