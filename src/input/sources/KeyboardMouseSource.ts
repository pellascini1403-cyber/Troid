import type { DisposableStore } from '@/core/lifecycle';
import { listen } from '@/app/dom';
import { ACTIONS, type Action } from '../InputFrame';
import { boundKeyCodes, type Bindings } from '../bindings';
import type { InputManager } from '../InputManager';

const SOURCE = 'keyboard';
const MOUSE = 'mouse';

/** True when the event came from UI that handles its own pointer input (event targets may be window/document). */
function fromBlockedUi(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-ui-block]') !== null;
}

/**
 * Keyboard + mouse → InputManager. All listeners are owned by `store`, so disposing the game removes them.
 * Bindings are read on every event (cheap), so a remap takes effect immediately.
 */
export function attachKeyboardMouse(
  store: DisposableStore,
  input: InputManager,
  bindings: () => Bindings,
  target: Window = window,
): void {
  input.registerSource(SOURCE, 'keyboard');
  input.registerSource(MOUSE, 'keyboard');

  const actionsForKey = (code: string): Action[] => {
    const b = bindings().keyboard;
    return ACTIONS.filter((a) => b[a].includes(code));
  };
  // Several keys can mean ONE action (A and ←, the two Shifts, L and Q, Esc and P): the action stays held while ANY of them is down,
  // so letting go of one never drops what another still holds (S20: found by the input soak).
  const keysDown = new Set<string>();
  const buttonsDown = new Set<number>();
  const heldByKeys = (a: Action): boolean => bindings().keyboard[a].some((c) => keysDown.has(c));
  const heldByMouse = (a: Action): boolean => (bindings().mouse[a] ?? []).some((b) => buttonsDown.has(b));

  /** A key typed into UI that has its own keyboard handling (the settings menu, the debug panel) is not game input — except the pause key, which closes it. */
  const typedIntoUi = (e: KeyboardEvent): boolean => fromBlockedUi(e.target) && !actionsForKey(e.code).includes('pause');

  listen(store, target, 'keydown', (e) => {
    if (typedIntoUi(e)) return;
    if (e.repeat) {
      if (boundKeyCodes(bindings()).has(e.code)) e.preventDefault();
      return;
    }
    const actions = actionsForKey(e.code);
    if (actions.length === 0) return;
    e.preventDefault();
    keysDown.add(e.code);
    for (const a of actions) input.setAction(SOURCE, a, true);
  });

  listen(store, target, 'keyup', (e) => {
    if (typedIntoUi(e)) return;
    const actions = actionsForKey(e.code);
    if (actions.length === 0) return;
    e.preventDefault();
    keysDown.delete(e.code);
    for (const a of actions) input.setAction(SOURCE, a, heldByKeys(a));
  });

  const mouseActions = (button: number): Action[] => {
    const b = bindings().mouse;
    return ACTIONS.filter((a) => b[a]?.includes(button));
  };
  listen(store, target, 'mousedown', (e) => {
    const actions = mouseActions(e.button);
    if (actions.length === 0) return;
    // Only game-surface clicks: UI buttons / the debug panel keep their own mouse handling.
    if (fromBlockedUi(e.target)) return;
    buttonsDown.add(e.button);
    for (const a of actions) input.setAction(MOUSE, a, true);
  });
  listen(store, target, 'mouseup', (e) => {
    buttonsDown.delete(e.button);
    for (const a of mouseActions(e.button)) input.setAction(MOUSE, a, heldByMouse(a));
  });
  // Mouse2 is "ability": never open the browser context menu over the game.
  listen(store, target, 'contextmenu', (e) => {
    if (!fromBlockedUi(e.target)) e.preventDefault();
  });

  // Losing focus must never leave a key "stuck" down (alt-tab, devtools, a dialog).
  const releaseAll = () => {
    keysDown.clear();
    buttonsDown.clear();
    input.releaseSource(SOURCE);
    input.releaseSource(MOUSE);
  };
  listen(store, target, 'blur', releaseAll);
  listen(store, document, 'visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
}
