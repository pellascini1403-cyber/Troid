// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisposableStore } from '@/core/lifecycle';
import { InputManager } from '@/input/InputManager';
import { DEFAULT_BINDINGS, type Bindings } from '@/input/bindings';
import { attachKeyboardMouse } from '@/input/sources/KeyboardMouseSource';

const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
};

describe('keyboard + mouse source', () => {
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

  it('maps A/D, Space, J, Shift, K to the logical actions', () => {
    key('keydown', 'KeyD');
    key('keydown', 'Space');
    key('keydown', 'KeyJ');
    key('keydown', 'ShiftLeft');
    key('keydown', 'KeyK');
    const f = input.sample();
    expect(f.move.x).toBe(1);
    expect([f.jumpPressed, f.attackPressed, f.dashPressed, f.abilityPressed]).toEqual([true, true, true, true]);
    key('keyup', 'KeyD');
    key('keyup', 'Space');
    const g = input.sample();
    expect(g.move.x).toBe(0);
    expect(g.jumpReleased).toBe(true);
  });

  it('arrow keys and WASD are interchangeable', () => {
    key('keydown', 'ArrowLeft');
    expect(input.sample().move.x).toBe(-1);
    key('keyup', 'ArrowLeft');
    key('keydown', 'KeyW');
    expect(input.sample().move.y).toBe(1);
  });

  it('suppresses the browser default for bound keys (Space must not scroll the page) and ignores others', () => {
    expect(key('keydown', 'Space').defaultPrevented).toBe(true);
    expect(key('keydown', 'F5').defaultPrevented).toBe(false);
    expect(key('keydown', 'KeyV').defaultPrevented).toBe(false); // (was KeyQ: Q drinks a bottle since S13, GAME-SPEC-2D §4.2)
  });

  it('mouse 1 attacks and mouse 2 uses the ability; the context menu is blocked over the game', () => {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    const f = input.sample();
    expect(f.attackPressed).toBe(true);
    expect(f.abilityPressed).toBe(true);
    const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    window.dispatchEvent(ctx);
    expect(ctx.defaultPrevented).toBe(true);
  });

  it('clicks on UI marked data-ui-block never reach the game', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-ui-block', '');
    document.body.appendChild(btn);
    btn.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(input.sample().attackPressed).toBe(false);
    btn.remove();
  });

  it('keys typed into UI with its own keyboard handling (the settings menu, the debug panel) are not game input — except the pause key, which closes it', () => {
    const slider = document.createElement('div');
    slider.dataset['uiBlock'] = '';
    document.body.appendChild(slider);
    const typed = (type: 'keydown' | 'keyup', code: string): KeyboardEvent => {
      const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
      slider.dispatchEvent(e); // bubbles up to the window the game listens on
      return e;
    };
    const arrow = typed('keydown', 'ArrowRight');
    expect(arrow.defaultPrevented).toBe(false); // the slider keeps its own arrow keys
    typed('keydown', 'Space');
    typed('keydown', 'KeyD');
    const f = input.sample();
    expect([f.move.x, f.jumpPressed]).toEqual([0, false]);
    typed('keydown', 'Escape'); // the pause key still reaches the game: it closes the menu
    expect(input.sample().pausePressed).toBe(true);
    slider.remove();
  });

  it('losing focus releases every key (no stuck movement after alt-tab)', () => {
    key('keydown', 'KeyD');
    key('keydown', 'KeyJ');
    input.sample();
    window.dispatchEvent(new Event('blur'));
    const f = input.sample();
    expect(f.move.x).toBe(0);
    expect(f.attackHeld).toBe(false);
  });

  it('remapping is just data: change the binding and the new key works immediately', () => {
    bindings.keyboard.jump = ['KeyZ'];
    key('keydown', 'Space');
    expect(input.sample().jumpPressed).toBe(false);
    key('keydown', 'KeyZ');
    expect(input.sample().jumpPressed).toBe(true);
  });

  it('disposing removes every listener: later events do nothing', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const store2 = new DisposableStore();
    const input2 = new InputManager();
    attachKeyboardMouse(store2, input2, () => bindings);
    const added = add.mock.calls.length;
    expect(added).toBeGreaterThanOrEqual(6);
    store2.dispose();
    key('keydown', 'KeyD');
    expect(input2.sample().move.x).toBe(0);
    add.mockRestore();
  });
});
