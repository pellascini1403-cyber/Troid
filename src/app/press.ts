import { listen } from './dom';
import type { DisposableStore } from '@/core/lifecycle';

/**
 * A press of a button that a finger cannot lose. A tap acts when the finger LIFTS over the button — a tap that began on it and ended on it — and a mouse, a pen or the keyboard act on `click`.
 * The browser does not make a click of every tap: Chromium makes none of a tap that is one of two fingers on the screen (a thumb on Attack, the other on Pause) or that comes soon after a
 * drag on a surface that takes no scrolling (a button taken across the screen, then straight to Save), and a press that is lost for that is the worst kind of bug. A tap that has already acted
 * is not a second press when its click does come. `action` runs once per press; whoever binds it keeps the removal in `store`.
 */
export function onPress(store: DisposableStore, button: HTMLElement, action: () => void): void {
  let armed = -1;
  let acted = Number.NEGATIVE_INFINITY;
  const now = (): number => button.ownerDocument.defaultView?.performance.now() ?? Date.now();
  listen(store, button, 'pointerdown', (e) => {
    armed = e.pointerType === 'touch' ? e.pointerId : -1;
  });
  listen(store, button, 'pointerup', (e) => {
    if (armed !== e.pointerId) return;
    armed = -1;
    const box = button.getBoundingClientRect();
    // the finger lifted over the button (a finger that slid off it changed its mind)
    if (box.width > 0 && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)) return;
    acted = now();
    action();
  });
  listen(store, button, 'pointercancel', () => void (armed = -1));
  listen(store, button, 'click', () => {
    if (now() - acted < 600) return;
    action();
  });
}
