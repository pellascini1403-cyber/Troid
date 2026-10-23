// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { PauseButton, pauseBox } from '@/ui/settings/PauseButton';

/**
 * The entry to the pause menu (docs/GAME-SPEC-2D.md §17, docs/PROMPT19-LOG.md): one small icon in the TOP RIGHT corner — clear of the HUD at the top left, and above the fixed controls — inside the safe area, that
 * never takes the keyboard focus, holds no text and is never a game press.
 */
describe('pause button', () => {
  let host: HTMLDivElement;
  let button: PauseButton;
  let presses: number;
  const tr = createTranslator(CATALOGS, 'es');

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    presses = 0;
    button = new PauseButton(host, tr, () => presses++);
    button.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
  });
  afterEach(() => {
    button.dispose();
    tr.setLocale('es');
  });

  /** The box the button is drawn in right now, read from the transform it was given (so the test sees what the screen sees). */
  const drawn = (): { x0: number; y0: number; x1: number; y1: number } => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(button.root.style.transform)!;
    const [left, top, scale] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const cx = left + 25;
    const cy = top + 25;
    return { x0: cx - 25 * scale, y0: cy - 25 * scale, x1: cx + 25 * scale, y1: cy + 25 * scale };
  };
  const none = { top: 0, right: 0, bottom: 0, left: 0 };

  it('is one icon with no text of its own: its name is the translator\'s, in both languages', () => {
    expect(host.textContent?.trim()).toBe('');
    expect(host.querySelectorAll('svg')).toHaveLength(1);
    expect(button.root.getAttribute('aria-label')).toBe('Pausa y ajustes');
    tr.setLocale('en');
    expect(button.root.getAttribute('aria-label')).toBe('Pause and settings');
  });

  it('sits in the TOP RIGHT corner of the usable screen: its edge 8 px from the right and from the top of the safe area, whatever the notch', () => {
    expect(drawn()).toMatchObject({ x1: 844 - 8, y0: 8 });
    button.place(844, 390, { top: 24, right: 47, bottom: 21, left: 47 });
    expect(drawn()).toMatchObject({ x1: 844 - 47 - 8, y0: 24 + 8 });
    button.place(844, 390, { top: 0, right: 94, bottom: 0, left: 0 }); // a notch on the right: the corner of what is usable moves
    expect(drawn().x1).toBe(844 - 94 - 8);
    button.place(844, 390, none, 1.4);
    expect(drawn().x1).toBeCloseTo(844 - 8 * 1.4, 0);
    expect(drawn().y0).toBeCloseTo(8 * 1.4, 0);
  });

  it('what is drawn is what the geometry function says (the touch buttons keep clear of that box)', () => {
    for (const [w, h, scale, hud] of [[844, 390, 1, 1], [390, 844, 0.9, 1.35], [1280, 720, 1.2, 0.85]] as const) {
      button.place(w, h, none, scale, hud);
      const box = pauseBox(w, none, scale, hud);
      expect(drawn().x0).toBeCloseTo(box.x0, 0);
      expect(drawn().y0).toBeCloseTo(box.y0, 0);
      expect(drawn().x1).toBeCloseTo(box.x1, 0);
    }
  });

  it('in a window too narrow for the HUD and the button side by side it stays at the right edge and goes UNDER the HUD, not over its bottles (S31)', () => {
    button.place(340, 740, none, 0.9, 1.35); // a phone held upright, the HUD at its biggest
    const hudBottom = (25.7 + 78.9) * 0.9 * 1.35;
    expect(drawn().y0, 'under the HUD').toBeGreaterThanOrEqual(hudBottom);
    expect(drawn().x1, 'still at the right edge').toBeCloseTo(340 - 8 * 0.9, 0);
    // a window that holds both has it in the corner, the HUD not in the way
    button.place(844, 390, none, 1, 1.35);
    expect(drawn().y0).toBe(8);
  });

  it('is in the top right corner at any aspect ratio (4:3 … 21:9)', () => {
    for (const [w, h] of [[800, 600], [1280, 720], [844, 390], [1000, 430], [2520, 1080]] as const) {
      button.place(w, h, none);
      expect(drawn().x1, `${w}×${h}`).toBeCloseTo(w - 8, 0);
      expect(drawn().y0, `${w}×${h}`).toBeCloseTo(8, 0);
    }
  });

  it('a tap presses it even when the browser makes no click of it — a thumb is on Attack and the other presses Pause (two fingers on the screen: no click) — and a tap with its click is one press, not two', () => {
    const pointer = (type: string, id: number): PointerEvent => new PointerEvent(type, { pointerId: id, clientX: 0, clientY: 0, bubbles: true, cancelable: true, pointerType: 'touch' });
    host.dispatchEvent(pointer('pointerdown', 1)); // the first finger: somewhere else on the screen
    button.root.dispatchEvent(pointer('pointerdown', 2));
    button.root.dispatchEvent(pointer('pointerup', 2));
    expect(presses).toBe(1);
    button.root.dispatchEvent(pointer('pointerdown', 3));
    button.root.dispatchEvent(pointer('pointerup', 3));
    button.root.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); // …the click that does come after it
    expect(presses).toBe(2);
    // a touch that was cancelled, or that began somewhere else, is no press
    button.root.dispatchEvent(pointer('pointerdown', 4));
    button.root.dispatchEvent(pointer('pointercancel', 4));
    button.root.dispatchEvent(pointer('pointerup', 4));
    button.root.dispatchEvent(pointer('pointerup', 5));
    expect(presses).toBe(2);
  });

  it('a click presses it; it never takes the keyboard focus (a Space that jumps must not also click it)', () => {
    expect(button.root.tabIndex).toBe(-1);
    button.root.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(presses).toBe(1);
    const down = new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true });
    button.root.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true); // no focus, no selection
    expect(button.root.dataset['pressed']).toBe('1');
    button.root.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(button.root.dataset['pressed']).toBe('0');
  });

  it('catches a finger (the interface layer lets everything through except what asks for it)', () => {
    expect(getComputedStyle(button.root).pointerEvents).toBe('auto');
  });

  it('is UI: a mouse click on it is never an attack', () => {
    expect(button.root.hasAttribute('data-ui-block')).toBe(true);
  });

  it('steps out of the way while the menu is open', () => {
    button.setHidden(true);
    expect(button.root.style.visibility).toBe('hidden');
    button.setHidden(false);
    expect(button.root.style.visibility).toBe('visible');
  });

  it('the HUD at the size the player chose reaches the button only in a window it fills: there the button is lower the bigger the HUD, and never over it', () => {
    const at = (w: number, hud: number): { x0: number; y0: number } => {
      button.place(w, 844, none, 1, hud);
      return pauseBox(w, none, 1, hud);
    };
    // a wide window: the HUD never gets to the corner, so its size changes nothing
    expect(at(1280, 1.35)).toEqual(at(1280, 0.85));
    // a narrow one: the bigger the HUD, the lower the button — and it clears the HUD either beside it or under it
    expect(at(330, 0.85).y0).toBeLessThanOrEqual(at(330, 1).y0);
    expect(at(330, 1).y0).toBeLessThanOrEqual(at(330, 1.35).y0);
    for (const hud of [0.85, 1, 1.35]) {
      const box = at(330, hud);
      expect(box.x0 >= (25.7 + 218.4) * hud + 8 || box.y0 >= (25.7 + 78.9) * hud + 8, `at ${hud}`).toBe(true);
    }
    // and what the button was placed with is what the geometry function says
    expect(button.placedFor.hudScale).toBe(1.35);
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px/.exec(button.root.style.transform)!;
    expect(Number(m[1])).toBeCloseTo(pauseBox(330, none, 1, 1.35).x0, 0);
  });

  it('at the design size of the HUD it is where it always was', () => {
    const insets = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const w of [844, 390, 1280]) expect(pauseBox(w, insets, 1, 1)).toEqual(pauseBox(w, insets, 1));
    button.place(844, 390, insets, 1);
    expect(button.placedFor.hudScale).toBe(1);
  });

  it('scales with the controls', () => {
    button.place(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, 1.4);
    expect(button.root.style.transform).toContain('scale(1.4)');
  });

  it('the SCALED button is inside the window at every scale (it grows about its centre: S31, at 1.5 its top edge was 1 px off the screen)', () => {
    for (const scale of [0.9, 1, 1.2, 1.5, 1.6]) {
      for (const top of [0, 24, 47]) {
        const insets = { top, right: 0, bottom: 0, left: 0 };
        button.place(844, 390, insets, scale);
        const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(button.root.style.transform)!;
        const cy = Number(m[2]) + 25;
        expect(cy - 25 * scale, `top inset ${top} at ×${scale}`).toBeGreaterThanOrEqual(top);
        // …and what the function the geometry tests use says is the same box
        const box = pauseBox(844, insets, scale);
        expect(box.y0).toBeCloseTo(cy - 25 * scale, 6);
        expect(box.x1 - box.x0).toBeCloseTo(50 * scale, 6);
      }
    }
  });

  it('dispose removes it and its listeners', () => {
    button.dispose();
    button.root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(presses).toBe(0);
    expect(host.querySelector('.troid-pause')).toBeNull();
  });
});
