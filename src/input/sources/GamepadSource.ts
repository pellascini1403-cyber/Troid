import { ACTIONS, type Action } from '../InputFrame';
import type { Bindings } from '../bindings';
import type { InputManager } from '../InputManager';

/** The part of a `GamepadButton` the game reads. */
export interface PadButton {
  readonly pressed: boolean;
  readonly value: number;
}

/**
 * The part of a `Gamepad` the game reads — structurally what `navigator.getGamepads()` returns, so the browser's objects fit,
 * and so does a fake one: the tests and the E2E drive the game with a synthetic pad (no device needed).
 */
export interface PadSnapshot {
  readonly id?: string;
  readonly connected: boolean;
  readonly axes: ArrayLike<number>;
  readonly buttons: ArrayLike<PadButton>;
}

/** Where the pads come from: the browser's list (`browserPads`), or a synthetic one. */
export type PadProvider = () => ArrayLike<PadSnapshot | null | undefined>;

export const browserPads: PadProvider = () =>
  typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];

export interface GamepadHandle {
  /** A pad is connected and is the one in use. */
  readonly connected: boolean;
  dispose(): void;
}

const SOURCE = 'gamepad';
/** Standard-mapping axes: 0 / 1 = left stick (y grows DOWNWARDS in the Gamepad API). */
const AXIS_X = 0;
const AXIS_Y = 1;
/** An analog trigger counts as pressed past this (browsers differ on when they set `pressed` for triggers). */
const TRIGGER_PRESS = 0.5;

/**
 * Gamepad → InputManager, through the SAME abstraction as the keyboard and the touch layer (no parallel gameplay path): the
 * left stick becomes an analog movement vector (`radial`: it never leaves the unit disc), every button of
 * `bindings.gamepad.buttons` becomes the logical action it is bound to (the D-pad is just four digital directions), and the
 * simulation only ever sees an `InputFrame` (docs/GAME-SPEC-2D.md §4.2).
 *
 *  - The stick has a RADIAL dead zone (`bindings.gamepad.deadZone`, 0.22): inside it the stick reads 0, outside the rest is
 *    rescaled so the movement starts from nothing and still reaches 1 (a gentle tilt walks, a firm push runs).
 *  - The pad in use is the first connected one and sticks to it; when it disconnects (or the browser reports it gone)
 *    everything it held is released at once — a pulled cable never leaves the hero running.
 *  - It is POLLED: the manager runs `poll` at the start of every `sample()`, i.e. once per simulation tick.
 *    (A button pressed and released between two ticks cannot be seen: that is the nature of the Gamepad API.)
 */
export function attachGamepad(input: InputManager, bindings: () => Bindings, pads: PadProvider = browserPads): GamepadHandle {
  input.registerSource(SOURCE, 'gamepad', 'radial');
  const down = new Map<Action, boolean>();
  let active: PadSnapshot | null = null;

  const pick = (): PadSnapshot | null => {
    const list = pads();
    if (active) {
      // sticky: keep the pad in use while the provider still reports it connected
      for (let i = 0; i < list.length; i++) if (list[i] === active && active.connected) return active;
    }
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p && p.connected) return p;
    }
    return null;
  };

  const poll = (): void => {
    const pad = pick();
    if (pad !== active) {
      if (active) release();
      active = pad;
    }
    if (!pad) return;
    const b = bindings().gamepad;

    // ---- left stick: radial dead zone, y flipped so that up is positive like everywhere else ----
    const rx = finite(pad.axes[AXIS_X]);
    const ry = -finite(pad.axes[AXIS_Y]);
    const len = Math.hypot(rx, ry);
    if (len <= b.deadZone) {
      input.setAxis(SOURCE, 0, 0);
    } else {
      const k = (Math.min(len, 1) - b.deadZone) / (1 - b.deadZone) / len;
      input.setAxis(SOURCE, rx * k, ry * k);
    }

    // ---- buttons: every logical action bound to this pad ----
    for (const action of ACTIONS) {
      const indices = b.buttons[action];
      if (!indices) continue;
      let pressed = false;
      for (const i of indices) {
        const btn = pad.buttons[i];
        if (btn && (btn.pressed || btn.value > TRIGGER_PRESS)) {
          pressed = true;
          break;
        }
      }
      if ((down.get(action) ?? false) !== pressed) {
        down.set(action, pressed);
        input.setAction(SOURCE, action, pressed);
      }
    }
  };

  const release = (): void => {
    down.clear();
    input.releaseSource(SOURCE);
  };

  const remove = input.addPoller(poll);
  return {
    get connected() {
      return active !== null;
    },
    dispose() {
      remove();
      release();
      active = null;
    },
  };
}

function finite(v: number | undefined): number {
  return v !== undefined && Number.isFinite(v) ? v : 0;
}
