import type { PadButton, PadProvider, PadSnapshot } from '@/input/sources/GamepadSource';

/** Standard-mapping button indices (docs/GAME-SPEC-2D.md §4.2). */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/**
 * An ABSTRACT gamepad: the driver of the tests and of the E2E. It has the shape of what `navigator.getGamepads()` returns
 * and is moved by hand — no physical pad anywhere.
 */
export class FakePad implements PadSnapshot {
  connected = true;
  readonly axes: number[] = [0, 0, 0, 0];
  readonly buttons: Array<{ pressed: boolean; value: number }> = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));

  constructor(readonly id = 'Fake Standard Pad') {}

  /** The left stick, in the device's own terms: +y is DOWN (the Gamepad API), exactly what a real pad reports. */
  stick(x: number, y: number): this {
    this.axes[0] = x;
    this.axes[1] = y;
    return this;
  }
  press(i: number): this {
    const b = this.buttons[i] as PadButton & { pressed: boolean; value: number };
    b.pressed = true;
    b.value = 1;
    return this;
  }
  release(i: number): this {
    const b = this.buttons[i] as PadButton & { pressed: boolean; value: number };
    b.pressed = false;
    b.value = 0;
    return this;
  }
  /** An analog trigger: `value` without the `pressed` flag (browsers differ on when they raise it). */
  analog(i: number, value: number): this {
    const b = this.buttons[i] as PadButton & { pressed: boolean; value: number };
    b.value = value;
    b.pressed = false;
    return this;
  }
  disconnect(): this {
    this.connected = false;
    return this;
  }
}

/** A provider over a mutable list of pads (hot-plug = editing the list). */
export function padList(...pads: Array<FakePad | null>): { provider: PadProvider; pads: Array<FakePad | null> } {
  const list = [...pads];
  return { provider: () => list, pads: list };
}
