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

  describe('a frame that throws (docs/PROMPT20-LOG.md)', () => {
    /** A loop whose tick or frame throws while `broken.on` is set, and a record of what the loop told. */
    function broken(where: 'tick' | 'frame', withHook = true) {
      const driver = new ManualDriver();
      const seen = { ticks: 0, frames: 0, failures: [] as Array<{ error: unknown; streak: number }> };
      const state = { on: false };
      const loop = new GameLoop(
        {
          tick: () => {
            seen.ticks++;
            if (state.on && where === 'tick') throw new Error('tick broke');
          },
          frame: () => {
            seen.frames++;
            if (state.on && where === 'frame') throw new Error('frame broke');
          },
          ...(withHook ? { failed: (error: unknown, streak: number) => void seen.failures.push({ error, streak }) } : {}),
        },
        undefined,
        driver,
      );
      return { driver, seen, state, loop };
    }

    for (const where of ['tick', 'frame'] as const) {
      it(`a ${where} that throws is skipped: the next frame is asked for, and the loop goes on`, () => {
        const { driver, seen, state, loop } = broken(where);
        loop.start();
        driver.frame(0);
        state.on = true;
        driver.frame(16.667);
        expect(driver.active, 'the next frame was requested').toBe(1);
        expect(loop.isRunning).toBe(true);
        expect(seen.failures).toHaveLength(1);
        expect((seen.failures[0]!.error as Error).message).toBe(`${where} broke`);
        state.on = false;
        const before = seen.frames;
        driver.frame(16.667);
        driver.frame(16.667);
        expect(seen.frames, 'frames are drawn again').toBeGreaterThan(before);
      });
    }

    it('counts the frames that fail in a row and starts again from one after a good one', () => {
      const { driver, seen, state, loop } = broken('frame');
      loop.start();
      driver.frame(0);
      state.on = true;
      for (let i = 0; i < 4; i++) driver.frame(16.667);
      expect(seen.failures.map((f) => f.streak)).toEqual([1, 2, 3, 4]);
      state.on = false;
      driver.frame(16.667);
      state.on = true;
      driver.frame(16.667);
      expect(seen.failures.at(-1)!.streak, 'a good frame in between starts the count again').toBe(1);
    });

    it('whoever is told can stop the loop: it asks for no more frames then', () => {
      const driver = new ManualDriver();
      let loop!: GameLoop;
      let told = 0;
      loop = new GameLoop(
        {
          tick: () => undefined,
          frame: () => {
            throw new Error('always');
          },
          failed: (_error, streak) => {
            told = streak;
            if (streak >= 3) loop.stop();
          },
        },
        undefined,
        driver,
      );
      loop.start();
      for (let i = 0; i < 3; i++) driver.frame(16.667);
      expect(told).toBe(3);
      expect(loop.isRunning).toBe(false);
      expect(driver.active, 'and there is no frame left asked for').toBe(0);
    });

    it('the time a failed frame owed is not paid back in a burst by the next one', () => {
      const { driver, seen, state, loop } = broken('tick');
      loop.start();
      driver.frame(0);
      state.on = true;
      driver.frame(200); // a long frame whose ticks throw
      state.on = false;
      const ticks = seen.ticks;
      driver.frame(16.667);
      expect(seen.ticks - ticks, 'one tick for one frame, not the backlog of the failed one').toBeLessThanOrEqual(1);
    });

    it('without anyone to tell, the error is not swallowed: it reaches the browser — after the next frame was asked for', () => {
      const { driver, state, loop } = broken('frame', false);
      loop.start();
      driver.frame(0);
      state.on = true;
      expect(() => driver.frame(16.667)).toThrow('frame broke');
      expect(driver.active, 'the loop did not die of it').toBe(1);
    });
  });
});
