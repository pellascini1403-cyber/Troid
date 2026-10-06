import { describe, expect, it } from 'vitest';
import { DEFAULT_TOUCH, uiScale, type TouchConfig } from '@/input/gestures/TouchConfig';
import { TouchGestureRecognizer, type GestureSink } from '@/input/gestures/TouchGestureRecognizer';

/**
 * The movement gesture, with synthetic pointer sequences (docs/GAME-SPEC-2D.md §4.3.1–§4.3.3). Distances in dp at scale 1:
 * Rx = 56, Ry = 44, dead zone 0.12, jump enter 0.55 (24.2 dp) / hold 0.30 (13.2 dp) / rearm 0.25 (11 dp), flick down 28 dp in 100 ms.
 */
interface Log {
  move: Array<[number, number]>;
  jump: boolean[];
  drops: number;
}

function rig(cfg: Readonly<TouchConfig> = DEFAULT_TOUCH, scale = 1) {
  const log: Log = { move: [], jump: [], drops: 0 };
  const sink: GestureSink = {
    move: (x, y) => log.move.push([x, y]),
    jump: (d) => log.jump.push(d),
    drop: () => void log.drops++,
  };
  const r = new TouchGestureRecognizer(sink, cfg, () => scale);
  let t = 0;
  return {
    r,
    log,
    /** Advances the clock; the finger positions below are stamped with it. */
    at(ms: number) {
      t = ms;
      return t;
    },
    down: (id: number, x: number, y: number, ms = 0) => r.down(id, x, y, (t = ms)),
    move: (id: number, x: number, y: number, ms = t) => r.move(id, x, y, (t = ms)),
    last: () => log.move[log.move.length - 1] ?? [NaN, NaN],
  };
}

describe('movement: the floating origin and the horizontal axis', () => {
  it('a tap with no displacement does nothing: no movement, no jump, no drop', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.r.up(1);
    expect(g.log.move.every(([x, y]) => x === 0 && y === 0)).toBe(true);
    expect(g.log.jump).toEqual([]);
    expect(g.log.drops).toBe(0);
  });

  it('the contact point is the origin: dragging Rx to the right is a full-speed run, whatever the screen position', () => {
    for (const x0 of [10, 120, 300]) {
      const g = rig();
      g.down(1, x0, 300);
      g.move(1, x0 + 56, 300, 100);
      expect(g.last()).toEqual([1, 0]);
    }
  });

  it('the dead zone (12 % of Rx = 6.72 dp) reads zero; past it the rest is rescaled so the walk starts from nothing', () => {
    const g = rig();
    g.down(1, 100, 300);
    g.move(1, 100 + 6, 300, 50);
    expect(g.last()[0]).toBe(0);
    g.move(1, 100 + 7, 300, 100);
    expect(g.last()[0]).toBeGreaterThan(0);
    expect(g.last()[0]).toBeLessThan(0.01);
    g.move(1, 100 + 28, 300, 150); // half of Rx
    expect(g.last()[0]).toBeCloseTo((0.5 - 0.12) / 0.88, 6);
  });

  it('left is symmetric', () => {
    const g = rig();
    g.down(1, 200, 300);
    g.move(1, 200 - 56, 300, 100);
    expect(g.last()[0]).toBe(-1);
  });

  it('past the radius the origin follows the finger: reversing takes only a short drag, not the whole way back', () => {
    const g = rig();
    g.down(1, 100, 300);
    g.move(1, 220, 300, 200); // 120 dp right: origin is now at 164
    expect(g.last()[0]).toBe(1);
    expect(g.r.state.originX).toBeCloseTo(164, 9);
    g.move(1, 164, 300, 300); // back to where the origin is: neutral
    expect(g.last()[0]).toBe(0);
    g.move(1, 164 - 56, 300, 400); // one radius to the left of the new origin
    expect(g.last()[0]).toBe(-1);
  });

  it('with followOrigin off the drag saturates and coming back needs the whole way', () => {
    const g = rig({ ...DEFAULT_TOUCH, followOrigin: false });
    g.down(1, 100, 300);
    g.move(1, 220, 300, 200);
    expect(g.r.state.originX).toBe(100);
    g.move(1, 164, 300, 300);
    expect(g.last()[0]).toBeGreaterThan(0.9); // still well right of the original origin
  });

  it('uiScale stretches every distance: at 1.6 a full run takes 89.6 px, not 56', () => {
    const g = rig(DEFAULT_TOUCH, 1.6);
    g.down(1, 100, 300);
    g.move(1, 100 + 56, 300, 100);
    expect(g.last()[0]).toBeLessThan(1);
    g.move(1, 100 + 89.6, 300, 200);
    expect(g.last()[0]).toBeCloseTo(1, 9);
  });

  it('uiScale follows the design formula and stays within 0.9 … 1.6', () => {
    expect(uiScale(844, 390)).toBeCloseTo(819 / 844, 9);
    expect(uiScale(300, 100)).toBe(0.9);
    expect(uiScale(4000, 2000)).toBe(1.6);
    expect(uiScale(1688, 900)).toBe(1.6 > 1688 / 844 ? 1688 / 844 : 1.6);
    expect(uiScale(844, 1000)).toBe(1);
  });
});

