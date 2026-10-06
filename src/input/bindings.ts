import type { Action } from './InputFrame';

/**
 * Device bindings as DATA. Remapping (settings screen, accessibility) = editing this object and saving it;
 * nothing in gameplay or in the input manager hard-codes a key.
 *
 * Keyboard uses `KeyboardEvent.code` (physical position: WASD stays WASD on AZERTY keyboards).
 * Mouse uses `MouseEvent.button` (0 = primary, 2 = secondary).
 * Gamepad uses the "standard" mapping indices (0 = A/✕, 1 = B/○, 2 = X/□, 3 = Y/△, 4 = LB, 5 = RB, 6 = LT, 7 = RT,
 * 9 = Start, 12–15 = D-pad). The left stick (axes 0 and 1) moves; it is not a button binding.
 *
 * The mapping is the one of docs/GAME-SPEC-2D.md §4.2. Dropping through a one-way platform is "down + jump" on keyboard and
 * gamepad (it needs no binding of its own: `drop` has none by default) and a flick on touch.
 */
export interface Bindings {
  keyboard: Record<Action, string[]>;
  mouse: Partial<Record<Action, number[]>>;
  gamepad: {
    buttons: Partial<Record<Action, number[]>>;
    /** Left stick dead zone (0..1). */
    deadZone: number;
  };
}

export const DEFAULT_BINDINGS: Bindings = {
  keyboard: {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    jump: ['Space'],
    attack: ['KeyJ'],
    dash: ['ShiftLeft', 'ShiftRight'],
    ability: ['KeyK'],
    bottle: ['KeyL', 'KeyQ'],
    interact: ['KeyE'],
    drop: [],
    pause: ['Escape', 'KeyP'],
    // Holding this halves horizontal speed so keyboard players can also walk (analog devices walk by tilting).
    walk: ['ControlLeft'],
  },
  mouse: {
    attack: [0],
    ability: [2],
  },
  gamepad: {
    buttons: {
      jump: [0],
      attack: [2],
      dash: [1, 5],
      ability: [3],
      bottle: [4],
      interact: [6],
      pause: [9],
      up: [12],
      down: [13],
      left: [14],
      right: [15],
    },
    deadZone: 0.22,
  },
};

/** Keys the game consumes: the browser's default action (scroll on Space, find on Ctrl+F…) is suppressed for these. */
export function boundKeyCodes(bindings: Bindings): Set<string> {
  const set = new Set<string>();
  for (const codes of Object.values(bindings.keyboard)) for (const c of codes) set.add(c);
  return set;
}
