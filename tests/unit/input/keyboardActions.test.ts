// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DisposableStore } from '@/core/lifecycle';
import { InputManager } from '@/input/InputManager';
import { DEFAULT_BINDINGS, type Bindings } from '@/input/bindings';
import { attachKeyboardMouse } from '@/input/sources/KeyboardMouseSource';

const key = (type: 'keydown' | 'keyup', code: string) => {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

/** The actions Prompt 5 added to the keyboard (GAME-SPEC-2D §4.2): bottle on L / Q, interact on E; the diagonals stay raw. */
describe('keyboard: bottle, interact and diagonals', () => {
  let store: DisposableStore;
  let input: InputManager;
  let bindings: Bindings;

  beforeEach(() => {
    store = new DisposableStore();
    input = new InputManager();
    bindings = structuredClone(DEFAULT_BINDINGS);
    attachKeyboardMouse(store, input, () => bindings);
  });
  afterEach(() => store.dispose());

  it('L and Q drink the next ready bottle; the browser default of both is suppressed', () => {
    expect(key('keydown', 'KeyL').defaultPrevented).toBe(true);
    const f = input.sample();
    expect([f.bottlePressed, f.bottleSlot]).toEqual([true, -1]);
    key('keyup', 'KeyL');
    key('keydown', 'KeyQ');
    expect(input.sample().bottlePressed).toBe(true);
  });

  it('E interacts, once per press', () => {
    key('keydown', 'KeyE');
    expect(input.sample().interactPressed).toBe(true);
    expect(input.sample().interactPressed).toBe(false);
    key('keyup', 'KeyE');
  });

  it('S + D is (1, −1) on a real key press: the run speed does not depend on the vertical key', () => {
    key('keydown', 'KeyD');
    key('keydown', 'KeyS');
    const f = input.sample();
    expect([f.move.x, f.move.y]).toEqual([1, -1]);
    key('keyup', 'KeyS');
    key('keydown', 'KeyW');
    const g = input.sample();
    expect([g.move.x, g.move.y]).toEqual([1, 1]);
  });

  it('remapping the new actions is data too', () => {
    bindings.keyboard.interact = ['KeyF'];
    key('keydown', 'KeyE');
    expect(input.sample().interactPressed).toBe(false);
    key('keydown', 'KeyF');
    expect(input.sample().interactPressed).toBe(true);
  });
});