describe('jump: dragging or flicking UP with the movement finger', () => {
  it('crossing 0.55 of Ry (24.2 dp) up presses the jump once; the vertical axis is passed on as it is', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 120, 300 - 20, 40);
    expect(g.log.jump).toEqual([]);
    expect(g.last()[1]).toBeCloseTo(20 / 44, 9);
    g.move(1, 120, 300 - 25, 60);
    expect(g.log.jump).toEqual([true]);
  });

  it('stays held while the drag is above 0.30 and releases when it falls below it', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 120, 270, 40); // ay 0.68 → jump
    g.move(1, 120, 300 - 14, 80); // ay 0.318 ≥ hold: still held
    expect(g.log.jump).toEqual([true]);
    g.move(1, 120, 300 - 12, 120); // ay 0.27 < hold: released
    expect(g.log.jump).toEqual([true, false]);
  });

  it('does not fire again while the thumb stays up; it needs to come back to 0.25 (11 dp) first (re-arming)', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 120, 270, 20); // jump
    g.move(1, 120, 288, 40); // ay 0.27: released, NOT re-armed (0.27 > 0.25)
    g.move(1, 120, 268, 60); // up again: no second jump
    expect(g.log.jump).toEqual([true, false]);
    g.move(1, 120, 290, 80); // ay 0.227 ≤ 0.25: armed again (hold already released)
    g.move(1, 120, 268, 100); // up again: jump
    expect(g.log.jump).toEqual([true, false, true]);
  });

  it('a flick released at once is a press followed by a release (the simulation turns it into a short hop)', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 120, 250, 30);
    g.r.up(1);
    expect(g.log.jump).toEqual([true, false]);
  });

  it('run and jump at once: a diagonal drag up-right is a full run AND a jump (the axes are independent)', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 176, 270, 40);
    expect(g.last()).toEqual([1, 30 / 44]);
    expect(g.log.jump).toEqual([true]);
  });

  it('from a crouch: sliding the finger from down to up crosses the threshold (≈ 1.15 Ry) without lifting it', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 120, 330, 400); // crouching (ay −0.68)
    expect(g.last()[1]).toBeLessThan(-0.6);
    g.move(1, 120, 300 - 25 + 0, 800); // origin followed? no: only 30 down of 44; up 55 from the lowest → cross
    expect(g.log.jump).toEqual([true]);
  });

  it('a long drag up keeps the jump held: the origin follows, so the finger needs a short way back to let go', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 120, 150, 100); // 150 dp up: ay saturates at 1, origin moves to 194
    expect(g.r.state.originY).toBeCloseTo(194, 9);
    expect(g.r.state.ay).toBe(1);
    g.move(1, 120, 194 - 20, 200); // 20 dp above the new origin: ay 0.45 still ≥ hold
    expect(g.log.jump).toEqual([true]);
    g.move(1, 120, 194 - 10, 300); // 10 dp: ay 0.227 < hold → release
    expect(g.log.jump).toEqual([true, false]);
  });
});

describe('crouch: dragging DOWN', () => {
  it('passes a negative vertical axis the simulation turns into a crouch (≤ −0.6 enters, ≥ −0.4 leaves)', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 120, 300 + 27, 400);
    expect(g.last()[1]).toBeCloseTo(-27 / 44, 9);
    expect(g.last()[1]).toBeLessThanOrEqual(-0.6);
    g.move(1, 120, 300 + 15, 500);
    expect(g.last()[1]).toBeGreaterThan(-0.4);
  });

  it('crouch and run: dragging down-right keeps the horizontal axis untouched by the vertical one', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 176, 330, 400);
    expect(g.last()[0]).toBe(1);
    expect(g.last()[1]).toBeLessThan(-0.6);
  });

  it('a slow drag down never drops through a platform (it is only a crouch)', () => {
    const g = rig();
    g.down(1, 120, 300, 0);
    for (let i = 1; i <= 20; i++) g.move(1, 120, 300 + i * 3, i * 40); // 60 dp over 800 ms
    expect(g.log.drops).toBe(0);
  });
});

