import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, type Bindings } from '@/input/bindings';
import { InputManager } from '@/input/InputManager';
import { attachGamepad, type PadSnapshot } from '@/input/sources/GamepadSource';
import { FakePad, PAD, padList } from '../../helpers/gamepad';

/**
 * The gamepad goes through the same abstraction as the keyboard and the touch layer (docs/GAME-SPEC-2D.md §4.2): a stick
 * with a RADIAL dead zone of 0.22, the buttons mapped to logical actions by data, hot-plug, nothing stuck on unplugging.
 * It is tested with an abstract pad (tests/helpers/gamepad.ts): no physical device.
 */
function setup(...pads: Array<FakePad | null>) {
  const input = new InputManager();
  const bindings: Bindings = structuredClone(DEFAULT_BINDINGS);
  const list = padList(...pads);
  const handle = attachGamepad(input, () => bindings, list.provider);
  return { input, bindings, handle, ...list };
}

describe('button mapping (standard layout)', () => {
  it('A jumps, X attacks, B and RB dash, Y uses the ability, LB drinks a bottle, LT interacts, Start pauses', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    const frameWith = (i: number) => {
      pad.press(i);
      const f = input.sample();
      const out = { ...f, move: { ...f.move } };
      pad.release(i);
      input.sample();
      return out;
    };
    expect(frameWith(PAD.A).jumpPressed).toBe(true);
    expect(frameWith(PAD.X).attackPressed).toBe(true);
    expect(frameWith(PAD.B).dashPressed).toBe(true);
    expect(frameWith(PAD.RB).dashPressed).toBe(true);
    expect(frameWith(PAD.Y).abilityPressed).toBe(true);
    const bottle = frameWith(PAD.LB);
    expect([bottle.bottlePressed, bottle.bottleSlot]).toEqual([true, -1]);
    expect(frameWith(PAD.LT).interactPressed).toBe(true);
    expect(frameWith(PAD.START).pausePressed).toBe(true);
  });

  it('an unmapped button (Back, RT, the stick clicks) does nothing', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    for (const i of [PAD.BACK, PAD.RT, 10, 11]) pad.press(i);
    const f = input.sample();
    expect([f.jumpPressed, f.attackPressed, f.dashPressed, f.abilityPressed, f.bottlePressed, f.interactPressed, f.pausePressed]).toEqual([false, false, false, false, false, false, false]);
    expect([f.move.x, f.move.y]).toEqual([0, 0]);
  });

  it('a held button is one press then held, and its release is an edge (jump height is the simulation\'s business)', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.press(PAD.A);
    expect([input.sample().jumpPressed, input.sample().jumpHeld]).toEqual([true, true]);
    const held = input.sample();
    expect([held.jumpPressed, held.jumpHeld]).toEqual([false, true]);
    pad.release(PAD.A);
    const f = input.sample();
    expect([f.jumpHeld, f.jumpReleased]).toEqual([false, true]);
  });

  it('the D-pad is four digital directions: independent axes, exactly ±1 (right + down = (1, −1))', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.press(PAD.RIGHT).press(PAD.DOWN);
    const f = input.sample();
    expect([f.move.x, f.move.y]).toEqual([1, -1]);
    pad.release(PAD.RIGHT).release(PAD.DOWN).press(PAD.LEFT).press(PAD.UP);
    const g = input.sample();
    expect([g.move.x, g.move.y]).toEqual([-1, 1]);
  });

  it('an analog trigger counts as pressed past half travel even when the browser does not raise `pressed`', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.analog(PAD.LT, 0.3);
    expect(input.sample().interactPressed).toBe(false);
    pad.analog(PAD.LT, 0.7);
    expect(input.sample().interactPressed).toBe(true);
  });

  it('remapping is data: change the binding and the new button works at once, the old one stops', () => {
    const pad = new FakePad();
    const { input, bindings } = setup(pad);
    bindings.gamepad.buttons.jump = [PAD.RT];
    pad.press(PAD.A);
    expect(input.sample().jumpPressed).toBe(false);
    pad.release(PAD.A).press(PAD.RT);
    expect(input.sample().jumpPressed).toBe(true);
  });

  it('using the pad makes it the current device (prompts show the pad\'s glyphs)', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    expect(input.sample().device).toBe('keyboard');
    pad.press(PAD.X);
    expect(input.sample().device).toBe('gamepad');
  });
});

