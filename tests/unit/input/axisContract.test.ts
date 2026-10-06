import { describe, expect, it } from 'vitest';
import { ACTIONS } from '@/input/InputFrame';
import { DEFAULT_BINDINGS } from '@/input/bindings';
import { InputManager } from '@/input/InputManager';

/**
 * The axis contract of `InputFrame` (docs/PROMPT5-LOG.md S13): digital sources are independent per axis, a stick is a
 * vector inside the unit disc, a touch drag clamps each axis on its own, and the strongest of each axis wins.
 *
 * It exists because of a Prompt 4 finding: the manager used to normalise EVERY combined vector, so a keyboard that held
 * right + down produced (0.707, −0.707) while the movement tests (and the simulation recordings the browser replays) use
 * the raw (1, −1). The horizontal speed of a run must never depend on the vertical key.
 */
function make() {
  const input = new InputManager();
  input.registerSource('kb', 'keyboard');
  input.registerSource('touch', 'touch', 'independent');
  input.registerSource('pad', 'gamepad'); // radial: a stick
  return input;
}

describe('axis contract: digital sources', () => {
  it('right + down is exactly (1, −1): the run speed does not drop because a vertical key is also held', () => {
    const input = make();
    input.setAction('kb', 'right', true);
    input.setAction('kb', 'down', true);
    const f = input.sample();
    expect(f.move.x).toBe(1);
    expect(f.move.y).toBe(-1);
  });

  it('right + up is exactly (1, 1), and the four diagonals are all (±1, ±1)', () => {
    const input = make();
    for (const [h, v] of [['right', 'up'], ['left', 'up'], ['right', 'down'], ['left', 'down']] as const) {
      input.releaseAll();
      input.setAction('kb', h, true);
      input.setAction('kb', v, true);
      const f = input.sample();
      expect([Math.abs(f.move.x), Math.abs(f.move.y)]).toEqual([1, 1]);
      expect(Math.sign(f.move.x)).toBe(h === 'right' ? 1 : -1);
      expect(Math.sign(f.move.y)).toBe(v === 'up' ? 1 : -1);
    }
  });

  it('the walk modifier only touches the horizontal axis', () => {
    const input = make();
    input.setAction('kb', 'right', true);
    input.setAction('kb', 'down', true);
    input.setAction('kb', 'walk', true);
    const f = input.sample();
    expect(f.move.x).toBe(0.5);
    expect(f.move.y).toBe(-1);
  });
});