describe('drop: a FLICK down (28 dp within 100 ms)', () => {
  it('emits a drop once', () => {
    const g = rig();
    g.down(1, 120, 300, 0);
    g.move(1, 120, 312, 33);
    g.move(1, 120, 330, 66); // 30 dp in 66 ms
    expect(g.log.drops).toBe(1);
  });

  it('does not fire for 27 dp in the window, nor for 40 dp over 300 ms', () => {
    const slow = rig();
    slow.down(1, 120, 300, 0);
    slow.move(1, 120, 313, 50);
    slow.move(1, 120, 327, 100);
    expect(slow.log.drops).toBe(0);
    const g = rig();
    g.down(1, 120, 300, 0);
    for (let i = 1; i <= 6; i++) g.move(1, 120, 300 + i * 7, i * 50);
    expect(g.log.drops).toBe(0);
  });

  it('a long fast swipe is ONE drop, not one per 28 dp', () => {
    const g = rig();
    g.down(1, 120, 300, 0);
    for (let i = 1; i <= 8; i++) g.move(1, 120, 300 + i * 20, i * 20); // 160 dp in 160 ms
    expect(g.log.drops).toBe(1);
  });

  it('after the swipe is over, the next flick counts again', () => {
    const g = rig();
    g.down(1, 120, 300, 0);
    g.move(1, 120, 332, 50); // flick 1
    g.move(1, 120, 333, 400); // the finger rests
    g.move(1, 120, 340, 800);
    g.move(1, 120, 372, 850); // flick 2
    expect(g.log.drops).toBe(2);
  });

  it('a flick UP is not a drop', () => {
    const g = rig();
    g.down(1, 120, 300, 0);
    g.move(1, 120, 260, 40);
    expect(g.log.drops).toBe(0);
  });

  it('the distance scales with uiScale', () => {
    const g = rig(DEFAULT_TOUCH, 1.5); // 42 dp needed
    g.down(1, 120, 300, 0);
    g.move(1, 120, 300 + 35, 50);
    expect(g.log.drops).toBe(0);
    g.move(1, 120, 300 + 43, 80);
    expect(g.log.drops).toBe(1);
  });
});

describe('one finger owns the zone', () => {
  it('a second finger is ignored while the first is down, and its moves and release change nothing', () => {
    const g = rig();
    expect(g.down(1, 120, 300)).toBe(true);
    expect(g.down(2, 60, 200)).toBe(false);
    g.move(1, 176, 300, 100);
    const before = g.last();
    g.move(2, 0, 0, 120); // not the movement pointer
    g.r.up(2);
    expect(g.last()).toEqual(before);
    expect(g.r.activePointer).toBe(1);
  });

  it('once the first lifts the zone is free for the NEXT touch (the ignored finger does not become the mover)', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.down(2, 60, 200);
    g.r.up(1);
    expect(g.r.activePointer).toBeNull();
    g.move(2, 100, 200, 50);
    expect(g.last()).toEqual([0, 0]);
    expect(g.down(3, 80, 250)).toBe(true);
  });

  it('lifting the finger stops the run and lets go of the jump', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 176, 260, 50);
    expect(g.log.jump).toEqual([true]);
    g.r.up(1);
    expect(g.last()).toEqual([0, 0]);
    expect(g.log.jump).toEqual([true, false]);
  });

  it('a cancelled pointer (the system took the touch) lets go of everything, exactly like lifting', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 176, 260, 50);
    g.r.cancel(1);
    expect(g.last()).toEqual([0, 0]);
    expect(g.log.jump).toEqual([true, false]);
    expect(g.r.activePointer).toBeNull();
  });

  it('release() (blur, a rotation, a pause) frees the zone and is harmless when nothing is held', () => {
    const g = rig();
    g.r.release();
    expect(g.log.move).toEqual([]);
    g.down(1, 120, 300);
    g.move(1, 176, 250, 50);
    g.r.release();
    expect(g.last()).toEqual([0, 0]);
    expect(g.log.jump).toEqual([true, false]);
    g.r.release();
    expect(g.log.jump).toEqual([true, false]);
  });

  it('a new finger starts from a clean slate: armed, no stale origin, no stale jump', () => {
    const g = rig();
    g.down(1, 120, 300);
    g.move(1, 120, 270, 40);
    g.r.up(1);
    g.down(2, 400, 100, 200);
    expect(g.r.state).toMatchObject({ pointer: 2, originX: 400, originY: 100, ax: 0, ay: 0, armed: true, jumping: false });
    g.move(2, 400, 70, 240);
    expect(g.log.jump).toEqual([true, false, true]);
  });
});