describe('left stick: radial dead zone 0.22 and analog tilt', () => {
  const dz = DEFAULT_BINDINGS.gamepad.deadZone;

  it('inside the dead zone the stick reads zero (drift never moves the hero), whatever the direction', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    for (const [x, y] of [[0.2, 0], [0, 0.2], [0.15, 0.15], [-0.21, 0], [0, -0.219]] as const) {
      pad.stick(x, y);
      const f = input.sample();
      expect([f.move.x, f.move.y], `${x},${y}`).toEqual([0, 0]);
    }
  });

  it('the dead zone is radial, not a cross: (0.2, 0.2) has |v| = 0.28 > 0.22 and DOES move', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.stick(0.2, 0.2);
    const f = input.sample();
    expect(Math.hypot(f.move.x, f.move.y)).toBeGreaterThan(0);
  });

  it('just outside the zone the movement starts from nothing; at full tilt it reaches exactly 1', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.stick(dz + 0.01, 0);
    expect(input.sample().move.x).toBeGreaterThan(0);
    expect(input.sample().move.x).toBeLessThan(0.02);
    pad.stick(1, 0);
    expect(input.sample().move.x).toBe(1);
    pad.stick(-1, 0);
    expect(input.sample().move.x).toBe(-1);
  });

  it('rescales (|v| − dz) / (1 − dz): half tilt → 0.3590…, and the direction is kept', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.stick(0.5, 0);
    expect(input.sample().move.x).toBeCloseTo((0.5 - dz) / (1 - dz), 9);
    pad.stick(0.3, -0.4); // |v| = 0.5, pointing right and down
    const f = input.sample();
    const k = (0.5 - dz) / (1 - dz) / 0.5;
    expect(f.move.x).toBeCloseTo(0.3 * k, 9);
    expect(f.move.y).toBeCloseTo(0.4 * k, 9); // the API's +y is down, the frame's +y is up: flipped
  });

  it('stick up reports a negative axis in the Gamepad API and a positive move.y in the frame', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.stick(0, -1);
    expect(input.sample().move.y).toBe(1);
    pad.stick(0, 1);
    expect(input.sample().move.y).toBe(-1); // crouch
  });

  it('a diagonal at the corner of a square gate stays inside the unit disc (radial)', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.stick(1, 1);
    const f = input.sample();
    expect(Math.hypot(f.move.x, f.move.y)).toBeCloseTo(1, 9);
  });

  it('a gentle tilt walks and a firm push runs: the analog value reaches the simulation unchanged', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.stick(0.45, 0);
    const walk = input.sample().move.x;
    pad.stick(0.95, 0);
    const run = input.sample().move.x;
    expect(walk).toBeLessThan(0.3);
    expect(run).toBeGreaterThan(0.9);
  });

  it('the dead zone is data (bindings.gamepad.deadZone): a looser pad can be tuned', () => {
    const pad = new FakePad();
    const { input, bindings } = setup(pad);
    bindings.gamepad.deadZone = 0.4;
    pad.stick(0.3, 0);
    expect(input.sample().move.x).toBe(0);
    pad.stick(0.7, 0);
    expect(input.sample().move.x).toBeCloseTo((0.7 - 0.4) / 0.6, 9);
  });

  it('NaN and missing axes are treated as 0', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    pad.stick(Number.NaN, Number.POSITIVE_INFINITY);
    const f = input.sample();
    expect([f.move.x, f.move.y]).toEqual([0, 0]);
    (pad.axes as number[]).length = 0; // a pad that reports no axes at all
    expect(input.sample().move.x).toBe(0);
  });

  it('stick and keyboard coexist: the stronger axis wins, nothing cancels the other', () => {
    const pad = new FakePad();
    const { input } = setup(pad);
    input.registerSource('kb', 'keyboard');
    input.setAction('kb', 'right', true);
    pad.stick(-0.5, 0);
    expect(input.sample().move.x).toBe(1);
  });
});

