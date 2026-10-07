import { describe, expect, it } from 'vitest';
import { BOSS_BAR, computeBossBarLayout, type Box0 } from '@/ui/hud/bossBarLayout';
import { NO_INSETS } from '@/ui/touch/layout';

/**
 * Where the boss's bar goes (docs/PROMPT6-LOG.md S31): the bottom centre of the safe area, 46 % of its width up to 440 px, and out of the way of the touch
 * buttons — it slides into the widest free stretch of its band, as near the centre as it can, and only shrinks if no stretch is as wide as it wants.
 */
const box = (x0: number, y0: number, x1: number, y1: number): Box0 => ({ x0, y0, x1, y1 });
/** A button's area that reaches the band of the bar in a window `h` px tall (it is as high as the bar and a little more). */
const inBand = (x0: number, x1: number, h = 390): Box0 => box(x0, h - BOSS_BAR.bottom - BOSS_BAR.height - 10, x1, h - 4);

describe('computeBossBarLayout', () => {
  it('is centred at the bottom of the window, 46 % of its width, 18 px above the edge', () => {
    const b = computeBossBarLayout(844, 390, NO_INSETS);
    expect(b.width).toBeCloseTo(844 * 0.46, 9);
    expect(b.x + b.width / 2).toBeCloseTo(422, 9);
    expect(b.y + b.height).toBe(390 - BOSS_BAR.bottom);
    expect(b.height).toBe(BOSS_BAR.height);
  });

  it('never gets wider than 440 px, however big the window', () => {
    for (const w of [1000, 1280, 2520]) expect(computeBossBarLayout(w, 800, NO_INSETS).width).toBe(440);
  });

  it('is centred in what is USABLE (inside the safe area) and rises above the bottom inset', () => {
    const b = computeBossBarLayout(844, 390, { top: 0, right: 59, bottom: 34, left: 0 });
    expect(b.x + b.width / 2).toBeCloseTo((844 - 59) / 2, 9);
    expect(b.width).toBeCloseTo((844 - 59) * 0.46, 9);
    expect(b.y + b.height).toBe(390 - 34);
  });

  it('a button under its centre moves it aside: into the widest stretch next to the button, keeping the gap (and shrinking only as far as that stretch asks)', () => {
    const b = computeBossBarLayout(844, 390, NO_INSETS, [inBand(330, 480)]);
    // the stretches are [0, 322] and [488, 844]: the second is the wider (356 < the 388 it wants, so the bar takes all of it)
    expect(b.x).toBeCloseTo(488, 9);
    expect(b.x + b.width).toBeCloseTo(844, 9);
    // with room for all of it, the full width is kept and it sits as near the centre as the gap allows
    const roomy = computeBossBarLayout(1280, 720, NO_INSETS, [inBand(1000, 1200, 720)]);
    expect(roomy.width).toBe(440);
    expect(roomy.x + roomy.width).toBeLessThanOrEqual(1000 - BOSS_BAR.gap + 1e-9);
    expect(roomy.x + roomy.width / 2).toBeCloseTo(640, 9); // the centre was free: it did not move at all
  });

  it('chooses the stretch nearest the centre when two are wide enough', () => {
    const b = computeBossBarLayout(1280, 720, NO_INSETS, [inBand(600, 700, 720)]);
    // the stretches: [0, 592] and [708, 1280] — both fit 440; the first is nearer to 640 (its right edge is 48 away; the second's left edge is 68 away)
    expect(b.x + b.width).toBeLessThanOrEqual(592 + 1e-9);
    expect(b.x + b.width).toBeCloseTo(592, 9);
  });

  it('a button that does not reach the band does not move the bar', () => {
    const above = box(300, 100, 500, 390 - 18 - BOSS_BAR.height - BOSS_BAR.gap - 1); // ends just above the band
    const b = computeBossBarLayout(844, 390, NO_INSETS, [above]);
    expect(b).toEqual(computeBossBarLayout(844, 390, NO_INSETS));
  });

  it('shrinks only when no free stretch is as wide as it wants: it fills the widest one, inside it', () => {
    const b = computeBossBarLayout(844, 390, NO_INSETS, [inBand(100, 300), inBand(480, 600)]);
    // [0, 92] · [308, 472] · [608, 844] → the last is the widest (236) and the bar (388) shrinks to it
    expect(b.x).toBeCloseTo(608, 9);
    expect(b.width).toBeCloseTo(236, 9);
  });

  it('with the whole band taken it falls back to the centre rather than disappearing (it draws nothing that can be touched: it is only seen)', () => {
    const b = computeBossBarLayout(844, 390, NO_INSETS, [inBand(-10, 900)]);
    expect(b).toEqual(computeBossBarLayout(844, 390, NO_INSETS));
  });

  it('every number is finite for a window that is zero, negative or tiny', () => {
    for (const [w, h] of [[0, 0], [10, 10], [100, 50], [-5, -5]] as const) {
      const b = computeBossBarLayout(w, h, { top: 99, right: 99, bottom: 99, left: 99 }, [box(0, 0, 50, 50)]);
      for (const v of [b.x, b.y, b.width, b.height]) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
