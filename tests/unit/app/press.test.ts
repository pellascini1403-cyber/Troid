// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onPress } from '@/app/press';
import { DisposableStore } from '@/core/lifecycle';

/** A press of a button that a finger cannot lose (docs/PROMPT15-LOG.md): the browser makes no click of a tap that is one of two fingers, or that comes soon after a drag on a surface that takes no scrolling. */
describe('onPress', () => {
  let store: DisposableStore;
  let button: HTMLButtonElement;
  let presses: number;
  const pointer = (type: string, id: number, kind = 'touch', x = 0, y = 0): PointerEvent => new PointerEvent(type, { pointerId: id, pointerType: kind, clientX: x, clientY: y, bubbles: true, cancelable: true });

  beforeEach(() => {
    document.body.innerHTML = '';
    store = new DisposableStore();
    button = document.createElement('button');
    document.body.appendChild(button);
    presses = 0;
    onPress(store, button, () => void presses++);
  });
  afterEach(() => store.dispose());

  it('a tap acts when the finger lifts, with no click at all', () => {
    button.dispatchEvent(pointer('pointerdown', 1));
    button.dispatchEvent(pointer('pointerup', 1));
    expect(presses).toBe(1);
  });

  it('a tap and its click are ONE press; the next tap is the next press', () => {
    for (let i = 0; i < 3; i++) {
      button.dispatchEvent(pointer('pointerdown', 10 + i));
      button.dispatchEvent(pointer('pointerup', 10 + i));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(presses).toBe(i + 1);
    }
  });

  it('a click that has no tap before it (a mouse, a pen, the keyboard\'s Enter and Space) is a press', () => {
    button.click();
    button.dispatchEvent(pointer('pointerdown', 1, 'mouse'));
    button.dispatchEvent(pointer('pointerup', 1, 'mouse'));
    expect(presses, 'a mouse button acts on its click, not on the lift').toBe(1);
    button.click();
    expect(presses).toBe(2);
  });

  it('a touch that was cancelled, or that began elsewhere, or that lifted somewhere else, is not a press', () => {
    button.dispatchEvent(pointer('pointerdown', 1));
    button.dispatchEvent(pointer('pointercancel', 1));
    button.dispatchEvent(pointer('pointerup', 1));
    button.dispatchEvent(pointer('pointerup', 2)); // never went down on it
    expect(presses).toBe(0);
    // lifted outside the box of the button (where there is a box): the finger changed its mind
    button.getBoundingClientRect = () => ({ left: 10, top: 10, right: 60, bottom: 40, width: 50, height: 30, x: 10, y: 10, toJSON: () => ({}) });
    button.dispatchEvent(pointer('pointerdown', 3, 'touch', 20, 20));
    button.dispatchEvent(pointer('pointerup', 3, 'touch', 200, 200));
    expect(presses).toBe(0);
    button.dispatchEvent(pointer('pointerdown', 4, 'touch', 20, 20));
    button.dispatchEvent(pointer('pointerup', 4, 'touch', 30, 30));
    expect(presses).toBe(1);
  });

  it('two fingers: one holds something else, the other taps the button — the press is not lost', () => {
    document.body.dispatchEvent(pointer('pointerdown', 1));
    button.dispatchEvent(pointer('pointerdown', 2));
    button.dispatchEvent(pointer('pointerup', 2));
    document.body.dispatchEvent(pointer('pointerup', 1));
    expect(presses).toBe(1);
  });

  it('is removed with its store', () => {
    store.dispose();
    button.dispatchEvent(pointer('pointerdown', 1));
    button.dispatchEvent(pointer('pointerup', 1));
    button.click();
    expect(presses).toBe(0);
  });
});