describe('hot-plug and unplugging', () => {
  it('no pad connected: nothing happens and nothing throws', () => {
    const { input } = setup();
    const f = input.sample();
    expect([f.move.x, f.jumpHeld]).toEqual([0, false]);
  });

  it('a pad that appears later is picked up on the next tick', () => {
    const { input, pads } = setup(null, null);
    expect(input.sample().jumpHeld).toBe(false);
    const pad = new FakePad().press(PAD.A);
    pads[1] = pad;
    expect(input.sample().jumpPressed).toBe(true);
  });

  it('a pad that disconnects releases everything it held: the hero never keeps running', () => {
    const pad = new FakePad();
    const { input, handle } = setup(pad);
    pad.stick(1, 0).press(PAD.A).press(PAD.X);
    input.sample();
    expect(handle.connected).toBe(true);
    pad.disconnect();
    const f = input.sample();
    expect([f.move.x, f.jumpHeld, f.jumpReleased, f.attackHeld]).toEqual([0, false, true, false]);
    expect(handle.connected).toBe(false);
  });

  it('a pad removed from the list is the same as unplugged', () => {
    const pad = new FakePad();
    const { input, pads } = setup(pad);
    pad.stick(-1, 0);
    expect(input.sample().move.x).toBe(-1);
    pads[0] = null;
    expect(input.sample().move.x).toBe(0);
  });

  it('reconnecting works, with a clean slate (a button still down on the new pad is a fresh press)', () => {
    const first = new FakePad().press(PAD.A);
    const { input, pads } = setup(first);
    input.sample();
    first.disconnect();
    input.sample();
    const second = new FakePad().press(PAD.A);
    pads[0] = second;
    expect(input.sample().jumpPressed).toBe(true);
  });

  it('with two pads it sticks to the first connected one; the second takes over only when the first goes away', () => {
    const one = new FakePad();
    const two = new FakePad();
    const { input } = setup(one, two);
    one.stick(1, 0);
    two.stick(-1, 0);
    expect(input.sample().move.x).toBe(1);
    expect(input.sample().move.x).toBe(1); // stays on the first
    one.disconnect();
    expect(input.sample().move.x).toBe(-1);
  });

  it('holes and nulls in the provider are skipped', () => {
    const pad = new FakePad().stick(1, 0);
    const { input } = setup(null, undefined as unknown as null, pad);
    expect(input.sample().move.x).toBe(1);
  });

  it('dispose stops polling and lets go of everything', () => {
    const pad = new FakePad().stick(1, 0).press(PAD.A);
    const { input, handle } = setup(pad);
    input.sample();
    handle.dispose();
    const f = input.sample();
    expect([f.move.x, f.jumpHeld]).toEqual([0, false]);
    pad.press(PAD.X);
    expect(input.sample().attackPressed).toBe(false);
  });
});

describe('the pad the provider gives is only read, never written', () => {
  it('works with a frozen snapshot shaped like navigator.getGamepads() output', () => {
    const snapshot: PadSnapshot = Object.freeze({
      id: 'frozen',
      connected: true,
      axes: Object.freeze([0.9, 0]),
      buttons: Object.freeze(Array.from({ length: 16 }, (_, i) => Object.freeze({ pressed: i === PAD.A, value: i === PAD.A ? 1 : 0 }))),
    });
    const input = new InputManager();
    attachGamepad(input, () => structuredClone(DEFAULT_BINDINGS), () => [snapshot]);
    const f = input.sample();
    expect([f.jumpPressed, f.move.x > 0.8]).toEqual([true, true]);
  });
});