describe('axis contract: analog sources', () => {
  it('a stick (radial) never leaves the unit disc and keeps its direction', () => {
    const input = make();
    input.setAxis('pad', 1, -1);
    const f = input.sample();
    expect(Math.hypot(f.move.x, f.move.y)).toBeCloseTo(1, 9);
    expect(f.move.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(f.move.y).toBeCloseTo(-Math.SQRT1_2, 9);
  });

  it('a stick inside the disc is passed through untouched (a gentle tilt still walks)', () => {
    const input = make();
    input.setAxis('pad', 0.4, -0.3);
    const f = input.sample();
    expect(f.move.x).toBeCloseTo(0.4, 12);
    expect(f.move.y).toBeCloseTo(-0.3, 12);
  });

  it('a touch drag (independent) clamps each axis on its own: running and crouching do not fight over the unit disc', () => {
    const input = make();
    input.setAxis('touch', 1, -0.7);
    const f = input.sample();
    expect(f.move.x).toBe(1);
    expect(f.move.y).toBeCloseTo(-0.7, 12);
    input.setAxis('touch', 3, -5);
    const g = input.sample();
    expect([g.move.x, g.move.y]).toEqual([1, -1]);
  });

  it('crouching by drag needs the same distance whether the finger is also pushing right or not', () => {
    // the crouch threshold of the simulation is move.y ≤ −0.6: with a radial clamp (1, −0.7) would become (0.82, −0.57) and miss it
    const input = make();
    input.setAxis('touch', 0, -0.7);
    const still = input.sample().move.y;
    input.setAxis('touch', 1, -0.7);
    const running = input.sample().move.y;
    expect(running).toBe(still);
    expect(running).toBeLessThanOrEqual(-0.6);
  });

  it('the strongest magnitude of each axis wins across digital and analog sources', () => {
    const input = make();
    input.setAction('kb', 'right', true); // x = 1
    input.setAxis('touch', 0.3, -0.8); // y wins, x does not
    const f = input.sample();
    expect(f.move.x).toBe(1);
    expect(f.move.y).toBeCloseTo(-0.8, 12);
  });

  it('a released source stops contributing its axes', () => {
    const input = make();
    input.setAxis('touch', 1, -1);
    input.sample();
    input.releaseSource('touch');
    const f = input.sample();
    expect([f.move.x, f.move.y]).toEqual([0, 0]);
  });
});

describe('bottle, interact and drop', () => {
  it('the bottle key asks for "the next one that is ready" (slot −1)', () => {
    const input = make();
    input.setAction('kb', 'bottle', true);
    const f = input.sample();
    expect(f.bottlePressed).toBe(true);
    expect(f.bottleSlot).toBe(-1);
  });

  it('tapping a bottle icon asks for that slot, once', () => {
    const input = make();
    input.requestBottle('touch', 2);
    const f = input.sample();
    expect(f.bottlePressed).toBe(true);
    expect(f.bottleSlot).toBe(2);
    expect(input.device).toBe('touch');
    const g = input.sample();
    expect(g.bottlePressed).toBe(false);
    expect(g.bottleSlot).toBe(-1);
  });

  it('the contextual chip asks for the next ready bottle (slot −1) and the last request in a tick wins', () => {
    const input = make();
    input.requestBottle('touch', 1);
    input.requestBottle('touch'); // chip
    expect(input.sample().bottleSlot).toBe(-1);
    input.requestBottle('touch', 3);
    expect(input.sample().bottleSlot).toBe(3);
  });

  it('interact and drop are edges: a tap shorter than a tick is delivered exactly once', () => {
    const input = make();
    for (const action of ['interact', 'drop'] as const) {
      input.setAction('touch', action, true);
      input.setAction('touch', action, false);
    }
    const f = input.sample();
    expect([f.interactPressed, f.dropPressed]).toEqual([true, true]);
    const g = input.sample();
    expect([g.interactPressed, g.dropPressed]).toEqual([false, false]);
  });

  it('a held interact key is one press, not one per tick', () => {
    const input = make();
    input.setAction('kb', 'interact', true);
    expect(input.sample().interactPressed).toBe(true);
    expect(input.sample().interactPressed).toBe(false);
  });
});

describe('manager housekeeping', () => {
  it('a poller can be removed again (a pad that is unplugged stops being polled)', () => {
    const input = make();
    let calls = 0;
    const remove = input.addPoller(() => void calls++);
    input.sample();
    remove();
    input.sample();
    expect(calls).toBe(1);
  });

  it('sample() does not allocate: the frame and its move vector are reused', () => {
    const input = make();
    input.setAxis('touch', 0.5, 0);
    const a = input.sample();
    const b = input.sample();
    expect(a).toBe(b);
    expect(a.move).toBe(b.move);
  });
});

describe('bindings data', () => {
  it('every logical action has a keyboard entry (drop has none: it is down + jump on a keyboard)', () => {
    for (const a of ACTIONS) expect(DEFAULT_BINDINGS.keyboard[a], a).toBeDefined();
    expect(DEFAULT_BINDINGS.keyboard.drop).toEqual([]);
  });

  it('follows GAME-SPEC-2D §4.2: bottle L / Q / LB, interact E / LT', () => {
    expect(DEFAULT_BINDINGS.keyboard.bottle).toEqual(['KeyL', 'KeyQ']);
    expect(DEFAULT_BINDINGS.keyboard.interact).toEqual(['KeyE']);
    expect(DEFAULT_BINDINGS.gamepad.buttons.bottle).toEqual([4]);
    expect(DEFAULT_BINDINGS.gamepad.buttons.interact).toEqual([6]);
    expect(DEFAULT_BINDINGS.gamepad.buttons.jump).toEqual([0]);
    expect(DEFAULT_BINDINGS.gamepad.buttons.attack).toEqual([2]);
    expect(DEFAULT_BINDINGS.gamepad.buttons.dash).toEqual([1, 5]);
    expect(DEFAULT_BINDINGS.gamepad.buttons.ability).toEqual([3]);
    expect(DEFAULT_BINDINGS.gamepad.deadZone).toBe(0.22);
  });

  it('no key is bound to two different actions by default (a key press has one meaning)', () => {
    const seen = new Map<string, string>();
    for (const a of ACTIONS) {
      for (const code of DEFAULT_BINDINGS.keyboard[a]) {
        expect(seen.get(code), `${code}: ${a} vs ${seen.get(code)}`).toBeUndefined();
        seen.set(code, a);
      }
    }
  });
});
