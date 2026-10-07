// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOGS, createTranslator } from '@/i18n';
import { PauseButton, pauseBox } from '@/ui/settings/PauseButton';

/**
 * The entry to the pause menu (docs/GAME-SPEC-2D.md §17): one small icon at the TOP CENTRE — never on the right, where Attack,
 * Dash and Ability are — inside the safe area, that never takes the keyboard focus, holds no text and is never a game press.
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

  const centre = (): number => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(button.root.style.transform)!;
    return Number(m[1]) + 25; // 50 px wide
  };

  it('is one icon with no text of its own: its name is the translator\'s, in both languages', () => {
    expect(host.textContent?.trim()).toBe('');
    expect(host.querySelectorAll('svg')).toHaveLength(1);
    expect(button.root.getAttribute('aria-label')).toBe('Pausa y ajustes');
    tr.setLocale('en');
    expect(button.root.getAttribute('aria-label')).toBe('Pause and settings');
  });

  it('sits at the TOP CENTRE of the usable screen: centred between the left and right insets, below the top inset', () => {
    expect(centre()).toBe(422); // 844 / 2
    button.place(844, 390, { top: 24, right: 47, bottom: 21, left: 47 });
    expect(centre()).toBe(422);
    button.place(844, 390, { top: 0, right: 0, bottom: 0, left: 94 }); // a notch on the left: the middle of what is usable moves
    expect(centre()).toBe(469);
    button.place(844, 390, { top: 24, right: 47, bottom: 21, left: 47 });
    expect(Number(/translate\(-?[\d.]+px, (-?[\d.]+)px\)/.exec(button.root.style.transform)![1])).toBeGreaterThanOrEqual(24);
  });

  it('in a window narrower than the HUD is wide (a phone held upright) it goes right next to the HUD instead of over its bottles (S31)', () => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    button.place(390, 844, none, 0.9);
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(button.root.style.transform)!;
    const x0 = Number(m[1]) + 25 - 25 * 0.9; // the scaled box
    expect(x0, 'clear of the widest HUD (five segments, four bottles: 16 + 206 dp, and a gap)').toBeGreaterThanOrEqual((16 + 206 + 8) * 0.9 - 1);
    expect(x0 + 50 * 0.9, 'and still inside the window').toBeLessThanOrEqual(390);
    // a window that cannot hold both keeps the button at the centre (it never leaves the screen)
    button.place(260, 600, none, 1);
    expect(centre()).toBe(130);
    // wherever the HUD is not in the way it is the middle of what is usable
    button.place(844, 390, none, 1);
    expect(centre()).toBe(422);
  });

  it('is never on the right half of the screen, at any aspect ratio (4:3 … 21:9)', () => {
    for (const [w, h] of [[800, 600], [1280, 720], [844, 390], [1000, 430], [2520, 1080]] as const) {
      button.place(w, h, { top: 0, right: 0, bottom: 0, left: 0 });
      expect(Math.abs(centre() - w / 2), `${w}×${h}`).toBeLessThanOrEqual(1);
    }
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
