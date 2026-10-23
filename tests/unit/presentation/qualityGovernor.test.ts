import { describe, expect, it } from 'vitest';
import { DEFAULT_GOVERNOR, QualityGovernor } from '@/presentation/qualityGovernor';

/**
 * AN AUTOMATIC QUALITY THAT MEASURES (docs/PROMPT20-LOG.md §7): the decision, as a function of the frame durations it is told about. What is proven is the policy — when it steps down and, as much, when it does NOT: a
 * device that keeps up is never touched, one-off hitches are not slowness, frames that say nothing about the device are not counted, and it speaks once.
 */
const FAST = 1000 / 60;
const SLOW = 1000 / 30;
/** The earliest it may speak: after the start-up it lets go by and 90 % of a window (a millisecond of slack: the durations are not whole numbers, and a sum of them lands on the threshold to the last bit). */
const EARLIEST = DEFAULT_GOVERNOR.settleMs + DEFAULT_GOVERNOR.windowMs * 0.9 - 1;

/** Feeds `ms` of frames of `dt` and returns the moment (ms of counted time) it fired at, or `null`. */
function run(g: QualityGovernor, ms: number, dt: number, counts = true, from = 0): number | null {
  for (let t = 0; t < ms; t += dt) if (g.frame(dt, counts)) return from + t;
  return null;
}

describe('a device that keeps up is never touched', () => {
  it('60 frames a second, for an hour', () => {
    expect(run(new QualityGovernor(), 3_600_000, FAST)).toBeNull();
  });

  it('a 120 Hz screen, and a device that drops now and then to 40 frames a second (a quarter of the frames) is still fine', () => {
    expect(run(new QualityGovernor(), 600_000, 1000 / 120)).toBeNull();
    const g = new QualityGovernor();
    for (let i = 0; i < 40_000; i++) expect(g.frame(i % 4 === 0 ? 25 : FAST, true)).toBe(false);
  });

  it('one long hitch — a garbage collection, a texture upload, a room that loads — is not slowness', () => {
    const g = new QualityGovernor();
    run(g, 20_000, FAST);
    for (const hitch of [80, 150, 400, 900]) {
      expect(g.frame(hitch, true)).toBe(false);
      expect(run(g, 3000, FAST)).toBeNull();
    }
  });

  it('a frame longer than a second is an interruption (a background tab, a debugger, a call) and is not counted at all', () => {
    const g = new QualityGovernor();
    for (let i = 0; i < 400; i++) expect(g.frame(5000, true), 'however many there are').toBe(false);
    expect(run(g, 60_000, FAST)).toBeNull();
    expect(g.summary.frames).toBeGreaterThan(0);
  });
});

describe('a device that cannot keep up', () => {
  it('30 frames a second steps down once, after the start-up it lets go by and a stretch of frames, and says so only once', () => {
    const g = new QualityGovernor();
    const at = run(g, 60_000, SLOW);
    expect(at, 'fired').not.toBeNull();
    // the settle (4 s) and the window (4 s, judged from 90 % of it): the game is not judged in its first moments, and not on a handful of frames either
    expect(at! + SLOW, 'by the end of the frame that decided it').toBeGreaterThanOrEqual(EARLIEST);
    expect(at!).toBeLessThan(DEFAULT_GOVERNOR.settleMs + DEFAULT_GOVERNOR.windowMs + 2000);
    expect(run(g, 600_000, SLOW), 'it speaks once').toBeNull();
    expect(g.summary.slow).toBe(g.summary.frames);
  });

  it('a device at 15 frames a second steps down as well (the slower, the sooner it is plain)', () => {
    expect(run(new QualityGovernor(), 60_000, 1000 / 15)).not.toBeNull();
  });

  it('it takes most of the frames, not some: 70 % slow frames is not enough, 90 % is', () => {
    const mixed = (slowShare: number): number | null => {
      const g = new QualityGovernor();
      for (let i = 0; i < 20_000; i++) if (g.frame(i % 100 < slowShare * 100 ? 40 : FAST, true)) return i;
      return null;
    };
    expect(mixed(0.7)).toBeNull();
    expect(mixed(0.9)).not.toBeNull();
  });

  it('a stretch of slow play after a long fast one is judged on the recent frames, not on the hour before', () => {
    const g = new QualityGovernor();
    expect(run(g, 600_000, FAST)).toBeNull();
    const at = run(g, 60_000, SLOW);
    expect(at).not.toBeNull();
    expect(at!).toBeLessThan(DEFAULT_GOVERNOR.windowMs + 2000); // (the start-up was let go by long ago)
  });
});

describe('frames that say nothing about the device', () => {
  it('while the menu is open, the world held or the page hidden (counts = false), nothing is judged, however slow', () => {
    const g = new QualityGovernor();
    expect(run(g, 3_600_000, SLOW, false)).toBeNull();
    expect(g.summary.frames).toBe(0);
  });

  it('they do not use up the start-up either: the first moments of play are still let go by, counted in the frames that count', () => {
    const g = new QualityGovernor();
    run(g, 60_000, SLOW, false);
    const at = run(g, 60_000, SLOW);
    expect(at! + SLOW, 'by the end of the frame that decided it').toBeGreaterThanOrEqual(EARLIEST);
  });

  it('what came before them does not follow from them: slow play, a menu, then fast play, does not add up to a decision', () => {
    const g = new QualityGovernor();
    run(g, 6000, SLOW); // 2 s into the window of slow frames (the start-up has gone by)
    run(g, 3000, SLOW, false); // the menu
    expect(g.summary.frames, 'the window is forgotten').toBe(0);
    expect(run(g, 600_000, FAST)).toBeNull();
  });
});

describe('after it', () => {
  it('reset() — the player picked Auto again — waits again before judging, and can step down again', () => {
    const g = new QualityGovernor();
    expect(run(g, 60_000, SLOW)).not.toBeNull();
    g.reset();
    expect(g.summary.frames).toBe(0);
    const again = run(g, 60_000, SLOW);
    expect(again).not.toBeNull();
    expect(again! + SLOW).toBeGreaterThanOrEqual(EARLIEST);
  });

  it('is the same every time (no clock, no randomness)', () => {
    const feed = (): number | null => run(new QualityGovernor(), 60_000, 31);
    expect(feed()).toBe(feed());
  });

  it('the thresholds can be chosen, and a bad duration is not a frame', () => {
    const g = new QualityGovernor({ slowMs: 100, settleMs: 0, windowMs: 1000, share: 0.5 });
    expect(run(g, 20_000, SLOW), '33 ms is not slow when slow means 100').toBeNull();
    for (const bad of [0, -5, Number.NaN]) expect(g.frame(bad, true)).toBe(false);
    const quick = new QualityGovernor({ settleMs: 0, windowMs: 1000 });
    expect(run(quick, 5000, 40)).not.toBeNull();
  });
});
