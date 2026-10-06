import type { PadButton, PadSnapshot } from './GamepadSource';

type MutableButton = { pressed: boolean; value: number };

/**
 * An ABSTRACT gamepad with the shape of what `navigator.getGamepads()` returns, moved by hand: the driver of the unit tests,
 * of the integration tests and of the browser E2E (through a test hook), so every level proves the gamepad path without a
 * physical device. It is never created by the game itself.
 */
export class VirtualPad implements PadSnapshot {
  connected = true;
  readonly axes: number[] = [0, 0, 0, 0];
  readonly buttons: Array<PadButton & MutableButton> = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));

  constructor(readonly id = 'Virtual Standard Pad') {}

  /** The left stick in the device's own terms: +y is DOWN (the Gamepad API), exactly what a real pad reports. */
  stick(x: number, y: number): this {
    this.axes[0] = x;
    this.axes[1] = y;
    return this;
  }
  press(i: number): this {
    const b = this.buttons[i];
    if (b) {
      b.pressed = true;
      b.value = 1;
    }
    return this;
  }
  release(i: number): this {
    const b = this.buttons[i];
    if (b) {
      b.pressed = false;
      b.value = 0;
    }
    return this;
  }
  /** An analog trigger: a `value` without the `pressed` flag (browsers differ on when they raise it). */
  analog(i: number, value: number): this {
    const b = this.buttons[i];
    if (b) {
      b.value = value;
      b.pressed = false;
    }
    return this;
  }
  /** Releases every button and centres the stick (the pad is still connected). */
  neutral(): this {
    this.axes.fill(0);
    for (const b of this.buttons) {
      b.pressed = false;
      b.value = 0;
    }
    return this;
  }
  disconnect(): this {
    this.connected = false;
    return this;
  }
}
